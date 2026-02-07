"""MiraiAgentWorker — runs pydantic-ai agents via A2A protocol.

One worker instance per exposed agent. Retrieves the API key from
ApiKeyStorage, builds a per-request GoogleModel, and executes the agent.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

import structlog
from pydantic import BaseModel

from fasta2a import Broker, Worker
from fasta2a.schema import Artifact, DataPart, Message, TaskIdParams, TaskSendParams, TextPart

from src.a2a.auth import ApiKeyStorage

log = structlog.get_logger()


@dataclass
class MiraiAgentWorker(Worker[Any]):
    """Worker that runs a named pydantic-ai agent for each A2A task."""

    agent_name: str = ""
    broker: Broker = field(default=None)  # type: ignore[assignment]
    storage: ApiKeyStorage = field(default=None)  # type: ignore[assignment]

    async def run_task(self, params: TaskSendParams) -> None:
        task_id = params["id"]
        log.info("a2a_task_started", agent=self.agent_name, task_id=task_id)

        try:
            # 1. Get API key captured at submit time
            api_key = self.storage.get_api_key(task_id)

            # 2. Extract text from message parts
            text = self._extract_text(params["message"])

            # 3. Update state to working
            await self.storage.update_task(task_id, state="working")

            # 4. Get agent and build model (lazy imports to avoid triggering
            #    full agent registration at import time)
            from src.agents.model import make_model
            from src.agents.registry import AgentRegistry

            agent = AgentRegistry.get(self.agent_name)
            model = make_model(api_key)

            # 5. Run agent
            result = await agent.run(text, model=model)

            # 6. Build artifacts from result
            artifacts = self.build_artifacts(result.output)

            # 7. Mark completed
            await self.storage.update_task(
                task_id, state="completed", new_artifacts=artifacts
            )

            log.info("a2a_task_completed", agent=self.agent_name, task_id=task_id)

        except Exception:
            log.exception("a2a_task_failed", agent=self.agent_name, task_id=task_id)
            await self.storage.update_task(task_id, state="failed")
        finally:
            self.storage.cleanup_task(task_id)

    async def cancel_task(self, params: TaskIdParams) -> None:
        task_id = params["id"]
        await self.storage.update_task(task_id, state="canceled")
        self.storage.cleanup_task(task_id)

    def build_message_history(self, history: list[Message]) -> list[Any]:
        """Convert A2A messages to text list for agent context."""
        return [self._extract_text(msg) for msg in history]

    def build_artifacts(self, result: Any) -> list[Artifact]:
        """Convert agent output to A2A Artifact."""
        artifact_id = str(uuid.uuid4())

        if isinstance(result, BaseModel):
            part = DataPart(kind="data", data=result.model_dump())
            return [Artifact(artifact_id=artifact_id, name=type(result).__name__, parts=[part])]

        part = TextPart(kind="text", text=str(result))
        return [Artifact(artifact_id=artifact_id, parts=[part])]

    @staticmethod
    def _extract_text(message: Message) -> str:
        """Extract text content from message parts."""
        parts = []
        for part in message.get("parts", []):
            if part.get("kind") == "text":
                parts.append(part["text"])
        return "\n".join(parts) if parts else ""
