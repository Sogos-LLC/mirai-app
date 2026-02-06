"""Lesson content generation agents - plan components, generate each, segue."""

from pydantic import BaseModel, Field
from pydantic_ai import Agent, NativeOutput, WebSearchTool

from src.agents.model import make_model
from src.models.knowledge import KnowledgeChunk
from src.models.lesson import LessonComponent, LessonContent
from src.models.outline import OutlineLesson
from src.models.wizard import SMEPersona

# ---------------------------------------------------------------------------
# Phase 1: Component Plan
# ---------------------------------------------------------------------------


class PlannedComponent(BaseModel):
    """A planned component with type and purpose."""

    type: str = Field(description="Component type: TEXT, HEADING, QUIZ, CODE, IMAGE, CALLOUT, LIST, STATEMENT, DIVIDER")
    purpose: str = Field(description="What this component achieves and which learning objective it addresses")


class ComponentPlanOutput(BaseModel):
    """Output from component planning phase."""

    components: list[PlannedComponent] = Field(
        description="8-12 planned components with type and purpose"
    )


COMPONENT_PLAN_SYSTEM = """\
You are an expert instructional designer planning components for a lesson.

## INSTRUCTIONAL DESIGN PRINCIPLES
You are creating a LEARNING EXPERIENCE, not a document. For each concept, ask:
"What learning outcome is this trying to achieve, and which component best supports it?"

Map content to components by purpose:
- Definitions -> STATEMENT (short, memorable, quotable)
- Comparisons -> LIST (side-by-side clarity)
- Key principles -> CALLOUT (visual emphasis)
- Sequential steps -> LIST with numbered style
- Detailed explanations -> LIST with accordion style (expandable)
- Brief context -> TEXT (2-3 sentences only)
- Visual concepts -> IMAGE with preceding context

## STRICT CONTENT LIMITS
| Component | Limit | Description |
|-----------|-------|-------------|
| TEXT | Max 500 chars | 2-3 short sentences per text block |
| LIST | Max 7 items | Keep lists focused and scannable |
| STATEMENT | Max 200 chars | One memorable key takeaway |
| CALLOUT | Max 300 chars | Brief important info or tip |
| QUIZ | 2-5 options | Multiple choice only |

## STRUCTURAL REQUIREMENTS
- Minimum 4 different component types per lesson (variety)
- At least 1 STATEMENT or CALLOUT per lesson (emphasis)
- No consecutive HEADING components
- No consecutive IMAGE components
- Maximum 3 IMAGE components per lesson
- QUIZ must be the LAST component — exactly ONE per lesson

## ANTI-PATTERNS TO AVOID
- Long TEXT paragraphs (more than 3 sentences) — BREAK THEM UP
- Multiple QUIZ components — only ONE at the END
- QUIZ in the middle of lesson — must be LAST
- Definitions in TEXT — use STATEMENT instead
- Comparisons in prose — use LIST instead
- Starting lesson with IMAGE — always start with HEADING

## CORRECT PATTERNS
HEADING -> TEXT (2-3 sentences) -> STATEMENT -> LIST (key points) -> IMAGE -> CALLOUT -> QUIZ
HEADING -> TEXT -> LIST (process style) -> IMAGE -> HEADING -> STATEMENT -> TEXT -> QUIZ
HEADING -> STATEMENT -> TEXT -> LIST (accordion) -> CALLOUT -> IMAGE -> QUIZ

Plan 8-12 components. Each purpose MUST reference which learning objective it addresses.
"""

component_plan_agent = Agent(
    output_type=NativeOutput(ComponentPlanOutput),
    system_prompt=COMPONENT_PLAN_SYSTEM,
    name="lesson-component-plan",
)


