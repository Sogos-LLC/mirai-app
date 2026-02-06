"""Tone options generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateToneNode -> End

Validation is handled by the tone_agent's @output_validator (see wizard_agents.py).
The agent retries internally via ModelRetry before returning.
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_tone_prompt, tone_agent
from src.graphs.wizard_utils import search_wizard_knowledge
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import AudiencePersona, ToneOption

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class ToneState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    options: list[ToneOption] | None = None
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
    ) -> End[ToneResult]:
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

        log.info("tone_generated", count=len(state.options))

        return End(ToneResult(
            options=state.options,
            violations=[],
            chunks_used=state.chunks_used,
        ))


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

tone_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateToneNode,
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
    embedding_client = EmbeddingClient(api_key)

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
