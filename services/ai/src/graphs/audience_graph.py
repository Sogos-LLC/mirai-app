"""Audience personas generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateAudienceNode -> End

Validation is handled by the audience_agent's @output_validator (see wizard_agents.py).
The agent retries internally via ModelRetry before returning.
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.registry import AgentRegistry
from src.agents.wizard_agents import build_audience_prompt
from src.graphs.wizard_utils import search_wizard_knowledge
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
    ) -> End[AudienceResult]:
        deps = ctx.deps
        state = ctx.state

        prompt = build_audience_prompt(
            deps.title, deps.description, deps.sme_personas,
            rag_chunks=state.rag_chunks,
        )
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await AgentRegistry.get("wizard-audience").run(prompt, model=make_model(deps.api_key))
        state.personas = result.output.personas

        log.info("audience_generated", count=len(state.personas))

        return End(AudienceResult(
            personas=state.personas,
            violations=[],
            chunks_used=state.chunks_used,
        ))


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

audience_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateAudienceNode,
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
    embedding_client = EmbeddingClient(api_key)

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