def build_component_plan_prompt(
    *,
    lesson: OutlineLesson,
    course_title: str,
    course_context: str,
    section_title: str,
    section_index: int,
    lesson_index: int,
    personas: list[SMEPersona],
    rag_chunks: list[KnowledgeChunk] | None = None,
    internal_data_only: bool = False,
    previous_lesson_summaries: list[str] | None = None,
    concept_map_context: str = "",
) -> str:
    """Build prompt for component planning."""
    parts: list[str] = []

    if internal_data_only:
        parts.append("""\
## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE
**All lesson content MUST come from the provided source material below.**
You are strictly forbidden from adding information not in the source documents.
If source material is insufficient, create FEWER components.
Quality over quantity.
""")

    parts.append(f"## Course: {course_title}")
    parts.append(f"## Section {section_index + 1}: {section_title}")
    parts.append(f"## Lesson {lesson_index + 1}: {lesson.title}")
    parts.append(f"**Description:** {lesson.description}")

    # Learning objectives (scope enforcement)
    parts.append("\n## THIS LESSON'S LEARNING OBJECTIVES (scope boundary)")
    for i, obj in enumerate(lesson.learning_objectives):
        parts.append(f"  {i + 1}. {obj.description} [{obj.bloom_level}]")

    parts.append("\n## Key Topics")
    for topic in lesson.key_topics:
        parts.append(f"  - {topic}")

    # Cross-lesson context
    if previous_lesson_summaries:
        parts.append("\n## PREVIOUSLY COVERED CONCEPTS")
        for summary in previous_lesson_summaries:
            parts.append(f"- {summary}")
        parts.append(
            "\n## CROSS-REFERENCE GUIDANCE"
            "\n- Reference earlier lessons where relevant: \"Recall from [lesson] that...\""
            "\n- Do NOT re-teach concepts already covered above"
            "\n- Note forward references to upcoming topics where helpful"
        )

    # Concept map context
    if concept_map_context:
        parts.append(f"\n## CONCEPT PROGRESSION\n{concept_map_context}")

    # Course context for deduplication
    if course_context:
        parts.append(f"\n## Course Structure Context\n{course_context}")

    # SME knowledge
    if personas:
        parts.append("\n## SME Perspectives")
        for p in personas:
            parts.append(f"- **{p.job_title}** — {p.description} Voice: {p.voice}")

    # RAG content
    if rag_chunks:
        parts.append("\n## Source Material")
        for chunk in rag_chunks:
            parts.append(f"**[{chunk.source_name}]:** {chunk.content}")

    parts.append(
        "\n## SCOPE BOUNDARY ENFORCEMENT"
        "\nFocus ONLY on this lesson's learning objectives. "
        "Never duplicate content from other lessons. "
        "Each component must advance a SPECIFIC objective."
    )

    parts.append("\nPlan 8-12 components for this lesson.")
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Phase 2: Individual Component Generation
# ---------------------------------------------------------------------------

SINGLE_COMPONENT_SYSTEM = """\
You are generating a single educational component for a lesson.

Follow these formatting rules strictly by component type:

**TEXT:**
- 2-3 short paragraphs of HTML content using <p>, <strong>, <em> tags
- Add <br> between paragraphs for spacing
- Max 500 characters total

**HEADING:**
- Short, descriptive heading text
- Set heading_level (1-6, typically 2 or 3 within lessons)

**STATEMENT:**
- 1-2 sentences focusing on ONE key principle
- Max 200 characters. Make it memorable and quotable.

**LIST:**
- Max 7 items. For explanatory lists, use items with detail text.

**CALLOUT:**
- Brief important info. Max 300 characters.
- Set callout_type: info, warning, tip, or note

**QUIZ:**
- Clear question, 3-4 options, one correct answer
- Include explanation of why the answer is correct

**CODE:**
- Set code_language. Keep code focused and well-commented.

**IMAGE:**
- Set image_description (detailed, for AI generation) and image_alt_text

Generate exactly ONE component matching the specified type and purpose.
"""

GAP_ANALYSIS_SYSTEM = """\
You are an instructional content analyst. Given a course outline, determine whether
web research is needed to create accurate lesson content.

Return search queries ONLY when ALL of these conditions are met:
1. The topic requires CURRENT data (statistics, prices, regulations, version numbers)
2. The information changes frequently (annually or more often)
3. Getting it wrong would be factually misleading to learners

Return an EMPTY list (no research needed) when:
- The topic is conceptual, theoretical, or well-established knowledge
- Source material (RAG chunks) is provided and covers the topic
- The content is about principles, frameworks, or best practices
- The LLM has sufficient knowledge to generate accurate educational content
- The topic is historical, foundational, or slowly-evolving

Most educational courses do NOT need web research. Be extremely conservative.
Maximum 3 search queries if research IS needed.
"""


class GapAnalysis(BaseModel):
    """Result of analyzing knowledge gaps in a course outline."""

    search_queries: list[str] = Field(
        default_factory=list,
        description="Specific web search queries to fill knowledge gaps. Empty if no gaps. Max 3.",
    )


gap_analysis_agent = Agent(
    output_type=NativeOutput(GapAnalysis),
    system_prompt=GAP_ANALYSIS_SYSTEM,
    name="course-gap-analysis",
)


TARGETED_RESEARCH_SYSTEM = """\
You are a research assistant gathering specific information for educational content.

You will receive targeted search queries for specific knowledge gaps.
Search the web for each query and return a concise, factual summary.
Focus only on the specific information requested — do not add tangential content.
"""

targeted_research_agent = Agent(
    output_type=str,
    system_prompt=TARGETED_RESEARCH_SYSTEM,
    name="course-targeted-research",
    builtin_tools=[WebSearchTool()],
)


