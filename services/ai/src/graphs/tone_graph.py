"""Tone options generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateToneNode -> ValidateToneNode -> End (valid)
                                                  |-> RefineToneNode -> GenerateToneNode (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_tone_prompt, tone_agent
from src.graphs.wizard_utils import (
    MAX_WIZARD_RETRIES,
    build_refinement_feedback,
    check_exact_count,
    check_in_set,
    check_unique_values,
    search_wizard_knowledge,
)
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import AudiencePersona, ToneOption

log = structlog.get_logger()

VALID_DETAIL_LEVELS: set[str] = {"brief", "moderate", "comprehensive"}


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class ToneState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    options: list[ToneOption] | None = None
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class ToneDeps:
    api_key: str
    title: str
    description: str
    audience_personas: list[AudiencePersona]
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class ToneResult:
    options: list[ToneOption]
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[ToneState, ToneDeps]):
    async def run(
        self, ctx: GraphRunContext[ToneState, ToneDeps],
    ) -> "GenerateToneNode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.title, deps.description],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateToneNode()


@dataclass
class GenerateToneNode(BaseNode[ToneState, ToneDeps]):
    async def run(
        self, ctx: GraphRunContext[ToneState, ToneDeps],
    ) -> "ValidateToneNode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_tone_prompt(
            deps.title, deps.description, deps.audience_personas,
            rag_chunks=state.rag_chunks,
        )
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await tone_agent.run(prompt, model=make_model(deps.api_key))
        state.options = result.output.options

        log.info("tone_generated", count=len(state.options), retry=state.retry_count)
        return ValidateToneNode()


@dataclass
class ValidateToneNode(BaseNode[ToneState, ToneDeps]):
    async def run(
        self, ctx: GraphRunContext[ToneState, ToneDeps],
    ) -> "RefineToneNode | End[ToneResult]":
        state = ctx.state
        violations: list[str] = []
        assert state.options is not None

        # Exactly 3 options
        v = check_exact_count(state.options, 3, "Tone options")
        if v:
            violations.append(v)

        # Unique IDs
        ids = [o.id for o in state.options]
        v = check_unique_values(ids, "Tone option IDs")
        if v:
            violations.append(v)

        # Unique names
        names = [o.name for o in state.options]
        v = check_unique_values(names, "Tone option names")
        if v:
            violations.append(v)

        # level_of_detail validation
        detail_levels: list[str] = []
        for o in state.options:
            v = check_in_set(
                o.level_of_detail, VALID_DETAIL_LEVELS,
                f"Tone '{o.id}' level_of_detail",
            )
            if v:
                violations.append(v)
            detail_levels.append(o.level_of_detail.lower().strip())

        # All 3 options must have different detail levels
        v = check_unique_values(detail_levels, "Tone detail levels")
        if v:
            violations.append(v)

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_WIZARD_RETRIES:
            log.warn("tone_violations", violations=violations, retry=state.retry_count)
            return RefineToneNode()

        if violations:
            log.warn("tone_proceeding_with_violations", violations=violations)

        return End(ToneResult(
            options=state.options,
            violations=violations,
            chunks_used=state.chunks_used,
        ))


@dataclass
class RefineToneNode(BaseNode[ToneState, ToneDeps]):
    async def run(
        self, ctx: GraphRunContext[ToneState, ToneDeps],
    ) -> GenerateToneNode:
        state = ctx.state
        state.retry_count += 1
        state.refinement_feedback = build_refinement_feedback(
            state.constraint_violations,
        )
        log.info("refining_tone", retry=state.retry_count)
        return GenerateToneNode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

tone_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateToneNode,
        ValidateToneNode,
        RefineToneNode,
    ],
)


async def run_tone_graph(
    *,
    api_key: str,
    title: str,
    description: str,
    audience_personas: list[AudiencePersona],
    rag_filters: dict[str, str] | None = None,
) -> ToneResult:
    """Run the tone options generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = ToneDeps(
        api_key=api_key,
        title=title,
        description=description,
        audience_personas=audience_personas,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await tone_graph.run(
        SearchKnowledgeNode(),
        state=ToneState(),
        deps=deps,
    )

    return result.output
