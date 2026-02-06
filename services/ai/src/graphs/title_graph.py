"""Title generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateTitleNode -> End

Validation is handled by the title_agent's @output_validator (see wizard_agents.py).
The agent retries internally via ModelRetry before returning.
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_title_prompt, title_agent
from src.graphs.wizard_utils import search_wizard_knowledge
from src.models.knowledge import KnowledgeChunk

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class TitleState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    improved_title: str = ""
    description: str = ""
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class TitleDeps:
    api_key: str
    course_name: str
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class TitleResult:
    improved_title: str
    description: str
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[TitleState, TitleDeps]):
    async def run(
        self, ctx: GraphRunContext[TitleState, TitleDeps],
    ) -> "GenerateTitleNode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.course_name],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateTitleNode()


@dataclass
class GenerateTitleNode(BaseNode[TitleState, TitleDeps]):
    async def run(
        self, ctx: GraphRunContext[TitleState, TitleDeps],
    ) -> End[TitleResult]:
        deps = ctx.deps
        state = ctx.state

        prompt = build_title_prompt(deps.course_name, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await title_agent.run(prompt, model=make_model(deps.api_key))
        state.improved_title = result.output.improved_title
        state.description = result.output.description

        log.info("title_generated", title=state.improved_title)

        return End(TitleResult(
            improved_title=state.improved_title,
            description=state.description,
            violations=[],
            chunks_used=state.chunks_used,
        ))


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

title_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateTitleNode,
    ],
)


async def run_title_graph(
    *,
    api_key: str,
    course_name: str,
    feedback: str = "",
    rag_filters: dict[str, str] | None = None,
) -> TitleResult:
    """Run the title generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient(api_key)

    deps = TitleDeps(
        api_key=api_key,
        course_name=course_name,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    state = TitleState()
    if feedback:
        state.refinement_feedback = f"User feedback on previous attempt: {feedback}"

    result = await title_graph.run(
        SearchKnowledgeNode(),
        state=state,
        deps=deps,
    )

    return result.output
