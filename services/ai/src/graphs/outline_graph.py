"""Outline generation graph using pydantic-graph.

Flow:
  SearchKnowledge -> GenerateSections -> GenerateLessonDetails
                                              -> ValidateConstraints
                                                    |-> End (valid)
                                                    |-> RefineOutline -> ValidateConstraints (max 2 retries)
"""

import asyncio
from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.outline_agent import (
    SectionSkeleton,
    SectionsOnlyOutput,
    assemble_outline,
    generate_lesson_details,
    generate_sections,
)
from src.models.knowledge import KnowledgeChunk
from src.models.outline import CourseOutline, OutlineLesson
from src.models.plan import CoursePlan
from src.models.wizard import SMEPersona, AudiencePersona
from src.rag.search import search_knowledge

log = structlog.get_logger()

MAX_CONSTRAINT_RETRIES = 2


# ---------------------------------------------------------------------------
# State & Dependencies
# ---------------------------------------------------------------------------


@dataclass
class OutlineState:
    """Mutable state passed through outline graph nodes."""

    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    sections_output: SectionsOnlyOutput | None = None
    lesson_details: dict[int, list[OutlineLesson]] = field(default_factory=dict)
    outline: CourseOutline | None = None
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
    chunks_used: int = 0
    additional_context_append: str = ""


@dataclass
class OutlineDeps:
    """Immutable dependencies for outline generation."""

    api_key: str
    course_title: str
    desired_outcome: str
    desired_outcomes: list[str]
    personas: list[SMEPersona]
    target_audience: list[AudiencePersona]
    additional_context: str
    internal_data_only: bool
    course_plan_context: CoursePlan | None
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class OutlineResult:
    """Final result from the outline graph."""

    outline: CourseOutline
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[OutlineState, OutlineDeps]):
    """Search the knowledge base for relevant RAG chunks."""

    async def run(
        self, ctx: GraphRunContext[OutlineState, OutlineDeps]
    ) -> "GenerateSectionsNode":
        deps = ctx.deps

        if deps.rag_filters:
            # Build search queries from course plan or course metadata
            queries: list[str] = []
            if deps.course_plan_context:
                for s in deps.course_plan_context.planned_sections:
                    queries.extend(s.search_terms[:3])
            if not queries:
                queries = [
                    deps.course_title,
                    deps.desired_outcome,
                    *deps.desired_outcomes[:3],
                ]

            all_chunks: list[KnowledgeChunk] = []
            seen_ids: set[str] = set()

            for query in queries[:5]:
                chunks = await search_knowledge(
                    query=query,
                    filters=deps.rag_filters,
                    top_k=15,
                    qdrant=deps.qdrant,
                    embedding_client=deps.embedding_client,
                )
                for c in chunks:
                    chunk_id = f"{c.source_id}:{c.chunk_index}"
                    if chunk_id not in seen_ids:
                        seen_ids.add(chunk_id)
                        all_chunks.append(c)

            ctx.state.rag_chunks = all_chunks
            ctx.state.chunks_used = len(all_chunks)
            log.info("rag_search_complete", chunks=len(all_chunks))

        return GenerateSectionsNode()


@dataclass
class GenerateSectionsNode(BaseNode[OutlineState, OutlineDeps]):
    """Phase 1: Generate sections with lesson titles only."""

    async def run(
        self, ctx: GraphRunContext[OutlineState, OutlineDeps]
    ) -> "GenerateLessonDetailsNode":
        deps = ctx.deps
        state = ctx.state

        # Combine base additional_context with any retry feedback
        additional = deps.additional_context
        if state.additional_context_append:
            additional = f"{additional}\n\n{state.additional_context_append}"

        sections_output = await generate_sections(
            api_key=deps.api_key,
            course_title=deps.course_title,
            desired_outcome=deps.desired_outcome,
            desired_outcomes=deps.desired_outcomes,
            personas=deps.personas,
            target_audience=deps.target_audience,
            additional_context=additional,
            internal_data_only=deps.internal_data_only,
            rag_chunks=state.rag_chunks,
            course_plan_context=deps.course_plan_context,
        )

        state.sections_output = sections_output
        log.info(
            "sections_generated",
            count=len(sections_output.sections),
            retry=state.retry_count,
        )
        return GenerateLessonDetailsNode()


