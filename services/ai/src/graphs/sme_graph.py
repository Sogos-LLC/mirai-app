"""SME personas generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateSMENode -> End

Validation is handled by the sme_agent's @output_validator (see wizard_agents.py).
The agent retries internally via ModelRetry before returning.
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_sme_prompt, sme_agent
from src.graphs.wizard_utils import search_wizard_knowledge
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import SMEPersona

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class SMEState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    personas: list[SMEPersona] | None = None
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class SMEDeps:
    api_key: str
    title: str
    description: str
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class SMEResult:
    personas: list[SMEPersona]
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> "GenerateSMENode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.title, deps.description],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateSMENode()


@dataclass
class GenerateSMENode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> End[SMEResult]:
        deps = ctx.deps
        state = ctx.state

        prompt = build_sme_prompt(deps.title, deps.description, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await sme_agent.run(prompt, model=make_model(deps.api_key))
        state.personas = result.output.personas

        log.info("sme_generated", count=len(state.personas))

        return End(SMEResult(
            personas=state.personas,
            violations=[],
            chunks_used=state.chunks_used,
        ))


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

sme_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateSMENode,
    ],
)


async def run_sme_graph(
    *,
    api_key: str,
    title: str,
    description: str,
    rag_filters: dict[str, str] | None = None,
) -> SMEResult:
    """Run the SME persona generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient(api_key)

    deps = SMEDeps(
        api_key=api_key,
        title=title,
        description=description,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await sme_graph.run(
        SearchKnowledgeNode(),
        state=SMEState(),
        deps=deps,
    )

    return result.output
