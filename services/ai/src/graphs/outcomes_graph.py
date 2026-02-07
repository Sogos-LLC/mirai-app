"""Outcomes generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateOutcomesNode -> End

Validation is handled by the outcomes_agent's @output_validator (see wizard_agents.py).
The agent retries internally via ModelRetry before returning.
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.registry import AgentRegistry
from src.agents.wizard_agents import build_outcomes_prompt
from src.graphs.wizard_utils import search_wizard_knowledge
from src.models.knowledge import KnowledgeChunk

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class OutcomesState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    outcomes: str = ""
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class OutcomesDeps:
    api_key: str
    course_name: str
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class OutcomesResult:
    outcomes: str
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[OutcomesState, OutcomesDeps]):
    async def run(
        self, ctx: GraphRunContext[OutcomesState, OutcomesDeps],
    ) -> "GenerateOutcomesNode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.course_name],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateOutcomesNode()


@dataclass
class GenerateOutcomesNode(BaseNode[OutcomesState, OutcomesDeps]):
    async def run(
        self, ctx: GraphRunContext[OutcomesState, OutcomesDeps],
    ) -> End[OutcomesResult]:
        deps = ctx.deps
        state = ctx.state

        prompt = build_outcomes_prompt(deps.course_name, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await AgentRegistry.get("wizard-outcomes").run(prompt, model=make_model(deps.api_key))
        state.outcomes = result.output.outcomes

        log.info("outcomes_generated")

        return End(OutcomesResult(
            outcomes=state.outcomes,
            violations=[],
            chunks_used=state.chunks_used,
        ))


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

outcomes_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateOutcomesNode,
    ],
)


async def run_outcomes_graph(
    *,
    api_key: str,
    course_name: str,
    feedback: str = "",
    rag_filters: dict[str, str] | None = None,
) -> OutcomesResult:
    """Run the outcomes generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient(api_key)

    deps = OutcomesDeps(
        api_key=api_key,
        course_name=course_name,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    state = OutcomesState()
    if feedback:
        state.refinement_feedback = f"User feedback on previous attempt: {feedback}"

    result = await outcomes_graph.run(
        SearchKnowledgeNode(),
        state=state,
        deps=deps,
    )

    return result.output
