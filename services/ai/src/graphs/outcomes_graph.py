"""Outcomes generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateOutcomesNode -> ValidateOutcomesNode -> End (valid)
                                                      |-> RefineOutcomesNode -> GenerateOutcomesNode (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_outcomes_prompt, outcomes_agent
from src.graphs.wizard_utils import (
    BLOOMS_VERBS,
    MAX_WIZARD_RETRIES,
    build_refinement_feedback,
    check_unique_values,
    check_word_count,
    search_wizard_knowledge,
)
from src.models.knowledge import KnowledgeChunk

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class OutcomesState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    outcomes: str = ""
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
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
# Helpers
# ---------------------------------------------------------------------------


def _parse_outcomes(text: str) -> list[str]:
    """Parse bullet-point outcomes from text."""
    lines = []
    for line in text.strip().split("\n"):
        stripped = line.strip()
        if stripped.startswith("•"):
            stripped = stripped[1:].strip()
        elif stripped.startswith("-"):
            stripped = stripped[1:].strip()
        if stripped:
            lines.append(stripped)
    return lines


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
    ) -> "ValidateOutcomesNode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_outcomes_prompt(deps.course_name, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await outcomes_agent.run(prompt, model=make_model(deps.api_key))
        state.outcomes = result.output.outcomes

        log.info("outcomes_generated", retry=state.retry_count)
        return ValidateOutcomesNode()


@dataclass
class ValidateOutcomesNode(BaseNode[OutcomesState, OutcomesDeps]):
    async def run(
        self, ctx: GraphRunContext[OutcomesState, OutcomesDeps],
    ) -> "RefineOutcomesNode | End[OutcomesResult]":
        state = ctx.state
        violations: list[str] = []

        outcomes = _parse_outcomes(state.outcomes)

        # 3-5 outcomes
        if len(outcomes) < 3:
            violations.append(
                f"Expected 3-5 outcomes, got {len(outcomes)}"
            )
        elif len(outcomes) > 5:
            violations.append(
                f"Expected 3-5 outcomes, got {len(outcomes)}"
            )

        # Each starts with Bloom's verb
        starting_verbs: list[str] = []
        for i, outcome in enumerate(outcomes):
            first_word = outcome.split()[0].lower().rstrip(",.:;") if outcome.split() else ""
            if first_word not in BLOOMS_VERBS:
                violations.append(
                    f"Outcome {i + 1} starts with '{first_word}', not a Bloom's taxonomy verb"
                )
            starting_verbs.append(first_word)

        # No duplicate starting verbs
        v = check_unique_values(starting_verbs, "Starting verbs")
        if v:
            violations.append(v)

        # Each outcome 8-25 words
        for i, outcome in enumerate(outcomes):
            v = check_word_count(outcome, 8, 25, f"Outcome {i + 1}")
            if v:
                violations.append(v)

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_WIZARD_RETRIES:
            log.warn("outcomes_violations", violations=violations, retry=state.retry_count)
            return RefineOutcomesNode()

        if violations:
            log.warn("outcomes_proceeding_with_violations", violations=violations)

        return End(OutcomesResult(
            outcomes=state.outcomes,
            violations=violations,
            chunks_used=state.chunks_used,
        ))


@dataclass
class RefineOutcomesNode(BaseNode[OutcomesState, OutcomesDeps]):
    async def run(
        self, ctx: GraphRunContext[OutcomesState, OutcomesDeps],
    ) -> GenerateOutcomesNode:
        state = ctx.state
        state.retry_count += 1
        state.refinement_feedback = build_refinement_feedback(
            state.constraint_violations,
        )
        log.info("refining_outcomes", retry=state.retry_count)
        return GenerateOutcomesNode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

outcomes_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateOutcomesNode,
        ValidateOutcomesNode,
        RefineOutcomesNode,
    ],
)


async def run_outcomes_graph(
    *,
    api_key: str,
    course_name: str,
    rag_filters: dict[str, str] | None = None,
) -> OutcomesResult:
    """Run the outcomes generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = OutcomesDeps(
        api_key=api_key,
        course_name=course_name,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await outcomes_graph.run(
        SearchKnowledgeNode(),
        state=OutcomesState(),
        deps=deps,
    )

    return result.output