@dataclass
class GenerateLessonDetailsNode(BaseNode[OutlineState, OutlineDeps]):
    """Phase 2: Generate detailed lesson metadata for each section (parallel)."""

    async def run(
        self, ctx: GraphRunContext[OutlineState, OutlineDeps]
    ) -> "ValidateConstraintsNode":
        deps = ctx.deps
        state = ctx.state
        assert state.sections_output is not None

        # Generate lesson details for all sections in parallel
        tasks = []
        for i, section in enumerate(state.sections_output.sections):
            tasks.append(
                generate_lesson_details(
                    api_key=deps.api_key,
                    course_title=deps.course_title,
                    desired_outcome=deps.desired_outcome,
                    section=section,
                    section_index=i,
                    target_audience=deps.target_audience,
                    personas=deps.personas,
                )
            )

        results = await asyncio.gather(*tasks)
        state.lesson_details = {i: lessons for i, lessons in enumerate(results)}

        # Assemble the full outline
        state.outline = assemble_outline(state.sections_output, state.lesson_details)
        log.info("lesson_details_generated", sections=len(results))
        return ValidateConstraintsNode()


@dataclass
class ValidateConstraintsNode(BaseNode[OutlineState, OutlineDeps]):
    """Validate the generated outline against constraints."""

    async def run(
        self, ctx: GraphRunContext[OutlineState, OutlineDeps]
    ) -> "RefineOutlineNode | End[OutlineResult]":
        deps = ctx.deps
        state = ctx.state
        assert state.outline is not None

        violations: list[str] = []

        # Check: every outcome is mapped to at least one section
        if state.sections_output:
            all_mapped: set[int] = set()
            for section in state.sections_output.sections:
                all_mapped.update(section.metadata.mapped_outcome_indices)

            for i, outcome in enumerate(deps.desired_outcomes):
                if i not in all_mapped:
                    violations.append(
                        f"Outcome {i} '{outcome}' is not mapped to any section"
                    )

        # Check: reasonable section/lesson counts
        num_sections = len(state.outline.sections)
        if num_sections < 2:
            violations.append(
                f"Only {num_sections} section(s) generated; need at least 2"
            )
        if num_sections > 12:
            violations.append(
                f"{num_sections} sections is too many; aim for 3-8"
            )

        for section in state.outline.sections:
            if len(section.lessons) < 1:
                violations.append(
                    f"Section '{section.title}' has no lessons"
                )
            if len(section.lessons) > 8:
                violations.append(
                    f"Section '{section.title}' has {len(section.lessons)} lessons; max 8"
                )

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_CONSTRAINT_RETRIES:
            log.warn(
                "constraint_violations",
                violations=violations,
                retry=state.retry_count,
            )
            return RefineOutlineNode()

        if violations:
            log.warn(
                "proceeding_with_violations",
                violations=violations,
                retries_exhausted=True,
            )

        return End(
            OutlineResult(
                outline=state.outline,
                violations=violations,
                chunks_used=state.chunks_used,
            )
        )


@dataclass
class RefineOutlineNode(BaseNode[OutlineState, OutlineDeps]):
    """Retry outline generation with constraint feedback."""

    async def run(
        self, ctx: GraphRunContext[OutlineState, OutlineDeps]
    ) -> GenerateSectionsNode:
        state = ctx.state
        state.retry_count += 1

        # Build constraint feedback for the retry
        feedback_lines = [
            "## CONSTRAINT VIOLATIONS FROM PREVIOUS ATTEMPT",
            "The previous outline had the following issues that MUST be fixed:\n",
        ]
        for v in state.constraint_violations:
            feedback_lines.append(f"- {v}")
        feedback_lines.append(
            "\nPlease regenerate the outline fixing ALL of the above issues."
        )

        state.additional_context_append = "\n".join(feedback_lines)
        log.info("refining_outline", retry=state.retry_count)
        return GenerateSectionsNode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

outline_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateSectionsNode,
        GenerateLessonDetailsNode,
        ValidateConstraintsNode,
        RefineOutlineNode,
    ],
)


async def run_outline_graph(
    *,
    api_key: str,
    course_title: str,
    desired_outcome: str,
    desired_outcomes: list[str],
    personas: list[SMEPersona],
    target_audience: list[AudiencePersona],
    additional_context: str = "",
    internal_data_only: bool = False,
    course_plan_context: CoursePlan | None = None,
    rag_filters: dict[str, str] | None = None,
) -> tuple[CourseOutline, list[str], int]:
    """Run the full outline generation graph.

    Returns:
        Tuple of (outline, constraint_violations, rag_chunks_used)
    """
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = OutlineDeps(
        api_key=api_key,
        course_title=course_title,
        desired_outcome=desired_outcome,
        desired_outcomes=desired_outcomes,
        personas=personas,
        target_audience=target_audience,
        additional_context=additional_context,
        internal_data_only=internal_data_only,
        course_plan_context=course_plan_context,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    state = OutlineState()

    result = await outline_graph.run(
        SearchKnowledgeNode(),
        state=state,
        deps=deps,
    )

    return result.output.outline, result.output.violations, result.output.chunks_used
