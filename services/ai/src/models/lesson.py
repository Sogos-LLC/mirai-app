"""Lesson content models - structured output from lesson generation."""

from enum import Enum

from pydantic import BaseModel, Field


class ComponentType(str, Enum):
    """Types of lesson content components."""

    TEXT = "text"
    HEADING = "heading"
    QUIZ = "quiz"
    CODE = "code"
    IMAGE = "image"
    CALLOUT = "callout"
    LIST = "list"
    TABLE = "table"
    DIVIDER = "divider"


class QuizOption(BaseModel):
    """A quiz answer option."""

    text: str
    is_correct: bool = False
    explanation: str = ""


class ProvenanceInfo(BaseModel):
    """Provenance tracking for grounding AI content to source material."""

    source_id: str = Field(description="Knowledge source ID")
    source_name: str = Field(description="Human-readable source name")
    relevance_score: float = Field(
        default=0.0, description="How relevant this source was (0-1)"
    )
    chunk_indices: list[int] = Field(
        default_factory=list, description="Which chunks were used"
    )


class LessonComponent(BaseModel):
    """A single component within a lesson (text block, quiz, code, etc.)."""

    id: str = Field(description="Unique component identifier")
    type: ComponentType = Field(description="Component type")
    content: str = Field(default="", description="Primary content (text, markdown)")
    heading_level: int | None = Field(default=None, description="Heading level (1-6)")

    # Quiz-specific
    quiz_question: str | None = Field(default=None, description="Quiz question text")
    quiz_options: list[QuizOption] | None = Field(
        default=None, description="Quiz answer options"
    )
    quiz_explanation: str | None = Field(
        default=None, description="Explanation shown after answering"
    )

    # Code-specific
    code_language: str | None = Field(
        default=None, description="Programming language"
    )

    # Image-specific
    image_description: str | None = Field(
        default=None, description="AI-generated image description"
    )
    image_alt_text: str | None = Field(default=None, description="Image alt text")

    # Callout-specific
    callout_type: str | None = Field(
        default=None, description="Callout type: info, warning, tip, note"
    )

    # Provenance
    provenance: list[ProvenanceInfo] = Field(
        default_factory=list, description="Source attribution"
    )
    order: int = Field(default=0, description="Display order within lesson")


class LessonContent(BaseModel):
    """Complete generated content for a single lesson."""

    lesson_id: str = Field(description="Lesson identifier from outline")
    title: str = Field(description="Lesson title")
    summary: str = Field(default="", description="Brief lesson summary")
    components: list[LessonComponent] = Field(
        description="Ordered content components"
    )
    estimated_duration_minutes: int = Field(
        default=15, description="Estimated reading/completion time"
    )
