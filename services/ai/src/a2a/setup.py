"""Mount A2A sub-apps for exposed agents on the FastAPI application."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import AsyncExitStack, asynccontextmanager
from typing import Any

import structlog
from fastapi import FastAPI
from starlette.middleware import Middleware

from fasta2a import FastA2A, Skill
from fasta2a.broker import InMemoryBroker

from src.a2a.auth import A2AAuthMiddleware, ApiKeyStorage
from src.a2a.worker import MiraiAgentWorker

log = structlog.get_logger()

# Collected during setup, started during app lifespan
_a2a_apps: list[tuple[FastA2A, MiraiAgentWorker]] = []


@asynccontextmanager
async def _noop_lifespan(app: FastA2A) -> AsyncIterator[None]:
    """No-op lifespan — lifecycle managed by parent app."""
    yield


def mount_a2a_agents(app: FastAPI, *, base_url: str) -> None:
    """Mount A2A sub-apps for all agents with expose_a2a=True.

    Each exposed agent gets its own FastA2A ASGI sub-app with:
    - GET /.well-known/agent-card.json (auto-generated)
    - POST / (JSON-RPC: message/send, tasks/get)

    Lifecycle is managed via the parent FastAPI app's lifespan.
    """
    from src.agents.registry import AgentRegistry

    specs = AgentRegistry.list_specs(expose_a2a=True)
    if not specs:
        log.warning("a2a_no_agents_exposed")
        return

    mounted: list[dict[str, Any]] = []
    _a2a_apps.clear()

    for spec in specs:
        storage = ApiKeyStorage()
        broker = InMemoryBroker()

        worker = MiraiAgentWorker(
            agent_name=spec.name,
            broker=broker,
            storage=storage,
        )

        skill = Skill(
            id=spec.name,
            name=spec.name,
            description=spec.description,
            tags=list(spec.tags),
            input_modes=["application/json"],
            output_modes=["application/json"],
        )

        a2a_app = FastA2A(
            storage=storage,
            broker=broker,
            name=spec.name,
            url=f"{base_url}/a2a/{spec.name}",
            version="1.0.0",
            description=spec.description,
            skills=[skill],
            middleware=[Middleware(A2AAuthMiddleware)],
            lifespan=_noop_lifespan,
        )

        _a2a_apps.append((a2a_app, worker))

        mount_path = f"/a2a/{spec.name}"
        app.mount(mount_path, a2a_app)

        mounted.append({
            "name": spec.name,
            "path": mount_path,
            "description": spec.description,
            "tags": list(spec.tags),
            "category": spec.category.value,
        })

        log.info("a2a_agent_mounted", agent=spec.name, path=mount_path)

    # Wrap the existing app lifespan to also manage A2A lifecycle
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def wrapped_lifespan(app_instance: FastAPI) -> AsyncIterator[dict[str, Any]]:
        async with AsyncExitStack() as stack:
            # Start original lifespan
            state = {}
            if original_lifespan is not None:
                ctx = original_lifespan(app_instance)
                maybe_state = await stack.enter_async_context(ctx)
                if isinstance(maybe_state, dict):
                    state = maybe_state

            # Start all A2A task managers and workers
            for a2a, wkr in _a2a_apps:
                await stack.enter_async_context(a2a.task_manager)
                await stack.enter_async_context(wkr.run())

            log.info("a2a_lifecycle_started", count=len(_a2a_apps))
            yield state

    app.router.lifespan_context = wrapped_lifespan

    # Register catalog endpoint
    @app.get("/a2a/catalog")
    async def a2a_catalog() -> list[dict[str, Any]]:
        return mounted

    log.info("a2a_setup_complete", agent_count=len(mounted))
