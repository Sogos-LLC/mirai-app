"""Component generation agent — produces proto-compliant lesson components.

Uses NativeOutput(LessonComponents) to force Gemini structured output
matching the exact proto schema. Receives positional metadata, outcome
tracking context, and template rules to produce contextually appropriate content.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.attribution import SourceReference
from src.models.component_content import LessonComponents
from src.models.component_schema import (
    format_component_reference,
    format_component_selection_table,
    format_variety_rules,
)
from src.models.outcome_tracker import OutcomeCoverage
from src.models.resource_hint import ResourceHint


# =============================================================================
# Component Context (all metadata for prompt construction)
# =============================================================================


@dataclass
class ComponentContext:
    """All metadata needed to generate components for a single lesson."""

    # Course-level
    topic: str
    audience: str
    course_goal: str

    # Section-level
    section_title: str
    section_description: str
    section_outcomes: list[str]
    is_first_section: bool
    is_last_section: bool
    next_section_title: str | None

    # Lesson-level
    lesson_title: str
    lesson_objective: str
    is_first_lesson: bool
    is_last_lesson: bool
    lesson_number: int  # 1-based position within section
    total_lessons_in_section: int
    next_lesson_title: str | None  # next lesson in same section (None if last)

    # Template
    block_sequence: list[str]
    interaction_rules: list[str]

    # Outcome tracking
    outcomes_to_introduce: list[OutcomeCoverage]
    outcomes_to_reinforce: list[OutcomeCoverage]
    recently_covered: list[str]

    # External resources (parsed from user context)
    resource_hints: list[ResourceHint] = None  # type: ignore[assignment]

    # Cross-section dedup: content already generated in prior sections
    prior_content_digest: list[str] = field(default_factory=list)

    # RAG context for source attribution
    rag_context: str = ""
    source_references: list[SourceReference] = field(default_factory=list)

    # Strict mode: only use internal knowledge, no outside information
    strict_knowledge_only: bool = False

    # Creator's additional instructions (e.g. "focus on practical examples")
    additional_context: str = ""

    # Component hints from structure agent (per-section suggestions)
    component_hints: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        if self.resource_hints is None:
            self.resource_hints = []


# =============================================================================
# Agent Definition
# =============================================================================

COMPONENT_SYSTEM = f"""\
You are an expert instructional content creator. You generate lesson content as
structured components that render directly in a learning platform.

{format_component_reference()}

{format_component_selection_table()}

{format_variety_rules()}

## Content Guidelines
1. Write REAL, educational content — not placeholders or summaries
2. Use HTML in text components: <p> for paragraphs, <strong> for emphasis,
   <ul>/<ol>/<li> for inline lists, <code> for inline code,
   <a href="URL"> for hyperlinks to external resources
3. Heading levels: use 2 for major sections, 3 for subsections, 4 for minor points
4. Quiz questions should test understanding, not recall — use application/analysis level
5. Each quiz must have 3-4 options with exactly one correct answer (a, b, c, or d)
6. Statement components are for short, punchy takeaways — NO inline code or HTML.
   If the takeaway mentions code/commands, use a callout instead.

## Image Style Selection
When creating an **image** component, always set imageStyle to the most appropriate style:
- **diagram**: For architecture, system flows, relationships, processes with boxes/arrows
- **chart**: For data comparisons, trends, distributions with axes and legends
- **infographic**: For summaries, overviews with icons, short text, visual hierarchy
- **photograph**: For real-world examples, case studies, people in context
- **illustration**: For abstract concepts, analogies, metaphors, conceptual art
- **screenshot**: For software tutorials, UI walkthroughs, annotated interfaces

## Positional Awareness
- If this is the FIRST lesson of the FIRST section: include a welcoming introduction
- If this is the FIRST lesson of a section: introduce the section theme
- If there is a NEXT LESSON in the same section: end with a brief segue to that lesson
- If this is the LAST lesson of a section (and not last overall): end with a segue to the next section
- If this is the LAST lesson of the LAST section: include a course wrap-up/summary
- NEVER segue to the next section unless this is the LAST lesson of the current section

## Outcome Tracking
- You MUST introduce outcomes marked as "to_introduce" — these are new concepts for this lesson
- You MAY reinforce outcomes marked as "to_reinforce" — revisit from a new angle
- AVOID repeating outcomes listed as "recently_covered" unless adding a new perspective
- Report which outcome keys you covered in outcomes_covered

## Source Attribution
When a Knowledge Sources section is provided:
- Put source numbers (integers) in `source_refs` fields — metadata only, NOT visible text
- For **text** components: each paragraph's `source_refs` list
- For all **other** components: component-level `source_refs` field
- Empty `source_refs` = content from model knowledge

### Correct: `"source_refs": [3]` and clean HTML without any source markers
### WRONG: `"html": "...text [Source 3] more text..."` — NEVER put [Source N] in HTML or visible text
### WRONG: `"text": "According to Source 3..."` — NEVER mention source numbers in content
"""

AgentRegistry.register(AgentSpec(
    name="component-generator",
    system_prompt=COMPONENT_SYSTEM,
    output_type=LessonComponents,
    category=AgentCategory.LESSON,
    description="Generates full lesson content as structured components.",
    tags=["lesson", "component-generation"],
))


# =============================================================================
# Prompt Builder
# =============================================================================


def _build_prior_content_section(digest: list[str]) -> str:
    """Build the 'Previously Generated Content' prompt section."""
    if not digest:
        return ""
    digest_str = "\n".join(f"- {item}" for item in digest)
    return f"""\
## Previously Generated Content (DO NOT REPEAT)
The following headings, quiz questions, statements, and terms have already been generated
in earlier sections. Do NOT create components that cover the same topic or ask the same
questions — find a new angle or skip the topic entirely.
{digest_str}

