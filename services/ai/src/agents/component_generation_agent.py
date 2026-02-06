"""Component generation agent — produces proto-compliant lesson components.

Uses NativeOutput(LessonComponents) to force Gemini structured output
matching the exact proto schema. Receives positional metadata, outcome
tracking context, and template rules to produce contextually appropriate content.
"""

from __future__ import annotations

from dataclasses import dataclass

from pydantic_ai import Agent, NativeOutput

from src.models.component_content import LessonComponents
from src.models.outcome_tracker import OutcomeCoverage


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


# =============================================================================
# Agent Definition
# =============================================================================

COMPONENT_SYSTEM = """\
You are an expert instructional content creator. You generate lesson content as
structured components that render directly in a learning platform.

## Component Types Available
- **text**: Rich HTML content (use <p>, <strong>, <em>, <ul>, <ol>, <li> tags)
- **heading**: Section headers (levels 2-4, never level 1)
- **quiz**: Multiple-choice questions with 3-4 options, correct answer, and explanation
- **code**: Code snippets with language specification
- **callout**: Info/warning/tip/success boxes for key points
- **statement**: Key takeaways — bold, memorable statements
- **quote**: Expert quotes with attribution
- **list**: Structured lists with a style field:
  - bulleted: simple bullet points
  - numbered: ordered/sequential items
  - icon: items with emoji/icon identifiers
  - process: step-by-step workflows
  - accordion: expandable term/definition pairs — use for concepts, tools,
    comparisons, or any content where each item has a short label (text) and
    a longer explanation (description). Perfect for "X: description" patterns.
- **image**: Image descriptions for AI generation (no URL needed)
- **divider**: Visual separators between major sections

## Content Guidelines
1. Write REAL, educational content — not placeholders or summaries
2. Use HTML in text components: <p> for paragraphs, <strong> for emphasis,
   <ul>/<ol>/<li> for inline lists, <code> for inline code
3. Every lesson MUST have at least one quiz component
4. Vary component types — don't use 5 text blocks in a row
5. Heading levels: use 2 for major sections, 3 for subsections, 4 for minor points
6. Quiz questions should test understanding, not recall — use application/analysis level
7. Each quiz must have 3-4 options with exactly one correct answer (a, b, c, or d)
8. When content follows a "Term: explanation" pattern (e.g., comparing tools,
   listing types/categories, defining concepts), use an accordion list — NOT a
   text block. Put the term in `text` and the explanation in `description`.

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
"""

component_generation_agent = Agent(
    output_type=NativeOutput(LessonComponents),
    system_prompt=COMPONENT_SYSTEM,
    name="component-generator",
)


# =============================================================================
# Prompt Builder
# =============================================================================


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

    return f"""\
## Course Context
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

## Instructions
Generate 5-15 structured components for this lesson. Follow the template guidelines
but adapt as needed for the content. Write REAL, detailed educational content.
Every text component should contain substantial HTML paragraphs — not one-liners.
Include at least one quiz. Report which outcome keys you introduced or practiced."""
