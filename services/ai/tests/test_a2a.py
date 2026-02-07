"""Tests for A2A (Agent-to-Agent) protocol exposure.

Pre-seeds sys.modules to import src.agents.registry without triggering
the full agent registration chain (which pulls in heavy dependencies).
"""

from __future__ import annotations

# Pre-seed src.agents to prevent __init__.py from running on import
import sys
import types

if "src.agents" not in sys.modules:
    import pathlib

    _agents_dir = str(pathlib.Path(__file__).resolve().parent.parent / "src" / "agents")
    _ph = types.ModuleType("src.agents")
    _ph.__path__ = [_agents_dir]  # type: ignore[attr-defined]
    _ph.__package__ = "src.agents"
    sys.modules["src.agents"] = _ph

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from asgi_lifespan import LifespanManager
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pydantic import BaseModel

from src.a2a.setup import mount_a2a_agents
from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec


class MockOutput(BaseModel):
    summary: str
    suggestions: list[str] = []


MOCK_SPEC = AgentSpec(
    name="test-a2a-agent",
    system_prompt="You are a test agent.",
    output_type=MockOutput,
    category=AgentCategory.UTILITY,
    description="A test agent for A2A.",
    tags=["test"],
    expose_a2a=True,
)


@pytest.fixture(autouse=True)
def _clean_registry():
    from src.a2a.setup import _a2a_apps

    AgentRegistry.clear()
    _a2a_apps.clear()
    yield
    AgentRegistry.clear()
    _a2a_apps.clear()


def _build_json_rpc_send(text: str) -> dict:
    """Build a JSON-RPC message/send request."""
    return {
        "jsonrpc": "2.0",
        "id": "req-1",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "kind": "message",
                "messageId": "msg-1",
                "parts": [{"kind": "text", "text": text}],
            }
        },
    }


def _build_json_rpc_get(task_id: str) -> dict:
    """Build a JSON-RPC tasks/get request."""
    return {
        "jsonrpc": "2.0",
        "id": "req-2",
        "method": "tasks/get",
        "params": {"id": task_id},
    }


async def _create_app() -> FastAPI:
    """Create a FastAPI app with A2A mounted."""
    app = FastAPI()
    AgentRegistry.register(MOCK_SPEC)
    mount_a2a_agents(app, base_url="http://test-host:8080")
    return app


@pytest.mark.asyncio
async def test_agent_card_returns_200():
    """GET agent card without auth succeeds."""
    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/a2a/test-a2a-agent/.well-known/agent-card.json")
            assert resp.status_code == 200
            data = resp.json()
            assert data["name"] == "test-a2a-agent"
            assert data["url"] == "http://test-host:8080/a2a/test-a2a-agent"
            assert data["version"] == "1.0.0"
            assert len(data["skills"]) == 1
            assert data["skills"][0]["id"] == "test-a2a-agent"


@pytest.mark.asyncio
async def test_catalog_returns_all_exposed():
    """GET /a2a/catalog lists all mounted agents."""
    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/a2a/catalog")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["name"] == "test-a2a-agent"
            assert data[0]["path"] == "/a2a/test-a2a-agent"
            assert data[0]["description"] == "A test agent for A2A."


@pytest.mark.asyncio
async def test_post_without_auth_returns_401():
    """POST without Bearer token returns 401."""
    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/a2a/test-a2a-agent/",
                json=_build_json_rpc_send("hello"),
            )
            assert resp.status_code == 401
            data = resp.json()
            assert data["error"]["code"] == -32000


@pytest.mark.asyncio
async def test_post_with_empty_bearer_returns_401():
    """POST with empty Bearer returns 401."""
    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/a2a/test-a2a-agent/",
                json=_build_json_rpc_send("hello"),
                headers={"Authorization": "Bearer "},
            )
            assert resp.status_code == 401


@pytest.mark.asyncio
async def test_message_send_runs_agent():
    """Full flow: POST with Bearer + mock agent → task completed with artifact."""
    mock_output = MockOutput(summary="Looks good", suggestions=["Fix spacing"])
    mock_result = MagicMock()
    mock_result.output = mock_output

    mock_agent = AsyncMock()
    mock_agent.run = AsyncMock(return_value=mock_result)

    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch.object(AgentRegistry, "get", return_value=mock_agent):
                # Send message
                resp = await client.post(
                    "/a2a/test-a2a-agent/",
                    json=_build_json_rpc_send("Review this component"),
                    headers={"Authorization": "Bearer test-api-key-123"},
                )
                assert resp.status_code == 200
                data = resp.json()
                task_id = data["result"]["id"]
                assert data["result"]["status"]["state"] == "submitted"

                # Poll for completion (worker runs async in background)
                for _ in range(20):
                    await asyncio.sleep(0.1)
                    poll_resp = await client.post(
                        "/a2a/test-a2a-agent/",
                        json=_build_json_rpc_get(task_id),
                        headers={"Authorization": "Bearer test-api-key-123"},
                    )
                    poll_data = poll_resp.json()
                    if poll_data["result"]["status"]["state"] == "completed":
                        break

                assert poll_data["result"]["status"]["state"] == "completed"
                artifacts = poll_data["result"]["artifacts"]
                assert len(artifacts) == 1
                assert artifacts[0]["parts"][0]["kind"] == "data"
                assert artifacts[0]["parts"][0]["data"]["summary"] == "Looks good"


@pytest.mark.asyncio
async def test_agent_failure_marks_task_failed():
    """Agent raises exception → task state 'failed'."""
    mock_agent = AsyncMock()
    mock_agent.run = AsyncMock(side_effect=RuntimeError("Model error"))

    app = await _create_app()
    async with LifespanManager(app):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            with patch.object(AgentRegistry, "get", return_value=mock_agent):
                resp = await client.post(
                    "/a2a/test-a2a-agent/",
                    json=_build_json_rpc_send("Review this"),
                    headers={"Authorization": "Bearer test-api-key-123"},
                )
                assert resp.status_code == 200
                task_id = resp.json()["result"]["id"]

                for _ in range(20):
                    await asyncio.sleep(0.1)
                    poll_resp = await client.post(
                        "/a2a/test-a2a-agent/",
                        json=_build_json_rpc_get(task_id),
                        headers={"Authorization": "Bearer test-api-key-123"},
                    )
                    poll_data = poll_resp.json()
                    if poll_data["result"]["status"]["state"] == "failed":
                        break

                assert poll_data["result"]["status"]["state"] == "failed"
