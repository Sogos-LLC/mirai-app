"""Outline generation agents - two-phase: sections-only then lesson details.

The sections_gen_agent has a `review_outline` tool that delegates to the
outline reviewer agent. The LLM can call it to self-check before finalizing.
Usage is capped at 1 tool call per outline via UsageLimits.
"""

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext, UsageLimits

from src.agents.model import make_model
from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.knowledge import KnowledgeChunk
from src.models.outline import CourseOutline, OutlineLesson, OutlineSection
from src.models.plan import CoursePlan
from src.models.wizard import SMEPersona, AudiencePersona

# ---------------------------------------------------------------------------
# Phase 1: Sections-only generation (flat schema to avoid Gemini depth limits)
# ---------------------------------------------------------------------------


class SectionMetadata(BaseModel):
    """Section-level metadata for curriculum mapping."""

    level: str = Field(description="Section level: introduce, develop, or master")
    intent: str = Field(description="Section intent: teach, assess, or reinforce")
    emphasis: str = Field(description="Section emphasis: low, medium, or high")
    mapped_outcome_indices: list[int] = Field(
        description="Zero-based indices of desired outcomes this section addresses"
    )


class SectionSkeleton(BaseModel):
    """A section with lesson titles only (Phase 1 output)."""

    title: str
    description: str
    lesson_titles: list[str] = Field(description="Lesson titles for this section")
    metadata: SectionMetadata


class SectionsOnlyOutput(BaseModel):
    """Phase 1 output: sections with lesson titles only."""

    title: str = Field(description="Course title")
    description: str = Field(description="Course description")
    target_audience: str = Field(description="Target audience summary")
    sections: list[SectionSkeleton]


SECTIONS_SYSTEM = """\
You are an expert instructional designer creating a course outline.

## RIGHT-SIZING PRINCIPLES
- Only create sections/lessons that add genuine learning value
- A focused 30-minute course is better than a padded 2-hour course
- If 3 sections and 6 lessons covers the topic well, that is perfect
- Each section must introduce meaningfully NEW concepts, not rehash
- If a topic fits in one lesson, do NOT split it across two
- Target: 2-5 sections, 2-4 lessons per section (can be fewer)

Create sections with lesson titles. Each section must provide:
- level: "introduce", "develop", or "master"
- intent: "teach", "assess", or "reinforce"
- emphasis: "low", "medium", or "high"
- mapped_outcome_indices: Zero-based indices of desired outcomes addressed

CONSTRAINT ENFORCEMENT:
- EVERY section MUST map to at least one outcome
- EVERY outcome MUST appear in at least one section's mapping
- Sections should progress logically from introduction to mastery
- Avoid redundancy across sections
"""

INTERNAL_DATA_ONLY_SECTIONS_SYSTEM = """\
You are an expert instructional designer creating a course outline.

## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE
**This course MUST be created using ONLY the provided source material.**

You are strictly forbidden from:
- Adding any information not present in the source documents
- Making up examples, facts, or explanations
- Using general knowledge to fill gaps
- Creating more content than the source material can support

If the source material is insufficient for a comprehensive course, create a
SMALLER course that covers only what is available.
Quality over quantity — a smaller, accurate course is better than a hallucinated one.

## RIGHT-SIZING PRINCIPLES
- Only create sections/lessons that add genuine learning value
- A focused 30-minute course is better than a padded 2-hour course
- If 3 sections and 6 lessons covers the topic well, that is perfect
- Each section must introduce meaningfully NEW concepts, not rehash
- If a topic fits in one lesson, do NOT split it across two
- Target: 2-5 sections, 2-4 lessons per section (can be fewer)

Create sections with lesson titles. Each section must provide:
- level: "introduce", "develop", or "master"
- intent: "teach", "assess", or "reinforce"
- emphasis: "low", "medium", or "high"
- mapped_outcome_indices: Zero-based indices of desired outcomes addressed

CONSTRAINT ENFORCEMENT:
- EVERY section MUST map to at least one outcome
- EVERY outcome MUST appear in at least one section's mapping
"""


