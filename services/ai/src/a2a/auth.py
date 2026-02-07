"""A2A authentication middleware and API key storage.

A2AAuthMiddleware extracts Bearer tokens from POST requests.
ApiKeyStorage wraps InMemoryStorage, capturing the API key at submit_task()
time (HTTP handler context) and making it available to the Worker later.
"""

from __future__ import annotations

import json
from contextvars import ContextVar
from typing import Any

from starlette.types import ASGIApp, Receive, Scope, Send

from fasta2a.schema import Artifact, Message, Task, TaskState
from fasta2a.storage import InMemoryStorage, Storage

# ContextVar set by the middleware, read by ApiKeyStorage.submit_task()
_current_api_key: ContextVar[str] = ContextVar("_current_api_key")


class A2AAuthMiddleware:
    """ASGI middleware that extracts Bearer token from Authorization header.

    - GET/HEAD/OPTIONS pass through (agent card discovery).
    - POST requires Authorization: Bearer <gemini-api-key>.
    - Sets _current_api_key ContextVar for downstream storage.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        if method in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return

        # Extract Bearer token from headers
        headers = dict(scope.get("headers", []))
        auth_header = headers.get(b"authorization", b"").decode()

        if not auth_header.startswith("Bearer ") or len(auth_header) <= 7:
            await self._send_json_rpc_error(
                send,
                code=-32000,
                message="Authorization required: Bearer <api-key>",
                status=401,
            )
            return

        api_key = auth_header[7:]
        token = _current_api_key.set(api_key)
        try:
            await self.app(scope, receive, send)
        finally:
            _current_api_key.reset(token)

    @staticmethod
    async def _send_json_rpc_error(
        send: Send, *, code: int, message: str, status: int
    ) -> None:
        body = json.dumps(
            {"jsonrpc": "2.0", "id": None, "error": {"code": code, "message": message}}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(body)).encode()],
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})


class ApiKeyStorage(Storage[Any]):
    """Wraps InMemoryStorage, capturing API key from ContextVar at submit_task().

    The InMemoryBroker dispatches tasks via anyio memory streams which cross
    task boundaries — ContextVars don't propagate. This wrapper captures the
    API key at submit_task() time (runs in the HTTP handler context) and stores
    a task_id → api_key mapping for the Worker to retrieve later.
    """

    def __init__(self) -> None:
        self._inner = InMemoryStorage()
        self._api_keys: dict[str, str] = {}

    async def load_task(self, task_id: str, history_length: int | None = None) -> Task | None:
        return await self._inner.load_task(task_id, history_length)

    async def submit_task(self, context_id: str, message: Message) -> Task:
        task = await self._inner.submit_task(context_id, message)
        # Capture the API key from the ContextVar set by the middleware
        try:
            api_key = _current_api_key.get()
            self._api_keys[task["id"]] = api_key
        except LookupError:
            pass  # No API key in context (shouldn't happen with middleware)
        return task

    async def update_task(
        self,
        task_id: str,
        state: TaskState,
        new_artifacts: list[Artifact] | None = None,
        new_messages: list[Message] | None = None,
    ) -> Task:
        return await self._inner.update_task(task_id, state, new_artifacts, new_messages)

    async def load_context(self, context_id: str) -> Any | None:
        return await self._inner.load_context(context_id)

    async def update_context(self, context_id: str, context: Any) -> None:
        await self._inner.update_context(context_id, context)

    def get_api_key(self, task_id: str) -> str:
        """Retrieve the API key captured at submit time."""
        if task_id not in self._api_keys:
            raise KeyError(f"No API key stored for task {task_id}")
        return self._api_keys[task_id]

    def cleanup_task(self, task_id: str) -> None:
        """Remove API key mapping after task completion."""
        self._api_keys.pop(task_id, None)
