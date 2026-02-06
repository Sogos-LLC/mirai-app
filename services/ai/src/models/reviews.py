"""Review models — structured feedback from reviewer agents."""

from pydantic import BaseModel, Field


class ComponentReview(BaseModel):
    """Review of a single lesson component."""

    type_appropriate: bool = Field(
        description="Is the component type appropriate for the content's pedagogical purpose?"
    )
    content_depth_ok: bool = Field(
        description="Is the content at the right depth — not too shallow, not overwhelming?"
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Specific, actionable improvements (max 3)",
    )
    summary: str = Field(
        description="One-sentence summary of review findings"
    )


class OutlineReview(BaseModel):
    """Review of a course outline's section structure."""

    logical_flow: bool = Field(
        description="Do sections build on each other in a logical progression?"
    )
    prerequisite_order: bool = Field(
        description="Are prerequisites taught before dependent concepts?"
    )
    right_sized: bool = Field(
        description="Is the course appropriately sized — no padding, no gaps?"
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Specific, actionable improvements (max 3)",
    )
    summary: str = Field(
        description="One-sentence summary of review findings"
    )


class QuizReview(BaseModel):
    """Review of a quiz component."""

    tests_objectives: bool = Field(
        description="Does the quiz test the lesson's stated learning objectives?"
    )
    plausible_distractors: bool = Field(
        description="Are wrong answers plausible but clearly incorrect?"
    )
    clear_question: bool = Field(
        description="Is the question unambiguous and well-phrased?"
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Specific, actionable improvements (max 3)",
    )
    summary: str = Field(
        description="One-sentence summary of review findings"
    )
