"""Section QA judge — reviews all components for one section.

Uses NativeOutput(SectionQAResult) to produce structured review.
Checks for deduplication, ordering issues, and ADDIE alignment.
Runs once per section (no iterative loop).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.component_content import LessonComponents


# =============================================================================
# QA Result Model
# =============================================================================


class SectionQAResult(BaseModel):
    """Output from the section QA judge."""

    approved: bool = Field(description="Whether the section passes QA")
    component_ids_to_remove: list[str] = Field(
        default_factory=list,
        description="IDs of components to remove (duplicates, off-topic)",
    )
    reasoning: str = Field(
        description="Brief explanation of QA findings and any recommended changes",
    )


# =============================================================================
# Agent Definition
# =============================================================================

SECTION_QA_SYSTEM = """\
You are an instructional design quality reviewer. You review ALL components
for a single course section and check for quality issues.

## Review Criteria

1. **Deduplication**: Flag components across lessons that teach the exact same
   concept in the same way. Two quizzes testing the same fact, or two text blocks
   explaining the same concept with similar wording, should be flagged.
   Different perspectives on the same topic are OK.

2. **Ordering**: Check if prerequisites come after dependent concepts.
   A quiz should not test something that hasn't been introduced yet.

3. **Removal**: Flag components that are:
   - Completely redundant (duplicate of another component)
   - Off-topic for this section
   - Filler content (generic motivational text with no educational value)

4. **ADDIE Alignment**: Verify components collectively address the section outcomes.

## Rules
- Be conservative: only flag clear issues, not subjective preferences
- Prefer keeping content over removing it
- If the section is generally good, set approved=true with empty removal list
- Only set approved=false if there are serious structural issues
"""

AgentRegistry.register(AgentSpec(
    name="section-qa-judge",
    system_prompt=SECTION_QA_SYSTEM,
    output_type=SectionQAResult,
    category=AgentCategory.JUDGE,
    description="Reviews section components for deduplication, ordering, and ADDIE alignment.",
    tags=["judge", "section-qa"],
))


# =============================================================================
# Prompt Builder
# =============================================================================


def build_section_qa_prompt(
    section_title: str,
    section_description: str,
    section_outcomes: list[str],
    lesson_components: dict[str, LessonComponents],
    course_goal: str,
    prior_content_digest: list[str] | None = None,
) -> str:
    """Build the QA prompt for a section's worth of components.

    Args:
        section_title: Title of the section under review.
        section_description: Description of the section.
        section_outcomes: List of outcome descriptions for this section.
        lesson_components: Map of lesson_title → LessonComponents (agent output).
        course_goal: The overall course goal for ADDIE context.
        prior_content_digest: Content identifiers from earlier sections for cross-section dedup.
    """
    outcomes_str = "\n".join(f"- {o}" for o in section_outcomes)

    # Build content listing
    content_listing = ""
    for lesson_title, lc in lesson_components.items():
        content_listing += f"\n### Lesson: {lesson_title}\n"
        for idx, comp in enumerate(lc.components):
            comp_id = f"{lesson_title}:{idx}"
            content_listing += f"\n**[{comp_id}] {comp.type}**\n"
            # Serialize component content for review
            content_listing += f"{comp.model_dump_json(exclude={'type'})}\n"

    # Cross-section context
    prior_section = ""
    if prior_content_digest:
        digest_str = "\n".join(f"- {item}" for item in prior_content_digest)
        prior_section = f"""
## Content From Previous Sections
The following content was generated in earlier sections. Flag any components in THIS
section that substantially duplicate these topics:
{digest_str}

"""

    return f"""\
## Section Under Review: {section_title}
{section_description}

## Course Goal
{course_goal}

## Section Outcomes
{outcomes_str}
{prior_section}
## All Components in This Section
{content_listing}

## Instructions
Review all components in this section. For each issue found:
1. Identify the component by its [lesson_title:index] ID
2. Explain why it should be removed

Set approved=true if the section is ready (even with minor issues).
Set approved=false only for serious problems (e.g., major gaps in outcome coverage).

List component IDs to remove in component_ids_to_remove.
Keep the reasoning brief and actionable."""