def _attach_review_outline_tool(agent: Agent) -> None:
    @agent.tool
    async def review_outline(
        ctx: RunContext[str], outline_summary: str
    ) -> str:
        """Request a review of the outline structure you're generating.

        Call this with a summary of your planned sections and lesson titles to get
        feedback before finalizing. Incorporate the feedback into your final output.

        Args:
            outline_summary: Summary of planned sections with lesson titles.
        """
        review_fn = AgentRegistry.create_reviewer_tool("outline")
        return await review_fn(ctx, outline_summary)


AgentRegistry.register(
    AgentSpec(
        name="outline-sections-gen",
        system_prompt=SECTIONS_SYSTEM,
        output_type=SectionsOnlyOutput,
        category=AgentCategory.OUTLINE,
        deps_type=str,
        output_retries=3,
        description="Generates course outline sections with lesson titles (Phase 1).",
        tags=["outline", "sections"],
    ),
    post_build=[_attach_review_outline_tool],
)

AgentRegistry.register(AgentSpec(
    name="outline-sections-internal",
    system_prompt=INTERNAL_DATA_ONLY_SECTIONS_SYSTEM,
    output_type=SectionsOnlyOutput,
    category=AgentCategory.OUTLINE,
    deps_type=str,
    description="Generates course outline sections using only internal data.",
    tags=["outline", "sections", "internal-data"],
))


def build_sections_prompt(
    *,
    course_title: str,
    desired_outcome: str,
    desired_outcomes: list[str],
    personas: list[SMEPersona],
    target_audience: list[AudiencePersona],
    additional_context: str = "",
    rag_chunks: list[KnowledgeChunk] | None = None,
    course_plan_context: CoursePlan | None = None,
) -> str:
    """Build the user prompt for Phase 1 sections generation."""
    parts: list[str] = []

    parts.append(f"## Course Information\n- **Title:** {course_title}")
    parts.append(f"- **Desired Outcome:** {desired_outcome}")

    # Target audience
    if target_audience:
        parts.append("\n## Target Audience")
        for p in target_audience:
            parts.append(f"- **{p.name}** ({p.role}): {p.description}. Goals: {', '.join(p.goals)}")

    # SME knowledge
    if personas:
        parts.append("\n## Subject Matter Expert Knowledge")
        for p in personas:
            parts.append(f"- **{p.job_title}** — {p.description} Skills: {', '.join(p.skills)}. Voice: {p.voice}")

    # RAG content
    if rag_chunks:
        parts.append("\n## Knowledge Source Content")
        parts.append(
            "Use this content as the foundation for your course structure.\n"
        )
        for chunk in rag_chunks:
            parts.append(
                f"**[{chunk.source_name}]:** {chunk.content[:500]}"
            )

    # Course plan context
    if course_plan_context:
        parts.append("\n## Approved Course Plan")
        parts.append(
            "Follow this planned structure as closely as possible:\n"
        )
        for s in course_plan_context.planned_sections:
            parts.append(f"### {s.title}")
            parts.append(f"{s.description}")
            for lesson in s.lessons:
                parts.append(f"  - {lesson.title}")

    # Desired outcomes with indices
    parts.append("\n## Desired Learning Outcomes")
    for i, outcome in enumerate(desired_outcomes):
        parts.append(f"  {i}. {outcome}")

    # Additional context
    if additional_context:
        parts.append(f"\n## Additional Context\n{additional_context}")

    parts.append(
        "\nCreate a course outline with sections and lesson titles "
        "following the constraints above."
    )
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Phase 2: Lesson detail generation (per-section)
# ---------------------------------------------------------------------------


class LessonDetailOutput(BaseModel):
    """Phase 2 output: detailed lessons for a single section."""

    lessons: list[OutlineLesson]


LESSON_DETAIL_SYSTEM = """\
You are an expert instructional designer creating detailed lesson plans.

For each lesson title provided, create:
- title: The original or slightly improved title
- id: A unique identifier (e.g. "lesson-{section_num}-{lesson_num}")
- description: Brief lesson description
- estimated_duration_minutes: Duration estimate (5-20 minutes)
- learning_objectives: 2-4 specific, measurable learning objectives
- key_topics: Key topics covered

Ensure logical flow within the section. Each lesson should build on the previous one.
"""

AgentRegistry.register(AgentSpec(
    name="outline-lesson-detail",
    system_prompt=LESSON_DETAIL_SYSTEM,
    output_type=LessonDetailOutput,
    category=AgentCategory.OUTLINE,
    description="Expands lesson titles with metadata: objectives, duration, key topics (Phase 2).",
    tags=["outline", "lesson-detail"],
))


