"""Lesson content generation graph using pydantic-graph.

Flow:
  SearchKnowledge -> PlanComponents -> ValidatePlan
                                            |-> GenerateComponents -> End (valid plan)
                                            |-> RefinePlan -> ValidatePlan (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.lesson_agent import (
    ComponentPlanOutput,
    PlannedComponent,
    build_component_plan_prompt,
    build_single_component_prompt,
    component_plan_agent,
    generate_segue,
    single_component_agent,
)
from src.agents.model import make_model
from src.models.knowledge import KnowledgeChunk
from src.models.lesson import LessonComponent, LessonContent
from src.models.outline import OutlineLesson
from src.models.wizard import SMEPersona
from src.rag.search import search_knowledge

log = structlog.get_logger()

MAX_PLAN_RETRIES = 2
MIN_COMPONENT_TYPES = 4


# ---------------------------------------------------------------------------
# State & Dependencies
# ---------------------------------------------------------------------------


@dataclass
class LessonState:
    """Mutable state for lesson generation graph."""

    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    component_plan: list[PlannedComponent] = field(default_factory=list)
    plan_violations: list[str] = field(default_factory=list)
    plan_retry_count: int = 0
    generated_components: list[LessonComponent] = field(default_factory=list)
    chunks_used: int = 0


@dataclass
class LessonDeps:
    """Immutable dependencies for lesson generation."""

    api_key: str
    lesson: OutlineLesson
    course_title: str
    course_context: str
    section_title: str
    section_index: int
    lesson_index: int
    personas: list[SMEPersona]
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------


@dataclass
class LessonResult:
    """Final result from the lesson graph."""

    content: LessonContent
    chunks_used: int


# ---------------------------------------------------------------------------
# Graph Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[LessonState, LessonDeps]):
    """Search knowledge base for lesson-specific content."""

    async def run(
        self, ctx: GraphRunContext[LessonState, LessonDeps]
    ) -> "PlanComponentsNode":
        deps = ctx.deps
        state = ctx.state

        if deps.rag_filters:
            # Build search queries from lesson metadata
            queries = [
                deps.lesson.title,
                deps.lesson.description,
            ]
            for obj in deps.lesson.learning_objectives[:2]:
                queries.append(obj.description)
            for topic in deps.lesson.key_topics[:2]:
                queries.append(topic)

            all_chunks: list[KnowledgeChunk] = []
            seen_ids: set[str] = set()

            for query in queries[:5]:
                chunks = await search_knowledge(
                    query=query,
                    filters=deps.rag_filters,
                    top_k=5,
                    qdrant=deps.qdrant,
                    embedding_client=deps.embedding_client,
                )
                for c in chunks:
                    chunk_id = f"{c.source_id}:{c.chunk_index}"
                    if chunk_id not in seen_ids:
                        seen_ids.add(chunk_id)
                        all_chunks.append(c)

            state.rag_chunks = all_chunks
            state.chunks_used = len(all_chunks)
            log.info(
                "lesson_rag_search",
                lesson=deps.lesson.title,
                chunks=len(all_chunks),
            )

        return PlanComponentsNode()


@dataclass
class PlanComponentsNode(BaseNode[LessonState, LessonDeps]):
    """Plan the component structure for this lesson."""

    async def run(
        self, ctx: GraphRunContext[LessonState, LessonDeps]
    ) -> "ValidatePlanNode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_component_plan_prompt(
            lesson=deps.lesson,
            course_title=deps.course_title,
            course_context=deps.course_context,
            section_title=deps.section_title,
            section_index=deps.section_index,
            lesson_index=deps.lesson_index,
            personas=deps.personas,
            rag_chunks=state.rag_chunks if state.rag_chunks else None,
        )

        result = await component_plan_agent.run(
            prompt, model=make_model(deps.api_key)
        )
        state.component_plan = result.output.components

        log.info(
            "component_plan_created",
            lesson=deps.lesson.title,
            components=len(state.component_plan),
            retry=state.plan_retry_count,
        )
        return ValidatePlanNode()


@dataclass
class ValidatePlanNode(BaseNode[LessonState, LessonDeps]):
    """Validate the component plan against structural rules."""

    async def run(
        self, ctx: GraphRunContext[LessonState, LessonDeps]
    ) -> "GenerateComponentsNode | RefinePlanNode":
        state = ctx.state
        plan = state.component_plan
        violations: list[str] = []

        if len(plan) < 4:
            violations.append(f"Only {len(plan)} components planned; need at least 4")
        if len(plan) > 16:
            violations.append(f"{len(plan)} components is too many; aim for 8-12")

        # Check component type variety
        types = {c.type.upper() for c in plan}
        if len(types) < MIN_COMPONENT_TYPES:
            violations.append(
                f"Only {len(types)} unique types ({types}); need at least {MIN_COMPONENT_TYPES}"
            )

        # Check quiz placement
        quiz_indices = [i for i, c in enumerate(plan) if c.type.upper() == "QUIZ"]
        if len(quiz_indices) > 1:
            violations.append("Multiple QUIZ components; only one allowed at the end")
        if quiz_indices and quiz_indices[0] != len(plan) - 1:
            violations.append("QUIZ must be the last component")

        # Check no consecutive headings
        for i in range(len(plan) - 1):
            if plan[i].type.upper() == "HEADING" and plan[i + 1].type.upper() == "HEADING":
                violations.append(f"Consecutive HEADINGs at positions {i} and {i + 1}")
            if plan[i].type.upper() == "IMAGE" and plan[i + 1].type.upper() == "IMAGE":
                violations.append(f"Consecutive IMAGEs at positions {i} and {i + 1}")

        # Check starts with HEADING
        if plan and plan[0].type.upper() != "HEADING":
            violations.append("First component should be HEADING")

        # Check max 3 images
        image_count = sum(1 for c in plan if c.type.upper() == "IMAGE")
        if image_count > 3:
            violations.append(f"{image_count} IMAGE components; max 3 allowed")

        # Check STATEMENT or CALLOUT present
        has_emphasis = any(
            c.type.upper() in ("STATEMENT", "CALLOUT") for c in plan
        )
        if not has_emphasis:
            violations.append("Need at least one STATEMENT or CALLOUT for emphasis")

        state.plan_violations = violations

        if violations and state.plan_retry_count < MAX_PLAN_RETRIES:
            log.warn(
                "plan_violations",
                lesson=ctx.deps.lesson.title,
                violations=violations,
                retry=state.plan_retry_count,
            )
            return RefinePlanNode()

        if violations:
            log.warn(
                "proceeding_with_plan_violations",
                lesson=ctx.deps.lesson.title,
                violations=violations,
            )

        return GenerateComponentsNode()


@dataclass
class RefinePlanNode(BaseNode[LessonState, LessonDeps]):
    """Retry component planning with validation feedback."""

    async def run(
        self, ctx: GraphRunContext[LessonState, LessonDeps]
    ) -> PlanComponentsNode:
        state = ctx.state
        state.plan_retry_count += 1

        # The plan prompt will be regenerated fresh by PlanComponentsNode
        # The violations are logged for debugging; the system prompt already
        # contains all the structural rules that should prevent issues.
        log.info(
            "refining_component_plan",
            lesson=ctx.deps.lesson.title,
            retry=state.plan_retry_count,
        )
        return PlanComponentsNode()


@dataclass
class GenerateComponentsNode(BaseNode[LessonState, LessonDeps]):
    """Generate each component individually based on the plan."""

    async def run(
        self, ctx: GraphRunContext[LessonState, LessonDeps]
    ) -> End[LessonResult]:
        deps = ctx.deps
        state = ctx.state
        plan = state.component_plan

        # Generate components sequentially (each one sees previous context)
        components: list[LessonComponent] = []

        for i, planned in enumerate(plan):
            prompt = build_single_component_prompt(
                component_type=planned.type,
                component_purpose=planned.purpose,
                component_index=i,
                total_components=len(plan),
                lesson=deps.lesson,
                course_title=deps.course_title,
                section_title=deps.section_title,
                previous_components=components,
                rag_chunks=state.rag_chunks if state.rag_chunks else None,
            )

            result = await single_component_agent.run(
                prompt, model=make_model(deps.api_key)
            )
            component = result.output
            # Ensure identity fields are set
            component.id = f"component-{i + 1}"
            component.order = i
            components.append(component)

        state.generated_components = components

        # Assemble into LessonContent
        content = LessonContent(
            lesson_id=deps.lesson.id,
            title=deps.lesson.title,
            summary=deps.lesson.description,
            components=components,
            estimated_duration_minutes=deps.lesson.estimated_duration_minutes,
        )

        log.info(
            "lesson_content_generated",
            lesson=deps.lesson.title,
            components=len(components),
            chunks_used=state.chunks_used,
        )

        return End(
            LessonResult(
                content=content,
                chunks_used=state.chunks_used,
            )
        )


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

lesson_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        PlanComponentsNode,
        ValidatePlanNode,
        RefinePlanNode,
        GenerateComponentsNode,
    ],
)


async def run_lesson_graph(
    *,
    api_key: str,
    lesson: OutlineLesson,
    course_title: str,
    course_context: str,
    section_title: str,
    section_index: int,
    lesson_index: int,
    personas: list[SMEPersona],
    rag_filters: dict[str, str] | None = None,
) -> tuple[LessonContent, int]:
    """Run the full lesson generation graph.

    Returns:
        Tuple of (lesson_content, rag_chunks_used)
    """
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = LessonDeps(
        api_key=api_key,
        lesson=lesson,
        course_title=course_title,
        course_context=course_context,
        section_title=section_title,
        section_index=section_index,
        lesson_index=lesson_index,
        personas=personas,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    state = LessonState()

    result = await lesson_graph.run(
        SearchKnowledgeNode(),
        state=state,
        deps=deps,
    )

    return result.output.content, result.output.chunks_used
