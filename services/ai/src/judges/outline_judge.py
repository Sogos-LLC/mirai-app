"""Outline quality judge — evaluates outline against ADDIE rubric."""

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from src.agents.model import make_model
from src.models.outline import CourseOutline


class OutlineQualityScore(BaseModel):
    """Quality assessment result for a course outline."""

    passes: bool = Field(description="Whether the outline meets quality standards")
    right_sized: bool = Field(
        description="Course is appropriately sized for the topic"
    )
    outcomes_covered: bool = Field(
        description="All desired outcomes are addressed by sections"
    )
    logical_progression: bool = Field(
        description="Sections and lessons flow in a logical order"
    )
    issues: list[str] = Field(
        default_factory=list, description="Specific quality issues found"
    )
    suggestions: list[str] = Field(
        default_factory=list, description="Improvement suggestions"
    )


OUTLINE_JUDGE_SYSTEM = """\
You are a senior instructional designer reviewing a course outline for quality.

## EVALUATION RUBRIC

### 1. Right-Sizing
- Is this the right number of sections/lessons for the topic?
- Could the same learning be achieved with fewer sections?
- Are there any sections that rehash content from earlier sections?
- Would a learner feel the course respects their time?

### 2. Outcome Coverage
- Does every desired outcome map to at least one lesson?
- Are any outcomes only superficially addressed?
- Are there sections that don't contribute to any outcome?

### 3. Logical Progression
- Do prerequisites come before dependent concepts?
- Does complexity increase gradually?
- Are foundational concepts in early sections?
- Does the final section synthesize or apply earlier learning?

### 4. Bloom's Taxonomy
- Do learning objectives use measurable verbs?
- Is there progression from remember/understand to apply/analyze/evaluate?
- Are higher-order objectives reserved for later lessons?

### 5. Redundancy Check
- Do any two lessons cover substantially the same material?
- Could any lessons be merged without losing value?

Set passes=true ONLY if all of: right_sized, outcomes_covered, logical_progression are true
AND there are no critical issues.

Be constructive but honest. A course with 5 excellent sections beats 10 mediocre ones.
"""

outline_judge_agent = Agent(
    output_type=OutlineQualityScore,
    system_prompt=OUTLINE_JUDGE_SYSTEM,
    name="outline-judge",
)


def _build_judge_prompt(
    outline: CourseOutline, desired_outcomes: list[str]
) -> str:
    """Build the evaluation prompt for the outline judge."""
    parts: list[str] = []

    parts.append(f"## Course: {outline.title}")
    parts.append(f"**Description:** {outline.description}")
    parts.append(f"**Target Audience:** {outline.target_audience}")
    parts.append(
        f"**Total Duration:** {outline.estimated_total_duration_minutes} minutes"
    )

    parts.append("\n## Desired Learning Outcomes")
    for i, outcome in enumerate(desired_outcomes):
        parts.append(f"  {i}. {outcome}")

    parts.append(f"\n## Outline ({len(outline.sections)} sections)")
    total_lessons = 0
    for section in outline.sections:
        parts.append(f"\n### Section {section.order}: {section.title}")
        parts.append(f"  {section.description}")
        for lesson in section.lessons:
            total_lessons += 1
            objectives_text = ", ".join(
                f"{o.description} [{o.bloom_level}]"
                for o in lesson.learning_objectives
            )
            parts.append(
                f"  - **{lesson.title}** ({lesson.estimated_duration_minutes}min): "
                f"{lesson.description}"
            )
            if objectives_text:
                parts.append(f"    Objectives: {objectives_text}")

    parts.append(f"\n**Total lessons:** {total_lessons}")
    parts.append("\nEvaluate this outline against the rubric.")
    return "\n".join(parts)


async def judge_outline(
    *,
    api_key: str,
    outline: CourseOutline,
    desired_outcomes: list[str],
) -> OutlineQualityScore:
    """Run the outline quality judge and return the score."""
    prompt = _build_judge_prompt(outline, desired_outcomes)
    result = await outline_judge_agent.run(prompt, model=make_model(api_key))
    return result.output
