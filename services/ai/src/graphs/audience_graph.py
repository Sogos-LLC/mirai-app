"""Audience personas generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateAudienceNode -> ValidateAudienceNode -> End (valid)
                                                      |-> RefineAudienceNode -> GenerateAudienceNode (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_audience_prompt, audience_agent
from src.graphs.wizard_utils import (
    MAX_WIZARD_RETRIES,
    build_refinement_feedback,
    check_exact_count,
    check_unique_values,
    search_wizard_knowledge,
)
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import AudiencePersona, SMEPersona

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class AudienceState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    personas: list[AudiencePersona] | None = None
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class AudienceDeps:
    api_key: str
    title: str
    description: str
    sme_personas: list[SMEPersona]
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class AudienceResult:
    personas: list[AudiencePersona]
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[AudienceState, AudienceDeps]):
    async def run(
        self, ctx: GraphRunContext[AudienceState, AudienceDeps],
    ) -> "GenerateAudienceNode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.title, deps.description],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateAudienceNode()


@dataclass
class GenerateAudienceNode(BaseNode[AudienceState, AudienceDeps]):
    async def run(
        self, ctx: GraphRunContext[AudienceState, AudienceDeps],
    ) -> "ValidateAudienceNode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_audience_prompt(
            deps.title, deps.description, deps.sme_personas,
            rag_chunks=state.rag_chunks,
        )
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await audience_agent.run(prompt, model=make_model(deps.api_key))
        state.personas = result.output.personas

        log.info("audience_generated", count=len(state.personas), retry=state.retry_count)
        return ValidateAudienceNode()


@dataclass
class ValidateAudienceNode(BaseNode[AudienceState, AudienceDeps]):
    async def run(
        self, ctx: GraphRunContext[AudienceState, AudienceDeps],
    ) -> "RefineAudienceNode | End[AudienceResult]":
        state = ctx.state
        violations: list[str] = []
        assert state.personas is not None

        # Exactly 3 personas
        v = check_exact_count(state.personas, 3, "Audience personas")
        if v:
            violations.append(v)

        # Unique IDs
        ids = [p.id for p in state.personas]
        v = check_unique_values(ids, "Audience persona IDs")
        if v:
            violations.append(v)

        # Unique roles
        roles = [p.role for p in state.personas]
        v = check_unique_values(roles, "Audience persona roles")
        if v:
            violations.append(v)

        # Unique names
        names = [p.name for p in state.personas]
        v = check_unique_values(names, "Audience persona names")
        if v:
            violations.append(v)

        # Each has 2-4 goals
        for p in state.personas:
            if len(p.goals) < 2:
                violations.append(
                    f"Audience '{p.id}' has {len(p.goals)} goals; minimum is 2"
                )
            elif len(p.goals) > 4:
                violations.append(
                    f"Audience '{p.id}' has {len(p.goals)} goals; maximum is 4"
                )

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_WIZARD_RETRIES:
            log.warn("audience_violations", violations=violations, retry=state.retry_count)
            return RefineAudienceNode()

        if violations:
            log.warn("audience_proceeding_with_violations", violations=violations)

        return End(AudienceResult(
            personas=state.personas,
            violations=violations,
            chunks_used=state.chunks_used,
        ))


@dataclass
class RefineAudienceNode(BaseNode[AudienceState, AudienceDeps]):
    async def run(
        self, ctx: GraphRunContext[AudienceState, AudienceDeps],
    ) -> GenerateAudienceNode:
        state = ctx.state
        state.retry_count += 1
        state.refinement_feedback = build_refinement_feedback(
            state.constraint_violations,
        )
        log.info("refining_audience", retry=state.retry_count)
        return GenerateAudienceNode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

audience_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateAudienceNode,
        ValidateAudienceNode,
        RefineAudienceNode,
    ],
)


async def run_audience_graph(
    *,
    api_key: str,
    title: str,
    description: str,
    sme_personas: list[SMEPersona],
    rag_filters: dict[str, str] | None = None,
) -> AudienceResult:
    """Run the audience persona generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = AudienceDeps(
        api_key=api_key,
        title=title,
        description=description,
        sme_personas=sme_personas,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await audience_graph.run(
        SearchKnowledgeNode(),
        state=AudienceState(),
        deps=deps,
    )

    return result.output