async def analyze_course_gaps(
    *,
    api_key: str,
    course_title: str,
    outline_summary: str,
    has_rag_content: bool,
) -> str:
    """Run course-level gap analysis and optional targeted research.

    Returns web_context string (empty if no gaps found).
    Called once per course, not per lesson.
    """
    from src.agents.model import make_model
    import structlog

    log = structlog.get_logger()
    model = make_model(api_key)

    rag_note = (
        "Source material (RAG) IS available for this course."
        if has_rag_content
        else "No source material provided — content relies on LLM knowledge."
    )

    gap_prompt = (
        f"## Course: {course_title}\n\n"
        f"## Source Material Status\n{rag_note}\n\n"
        f"## Course Outline\n{outline_summary}\n\n"
        f"Determine if web research is needed for this course."
    )

    gap_result = await gap_analysis_agent.run(gap_prompt, model=model)
    queries = gap_result.output.search_queries

    if not queries:
        log.info("course_no_gaps", course=course_title)
        return ""

    research_prompt = (
        f"Search for the following specific information for a course on '{course_title}':\n"
        + "\n".join(f"- {q}" for q in queries[:3])
    )
    research_result = await targeted_research_agent.run(research_prompt, model=model)
    log.info("course_gap_research_complete", course=course_title, queries=len(queries))
    return research_result.output


component_gen_agent = Agent(
    output_type=NativeOutput(LessonComponent),
    system_prompt=SINGLE_COMPONENT_SYSTEM,
    name="lesson-component-gen",
    output_retries=3,
)


def build_single_component_prompt(
    *,
    component_type: str,
    component_purpose: str,
    component_index: int,
    total_components: int,
    lesson: OutlineLesson,
    course_title: str,
    section_title: str,
    previous_components: list[LessonComponent],
    rag_chunks: list[KnowledgeChunk] | None = None,
    web_context: str = "",
) -> str:
    """Build prompt for generating a single component."""
    is_first = component_index == 0
    is_last = component_index == total_components - 1

    # Position context
    position_guidance = ""
    if is_first:
        position_guidance = (
            "This is the FIRST component. Start with a welcoming introduction "
            "that sets the stage for the lesson."
        )
    elif is_last:
        position_guidance = (
            "This is the LAST component. It should be a QUIZ that reinforces "
            "the key learning objectives."
        )

    # Previously generated context
    prev_text = ""
    if previous_components:
        prev_text = "\n## Previously Generated Components\n"
        for pc in previous_components:
            prev_text += f"- [{pc.type.value}] {pc.content[:100]}...\n"

    # RAG context
    rag_text = ""
    if rag_chunks:
        rag_text = "\n## Source Material\n"
        for chunk in rag_chunks:
            rag_text += f"**[{chunk.source_name}]:** {chunk.content[:300]}\n"

    # Web research context
    web_text = ""
    if web_context:
        web_text = f"\n## Web Research Context\n{web_context}\n"

    return f"""\
## Course: {course_title}
## Section: {section_title}
## Lesson: {lesson.title}

## Component to Generate
- **Type:** {component_type}
- **Purpose:** {component_purpose}
- **Position:** {component_index + 1} of {total_components}
- **ID:** component-{component_index + 1}
- **Order:** {component_index}

## Learning Objectives
{chr(10).join(f"  - {obj.description}" for obj in lesson.learning_objectives)}

{position_guidance}
{prev_text}{rag_text}{web_text}
Generate this {component_type} component. Set id="component-{component_index + 1}" and order={component_index}."""


# ---------------------------------------------------------------------------
# Phase 3: Segue Text Generation
# ---------------------------------------------------------------------------


class SegueOutput(BaseModel):
    """Transition text between lessons/sections."""

    segue_text: str = Field(description="1-3 sentences of transition text")


SEGUE_SYSTEM = """\
You are an expert instructional designer writing transition text between
course sections. Write natural, motivating transitions that connect concepts.
"""

segue_agent = Agent(
    output_type=NativeOutput(SegueOutput),
    system_prompt=SEGUE_SYSTEM,
    name="lesson-segue",
)


async def generate_segue(
    *,
    api_key: str,
    current_title: str,
    next_title: str | None,
    transition_type: str,
) -> str:
    """Generate transition text between lessons or sections.

    Args:
        transition_type: "lesson_to_lesson", "section_to_section", or "course_conclusion"
    """
    if transition_type == "course_conclusion":
        prompt = f"""\
## Transition Type: COURSE CONCLUSION
The lesson "{current_title}" is the final lesson of the entire course.

Write 2-3 sentences that congratulate the learner, summarize the achievement,
and encourage applying the learned skills."""
    elif transition_type == "section_to_section":
        prompt = f"""\
## Transition Type: SECTION TO SECTION
Current section just completed: "{current_title}"
Next section: "{next_title}"

Write 2-3 sentences that acknowledge completion and preview the next section."""
    else:
        prompt = f"""\
## Transition Type: LESSON TO LESSON
Current lesson: "{current_title}"
Next lesson: "{next_title}"

Write 1-2 sentences connecting the concepts to the next topic."""

    result = await segue_agent.run(prompt, model=make_model(api_key))
    return result.output.segue_text