def build_lesson_detail_prompt(
    *,
    course_title: str,
    desired_outcome: str,
    section_title: str,
    section_description: str,
    section_index: int,
    lesson_titles: list[str],
    target_audience: list[AudiencePersona],
    personas: list[SMEPersona],
) -> str:
    """Build prompt for Phase 2 lesson detail generation."""
    audience_text = ""
    if target_audience:
        audience_text = "\n## Target Audience\n" + "\n".join(
            f"- {p.name} ({p.role}): {p.description}" for p in target_audience
        )

    sme_text = ""
    if personas:
        sme_text = "\n## SME Knowledge\n" + "\n".join(
            f"- {p.job_title}: {p.description}" for p in personas
        )

    titles_text = "\n".join(
        f"  {i + 1}. {t}" for i, t in enumerate(lesson_titles)
    )

    return f"""\
## Course: {course_title}
- **Desired Outcome:** {desired_outcome}

## Section {section_index + 1}: {section_title}
{section_description}

## Lesson Titles to Expand
{titles_text}
{audience_text}{sme_text}

For each lesson title above, generate detailed lesson metadata.
Use IDs in the format "lesson-{section_index + 1}-N" where N is the lesson number."""


async def generate_sections(
    *,
    api_key: str,
    course_title: str,
    desired_outcome: str,
    desired_outcomes: list[str],
    personas: list[SMEPersona],
    target_audience: list[AudiencePersona],
    additional_context: str = "",
    internal_data_only: bool = False,
    rag_chunks: list[KnowledgeChunk] | None = None,
    course_plan_context: CoursePlan | None = None,
) -> SectionsOnlyOutput:
    """Phase 1: Generate sections with lesson titles only.

    The wizard steps already provide rich context (personas, audience, outcomes)
    so no web research is needed at the outline stage.
    """
    model = make_model(api_key)

    prompt = build_sections_prompt(
        course_title=course_title,
        desired_outcome=desired_outcome,
        desired_outcomes=desired_outcomes,
        personas=personas,
        target_audience=target_audience,
        additional_context=additional_context,
        rag_chunks=rag_chunks,
        course_plan_context=course_plan_context,
    )

    agent_name = (
        "outline-sections-internal" if internal_data_only else "outline-sections-gen"
    )
    agent = AgentRegistry.get(agent_name)
    result = await agent.run(
        prompt,
        model=model,
        deps=api_key,
        usage_limits=UsageLimits(tool_calls_limit=1),
    )
    return result.output


async def generate_lesson_details(
    *,
    api_key: str,
    course_title: str,
    desired_outcome: str,
    section: SectionSkeleton,
    section_index: int,
    target_audience: list[AudiencePersona],
    personas: list[SMEPersona],
) -> list[OutlineLesson]:
    """Phase 2: Generate detailed lesson metadata for a section."""
    prompt = build_lesson_detail_prompt(
        course_title=course_title,
        desired_outcome=desired_outcome,
        section_title=section.title,
        section_description=section.description,
        section_index=section_index,
        lesson_titles=section.lesson_titles,
        target_audience=target_audience,
        personas=personas,
    )

    agent = AgentRegistry.get("outline-lesson-detail")
    result = await agent.run(prompt, model=make_model(api_key))
    return result.output.lessons


def assemble_outline(
    sections_output: SectionsOnlyOutput,
    lesson_details: dict[int, list[OutlineLesson]],
) -> CourseOutline:
    """Assemble the final CourseOutline from Phase 1 + Phase 2 results."""
    sections: list[OutlineSection] = []
    total_duration = 0

    for i, skeleton in enumerate(sections_output.sections):
        lessons = lesson_details.get(i, [])
        section_duration = sum(l.estimated_duration_minutes for l in lessons)
        total_duration += section_duration

        sections.append(
            OutlineSection(
                id=f"section-{i + 1}",
                title=skeleton.title,
                description=skeleton.description,
                lessons=lessons,
                order=i + 1,
            )
        )

    return CourseOutline(
        title=sections_output.title,
        description=sections_output.description,
        target_audience=sections_output.target_audience,
        sections=sections,
        estimated_total_duration_minutes=total_duration,
    )
