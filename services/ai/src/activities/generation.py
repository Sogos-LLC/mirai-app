"""Temporal activities for AI generation (outline, lesson, component, image, structural)."""

from pydantic import BaseModel, Field

import structlog
from temporalio import activity

from src.agents.structural_agent import generate_structural_elements
from src.graphs.outline_graph import run_outline_graph
from src.graphs.lesson_graph import run_lesson_graph
from src.models.lesson import LessonContent, LessonComponent
from src.models.outline import CourseOutline, OutlineLesson
from src.models.plan import CoursePlan
from src.models.wizard import SMEPersona, AudiencePersona

log = structlog.get_logger()


class GenerateOutlineInput(BaseModel):
    """Input for outline generation activity."""

    api_key: str
    course_title: str
    desired_outcome: str
    desired_outcomes: list[str]
    sme_personas: list[SMEPersona]
    audience_personas: list[AudiencePersona]
    additional_context: str = ""
    internal_data_only: bool = False
    course_plan_context: CoursePlan | None = None
    rag_filters: dict[str, str] | None = None


class GenerateOutlineOutput(BaseModel):
    """Output from outline generation activity."""

    outline: CourseOutline
    constraint_violations: list[str]
    rag_chunks_used: int


@activity.defn
async def generate_outline(input: GenerateOutlineInput) -> GenerateOutlineOutput:
    """Generate a course outline using the outline graph."""
    activity.heartbeat("starting outline generation")

    outline, violations, chunks_used = await run_outline_graph(
        api_key=input.api_key,
        course_title=input.course_title,
        desired_outcome=input.desired_outcome,
        desired_outcomes=input.desired_outcomes,
        personas=input.sme_personas,
        target_audience=input.audience_personas,
        additional_context=input.additional_context,
        internal_data_only=input.internal_data_only,
        course_plan_context=input.course_plan_context,
        rag_filters=input.rag_filters,
    )

    activity.heartbeat("outline generation completed")

    return GenerateOutlineOutput(
        outline=outline,
        constraint_violations=violations,
        rag_chunks_used=chunks_used,
    )


class AnalyzeCourseGapsInput(BaseModel):
    """Input for course-level gap analysis activity."""

    api_key: str
    course_title: str
    outline_summary: str
    has_rag_content: bool = False


class AnalyzeCourseGapsOutput(BaseModel):
    """Output from course-level gap analysis activity."""

    web_context: str = ""


@activity.defn
async def analyze_course_gaps_activity(
    input: AnalyzeCourseGapsInput,
) -> AnalyzeCourseGapsOutput:
    """Analyze knowledge gaps for the entire course and optionally research."""
    from src.agents.lesson_agent import analyze_course_gaps

    activity.heartbeat("analyzing course gaps")

    web_context = await analyze_course_gaps(
        api_key=input.api_key,
        course_title=input.course_title,
        outline_summary=input.outline_summary,
        has_rag_content=input.has_rag_content,
    )

    return AnalyzeCourseGapsOutput(web_context=web_context)


class GenerateLessonInput(BaseModel):
    """Input for lesson content generation activity."""

    api_key: str
    lesson: OutlineLesson
    course_title: str
    course_context: str
    section_title: str
    section_index: int
    lesson_index: int
    sme_personas: list[SMEPersona]
    rag_filters: dict[str, str] | None = None
    previous_lesson_summaries: list[str] = Field(default_factory=list)
    concept_map_context: str = ""
    is_section_first: bool = False
    is_section_last: bool = False
    is_course_last: bool = False
    next_lesson_title: str = ""
    web_context: str = ""


class GenerateLessonOutput(BaseModel):
    """Output from lesson content generation activity."""

    lesson_content: LessonContent
    rag_chunks_used: int


@activity.defn
async def generate_lesson(input: GenerateLessonInput) -> GenerateLessonOutput:
    """Generate lesson content using the lesson graph."""
    activity.heartbeat("starting lesson generation")

    content, chunks_used = await run_lesson_graph(
        api_key=input.api_key,
        lesson=input.lesson,
        course_title=input.course_title,
        course_context=input.course_context,
        section_title=input.section_title,
        section_index=input.section_index,
        lesson_index=input.lesson_index,
        personas=input.sme_personas,
        rag_filters=input.rag_filters,
        previous_lesson_summaries=input.previous_lesson_summaries,
        concept_map_context=input.concept_map_context,
        is_section_first=input.is_section_first,
        is_section_last=input.is_section_last,
        is_course_last=input.is_course_last,
        next_lesson_title=input.next_lesson_title,
        web_context=input.web_context,
    )

    activity.heartbeat("lesson generation completed")

    return GenerateLessonOutput(
        lesson_content=content,
        rag_chunks_used=chunks_used,
    )


class RegenerateComponentInput(BaseModel):
    """Input for component regeneration activity."""

    api_key: str
    component: LessonComponent
    modification_prompt: str
    lesson_context: str
    course_title: str


class RegenerateComponentOutput(BaseModel):
    """Output from component regeneration activity."""

    component: LessonComponent


@activity.defn
async def regenerate_component(
    input: RegenerateComponentInput,
) -> RegenerateComponentOutput:
    """Regenerate a single lesson component."""
    from src.agents.component_agent import run_component_regeneration

    activity.heartbeat("regenerating component")

    result = await run_component_regeneration(
        api_key=input.api_key,
        component=input.component,
        modification_prompt=input.modification_prompt,
        lesson_context=input.lesson_context,
        course_title=input.course_title,
    )

    return RegenerateComponentOutput(component=result)


class GenerateImageDescriptionInput(BaseModel):
    """Input for image description generation activity."""

    api_key: str
    image_context: str
    lesson_context: str
    course_title: str


class GenerateImageDescriptionOutput(BaseModel):
    """Output from image description generation activity."""

    description: str
    alt_text: str


@activity.defn
async def generate_image_description(
    input: GenerateImageDescriptionInput,
) -> GenerateImageDescriptionOutput:
    """Generate an image description and alt text."""
    from src.agents.image_agent import run_image_description

    activity.heartbeat("generating image description")

    description, alt_text = await run_image_description(
        api_key=input.api_key,
        image_context=input.image_context,
        lesson_context=input.lesson_context,
        course_title=input.course_title,
    )

    return GenerateImageDescriptionOutput(
        description=description, alt_text=alt_text
    )


class GenerateStructuralElementsInput(BaseModel):
    """Input for structural elements generation activity."""

    api_key: str
    outline: CourseOutline


class GenerateStructuralElementsOutput(BaseModel):
    """Output from structural elements generation activity."""

    section_introductions: dict[str, str]
    section_summaries: dict[str, str]
    conclusion: str


@activity.defn
async def generate_structural_elements_activity(
    input: GenerateStructuralElementsInput,
) -> GenerateStructuralElementsOutput:
    """Generate section intros, summaries, and course conclusion."""
    activity.heartbeat("generating structural elements")

    result = await generate_structural_elements(
        api_key=input.api_key,
        outline=input.outline,
    )

    return GenerateStructuralElementsOutput(
        section_introductions=result.section_introductions,
        section_summaries=result.section_summaries,
        conclusion=result.conclusion,
    )