"""


def _build_component_hints_section(hints: list[str]) -> str:
    """Build the 'Suggested Component Types' prompt section from structure-level hints."""
    if not hints:
        return ""
    hints_str = "\n".join(f"- {h}" for h in hints)
    return f"""\
## Suggested Component Types for This Section
The course structure recommends using these component types for this section's content:
{hints_str}

Use these as guidance, but also include other types to ensure variety.

"""


def build_component_prompt(ctx: ComponentContext) -> str:
    """Build the user prompt for component generation from context."""
    # Position description
    position_parts = [
        f"Lesson {ctx.lesson_number} of {ctx.total_lessons_in_section} in this section."
    ]
    if ctx.is_first_section and ctx.is_first_lesson:
        position_parts.append("This is the FIRST lesson of the ENTIRE COURSE. Welcome the learner.")
    elif ctx.is_first_lesson:
        position_parts.append(
            f"This is the FIRST lesson of section '{ctx.section_title}'. "
            "Introduce the section theme."
        )
    if ctx.is_last_section and ctx.is_last_lesson:
        position_parts.append("This is the LAST lesson of the ENTIRE COURSE. Wrap up and summarize.")
    elif ctx.is_last_lesson and ctx.next_section_title:
        position_parts.append(
            f"This is the LAST lesson of this section. "
            f"End with a segue to the next section: '{ctx.next_section_title}'."
        )
    elif ctx.next_lesson_title:
        position_parts.append(
            f"End with a brief segue to the next lesson: '{ctx.next_lesson_title}'. "
            "Do NOT mention the next section — stay within the current section."
        )
    position_str = "\n".join(position_parts)

    # Outcomes to introduce
    introduce_str = "\n".join(
        f"- {o.full_description}" for o in ctx.outcomes_to_introduce
    ) if ctx.outcomes_to_introduce else "None — focus on the lesson objective."

    # Outcomes to reinforce
    reinforce_str = "\n".join(
        f"- {o.full_description} (introduced in: {o.introduced_in_lesson})"
        for o in ctx.outcomes_to_reinforce
    ) if ctx.outcomes_to_reinforce else "None."

    # Recently covered (avoid)
    avoid_str = ", ".join(ctx.recently_covered) if ctx.recently_covered else "None."

    # Template
    sequence_str = " → ".join(ctx.block_sequence) if ctx.block_sequence else "Use your judgment."
    rules_str = "\n".join(f"- {r}" for r in ctx.interaction_rules) if ctx.interaction_rules else "- Use best practices."

    # Section outcomes
    section_outcomes_str = "\n".join(f"- {s}" for s in ctx.section_outcomes)

    # External resources (only when provided)
    resources_str = ""
    if ctx.resource_hints:
        resource_lines = []
        for h in ctx.resource_hints:
            label = f"{h.media_type}"
            if h.provider:
                label += f"/{h.provider}"
            resource_lines.append(f"- [{label}] {h.url}")
        resources_str = f"""
## Available External Resources
These resources were provided by the course creator. Incorporate where relevant:
{chr(10).join(resource_lines)}

IMPORTANT — follow these rules for EVERY resource listed above:
- For **video/audio/interactive** resources: create a **multimedia** component with the exact URL.
- For **reference** resources: you MUST include each reference URL as a clickable
  <a href="URL">descriptive text</a> hyperlink in at least one **text** or **callout** component.
  Weave them naturally into the content (e.g., '<p>For a deeper dive, see
  <a href="https://en.wikipedia.org/wiki/Example">the Wikipedia article</a>.</p>').
  Do NOT merely summarize the reference — the actual clickable link MUST appear in the HTML.
- NEVER invent URLs — only use URLs explicitly listed above.
"""

    # Strict knowledge constraint
    strict_str = ""
    if ctx.strict_knowledge_only and ctx.rag_context:
        strict_str = """
## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE
**All lesson content MUST come from the provided source material below.**
You are strictly forbidden from adding information not present in the source documents.
If source material is insufficient for a topic, create FEWER components rather than inventing content.
Quality and accuracy over quantity. Every claim must be traceable to the source material.
"""

    # Creator's additional instructions
    extra_str = ""
    if ctx.additional_context:
        extra_str = f"""
## Creator's Additional Instructions (HIGH PRIORITY)
{ctx.additional_context}
"""

    return f"""\
{strict_str}{extra_str}## Course Context
**Topic**: {ctx.topic}
**Audience**: {ctx.audience}
**Course Goal**: {ctx.course_goal}

## Section: {ctx.section_title}
{ctx.section_description}
**Section Outcomes**:
{section_outcomes_str}

## Lesson
**Title**: {ctx.lesson_title}
**Objective**: {ctx.lesson_objective}

## Position
{position_str}

## Outcome Tracking
**Must introduce (pending for this section)**:
{introduce_str}

**May reinforce (from earlier sections)**:
{reinforce_str}

**Recently covered (avoid unless new angle)**:
{avoid_str}

## Template Guidelines
**Suggested block sequence**: {sequence_str}
**Interaction rules**:
{rules_str}
{resources_str}
{ctx.rag_context}
{_build_prior_content_section(ctx.prior_content_digest)}
{_build_component_hints_section(ctx.component_hints)}
## Instructions
Generate 8-15 structured components for this lesson. Use at least 5 different component
types. Every lesson MUST include at least 1 image (with appropriate imageStyle) and at
least 1 interactive element (quiz, task_list, or code). Follow the template guidelines
but adapt as needed for the content. Write REAL, detailed educational content.
Every text component should contain substantial HTML paragraphs — not one-liners.
Report which outcome keys you introduced or practiced."""
