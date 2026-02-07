"""Lesson quality judge — evaluates lesson content against pedagogical rubric."""

from pydantic import BaseModel, Field

from src.agents.model import make_model
from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.lesson import LessonContent
from src.models.outline import OutlineLesson


class LessonQualityScore(BaseModel):
    """Quality assessment result for a lesson."""

    passes: bool = Field(description="Whether the lesson meets quality standards")
    teaches_objectives: bool = Field(
        description="Lesson content addresses its learning objectives"
    )
    connects_to_prior: bool = Field(
        description="Lesson references or builds on prior lessons"
    )
    engaging: bool = Field(
        description="Content uses varied components and is not monotonous"
    )
    issues: list[str] = Field(
        default_factory=list, description="Specific quality issues found"
    )


LESSON_JUDGE_SYSTEM = """\
You are a senior instructional designer reviewing a single lesson for quality.

## EVALUATION RUBRIC

### 1. Objective Coverage
- Does the lesson content actually teach each of its learning objectives?
- Are objectives addressed with appropriate depth (not just mentioned)?
- Is there an assessment (quiz) that tests the objectives?

### 2. Cross-Lesson Coherence
- Does the lesson reference or build upon concepts from earlier lessons?
- Does it avoid re-teaching what was already covered?
- Is the context appropriate for its position in the course?

### 3. Engagement & Variety
- Are at least 4 different component types used?
- Is there a mix of instruction and interaction (not just walls of text)?
- Are STATEMENT/CALLOUT components used for emphasis?
- Is the quiz well-crafted with plausible distractors?

### 4. Content Quality
- Are text blocks concise (not verbose paragraph dumps)?
- Are lists used for structured information?
- Is the content at the appropriate depth for the target audience?

Set passes=true ONLY if teaches_objectives AND engaging are both true.
connects_to_prior can be false for the very first lesson.

Be constructive. A focused 8-component lesson beats a bloated 15-component one.
"""

AgentRegistry.register(AgentSpec(
    name="lesson-judge",
    system_prompt=LESSON_JUDGE_SYSTEM,
    output_type=LessonQualityScore,
    category=AgentCategory.JUDGE,
    description="Evaluates lesson content against pedagogical quality rubric.",
    tags=["judge", "lesson"],
))


def _build_lesson_judge_prompt(
    lesson_meta: OutlineLesson,
    content: LessonContent,
    previous_summaries: list[str],
) -> str:
    """Build the evaluation prompt for the lesson judge."""
    parts: list[str] = []

    parts.append(f"## Lesson: {lesson_meta.title}")
    parts.append(f"**Description:** {lesson_meta.description}")

    parts.append("\n## Learning Objectives")
    for obj in lesson_meta.learning_objectives:
        parts.append(f"  - {obj.description} [{obj.bloom_level}]")

    if previous_summaries:
        parts.append("\n## Previous Lessons (for cross-reference check)")
        for summary in previous_summaries[-5:]:
            parts.append(f"  - {summary}")

    parts.append(f"\n## Generated Content ({len(content.components)} components)")
    for comp in content.components:
        preview = comp.content[:200] if comp.content else ""
        parts.append(f"  [{comp.type.value}] {preview}")
        if comp.quiz_question:
            parts.append(f"    Quiz: {comp.quiz_question}")

    if content.segue_text:
        parts.append(f"\n## Segue: {content.segue_text}")

    parts.append("\nEvaluate this lesson against the rubric.")
    return "\n".join(parts)


async def judge_lesson(
    *,
    api_key: str,
    lesson_meta: OutlineLesson,
    content: LessonContent,
    previous_summaries: list[str] | None = None,
) -> LessonQualityScore:
    """Run the lesson quality judge and return the score."""
    prompt = _build_lesson_judge_prompt(
        lesson_meta, content, previous_summaries or []
    )
    agent = AgentRegistry.get("lesson-judge")
    result = await agent.run(prompt, model=make_model(api_key))
    return result.output
