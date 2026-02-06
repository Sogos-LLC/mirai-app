"""Structural elements agents — section intros, summaries, and course conclusion."""

from pydantic import BaseModel, Field
from pydantic_ai import Agent, NativeOutput

from src.agents.model import make_model
from src.models.outline import CourseOutline


# ---------------------------------------------------------------------------
# Output models
# ---------------------------------------------------------------------------


class StructuralElementsOutput(BaseModel):
    """All structural elements for a course, generated in one batch."""

    section_introductions: dict[str, str] = Field(
        description="Map of section_id → 2-3 sentence introduction"
    )
    section_summaries: dict[str, str] = Field(
        description="Map of section_id → 2-3 sentence summary"
    )
    conclusion: str = Field(
        description="3-5 sentence course conclusion"
    )


# ---------------------------------------------------------------------------
# Agent
# ---------------------------------------------------------------------------

STRUCTURAL_SYSTEM = """\
You are an expert instructional designer writing structural elements for a course.

Generate the following for each section and the course as a whole:

## Section Introductions (2-3 sentences each)
- Connect to the previous section (what was learned before)
- Preview what this section will cover and why it matters
- For the first section: set the stage for the entire course

## Section Summaries (2-3 sentences each)
- Recap the key concepts covered in this section
- Preview what comes next (for all except the last section)
- For the last section: bridge to the course conclusion

## Course Conclusion (3-5 sentences)
- Congratulate the learner on completing the course
- Summarize the overall journey and key achievements
- Encourage applying the learned skills

Keep a warm, encouraging, and professional tone throughout.
Use the section and lesson titles to make references specific.
"""

structural_agent = Agent(
    output_type=NativeOutput(StructuralElementsOutput),
    system_prompt=STRUCTURAL_SYSTEM,
    name="structural-elements",
)


def _build_structural_prompt(outline: CourseOutline) -> str:
    """Build the prompt for generating structural elements."""
    parts: list[str] = []

    parts.append(f"## Course: {outline.title}")
    parts.append(f"**Description:** {outline.description}")

    parts.append(f"\n## Course Structure ({len(outline.sections)} sections)")
    for section in outline.sections:
        parts.append(f"\n### {section.id}: {section.title}")
        parts.append(f"  {section.description}")
        for lesson in section.lessons:
            summary = ""
            if lesson.content:
                summary = f" — {lesson.content.summary}"
            parts.append(f"  - {lesson.title}{summary}")

    parts.append(
        "\nGenerate introductions and summaries for each section "
        "(keyed by section_id like 'section-1') and a course conclusion."
    )
    return "\n".join(parts)


async def generate_structural_elements(
    *, api_key: str, outline: CourseOutline
) -> StructuralElementsOutput:
    """Generate all structural elements for a course in one batch."""
    prompt = _build_structural_prompt(outline)
    result = await structural_agent.run(prompt, model=make_model(api_key))
    return result.output
