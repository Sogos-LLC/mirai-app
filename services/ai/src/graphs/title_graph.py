"""Title generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateTitleNode -> ValidateTitleNode -> End (valid)
                                                  |-> RefineTitleNode -> GenerateTitleNode (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_title_prompt, title_agent
from src.graphs.wizard_utils import (
    GENERIC_TITLE_PREFIXES,
    MAX_WIZARD_RETRIES,
    TITLE_CASE_MINOR_WORDS,
    build_refinement_feedback,
    check_sentence_count,
    check_word_count,
    search_wizard_knowledge,
)
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
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
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
    ) -> "ValidateTitleNode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_title_prompt(deps.course_name, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await title_agent.run(prompt, model=make_model(deps.api_key))
        state.improved_title = result.output.improved_title
        state.description = result.output.description

        log.info(
            "title_generated",
            title=state.improved_title,
            retry=state.retry_count,
        )
        return ValidateTitleNode()


@dataclass
class ValidateTitleNode(BaseNode[TitleState, TitleDeps]):
    async def run(
        self, ctx: GraphRunContext[TitleState, TitleDeps],
    ) -> "RefineTitleNode | End[TitleResult]":
        state = ctx.state
        violations: list[str] = []

        # Title word count: 3-12
        v = check_word_count(state.improved_title, 3, 12, "Title")
        if v:
            violations.append(v)

        # Title Case check
        words = state.improved_title.split()
        for i, word in enumerate(words):
            # First and last words should always be capitalized
            if i == 0 or i == len(words) - 1:
                if word[0].islower():
                    violations.append(
                        f"Title word '{word}' at position {i} should be capitalized"
                    )
            elif word.lower() not in TITLE_CASE_MINOR_WORDS and word[0].islower():
                violations.append(
                    f"Title word '{word}' should be capitalized (Title Case)"
                )

        # Description: 2-4 sentences
        v = check_sentence_count(state.description, 2, 4, "Description")
        if v:
            violations.append(v)

        # No generic filler patterns
        title_lower = state.improved_title.lower()
        for prefix in GENERIC_TITLE_PREFIXES:
            if title_lower.startswith(prefix):
                violations.append(
                    f"Title starts with generic filler '{prefix}'"
                )

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_WIZARD_RETRIES:
            log.warn("title_violations", violations=violations, retry=state.retry_count)
            return RefineTitleNode()

        if violations:
            log.warn("title_proceeding_with_violations", violations=violations)

        return End(TitleResult(
            improved_title=state.improved_title,
            description=state.description,
            violations=violations,
            chunks_used=state.chunks_used,
        ))


@dataclass
class RefineTitleNode(BaseNode[TitleState, TitleDeps]):
    async def run(
        self, ctx: GraphRunContext[TitleState, TitleDeps],
    ) -> GenerateTitleNode:
        state = ctx.state
        state.retry_count += 1
        state.refinement_feedback = build_refinement_feedback(
            state.constraint_violations,
        )
        log.info("refining_title", retry=state.retry_count)
        return GenerateTitleNode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

title_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateTitleNode,
        ValidateTitleNode,
        RefineTitleNode,
    ],
)


async def run_title_graph(
    *,
    api_key: str,
    course_name: str,
    rag_filters: dict[str, str] | None = None,
) -> TitleResult:
    """Run the title generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = TitleDeps(
        api_key=api_key,
        course_name=course_name,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await title_graph.run(
        SearchKnowledgeNode(),
        state=TitleState(),
        deps=deps,
    )

    return result.output
