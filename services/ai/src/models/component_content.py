"""Proto-matching Pydantic models for NativeOutput structured generation.

Mirrors proto/mirai/v1/component_content.proto exactly.
Uses camelCase aliases for proto3 JSON serialization.
These are the strict contract — the NativeOutput target for the component agent.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field


# =============================================================================
# Individual Component Content Types
# =============================================================================


class TextComponent(BaseModel):
    """Rich HTML-formatted text block."""

    type: Literal["text"] = "text"
    textHtml: str = Field(description="HTML-formatted text content")


class HeadingComponent(BaseModel):
    """Section heading."""

    type: Literal["heading"] = "heading"
    headingLevel: int = Field(ge=1, le=6, description="Heading level 1-6")
    headingText: str = Field(description="Heading text")


class QuizOption(BaseModel):
    """A single quiz answer option."""

    id: str = Field(description="Option identifier (a, b, c, d)")
    text: str = Field(description="Option text")


class QuizComponent(BaseModel):
    """Multiple-choice quiz question."""

    type: Literal["quiz"] = "quiz"
    quizQuestion: str = Field(description="The quiz question")
    quizOptions: list[QuizOption] = Field(
        min_length=2, max_length=6, description="Answer options"
    )
    quizCorrectAnswerId: str = Field(description="ID of the correct option")
    quizExplanation: str = Field(description="Explanation of the correct answer")


class CodeComponent(BaseModel):
    """Code snippet with syntax highlighting."""

    type: Literal["code"] = "code"
    code: str = Field(description="The code content")
    language: str = Field(description="Programming language (e.g., python, javascript)")


class CalloutComponent(BaseModel):
    """Highlighted information box."""

    type: Literal["callout"] = "callout"
    style: str = Field(description="Callout style: info, warning, success, error, tip")
    title: str | None = Field(default=None, description="Optional callout title")
    content: str = Field(description="Callout content text")


class StatementComponent(BaseModel):
    """Key takeaway or important statement."""

    type: Literal["statement"] = "statement"
    statementText: str = Field(description="The main statement text")
    statementSubtext: str | None = Field(
        default=None, description="Optional supporting subtext"
    )


class QuoteComponent(BaseModel):
    """Expert or notable quote."""

    type: Literal["quote"] = "quote"
    text: str = Field(description="The quote text")
    author: str = Field(description="Quote author name")
    title: str | None = Field(default=None, description="Author's title or role")
    source: str | None = Field(default=None, description="Source reference")


class ListItem(BaseModel):
    """A single list item."""

    text: str = Field(description="Item text")
    icon: str | None = Field(default=None, description="Optional icon identifier")
    description: str | None = Field(
        default=None, description="Optional item description"
    )


class ListComponent(BaseModel):
    """Structured list content."""

    type: Literal["list"] = "list"
    style: str = Field(
        description="List style: bulleted, numbered, icon, process, accordion"
    )
    items: list[ListItem] = Field(min_length=1, description="List items")
    title: str | None = Field(default=None, description="Optional list title")


class ImageComponent(BaseModel):
    """Image with metadata (placeholder for AI-generated images)."""

    type: Literal["image"] = "image"
    imageDescription: str = Field(description="Detailed image description for generation")
    imageAltText: str = Field(description="Accessibility alt text")
    imageCaption: str | None = Field(default=None, description="Optional caption")


class DividerComponent(BaseModel):
    """Visual separator between content sections."""

    type: Literal["divider"] = "divider"
    style: str = Field(default="line", description="Divider style: line, dots, space")


class TaskListItem(BaseModel):
    """A single item in an interactive task list."""

    id: str = Field(description="Unique identifier per item (a, b, c...)")
    contentHtml: str = Field(description="Rich HTML content (<code>, <strong>, <em>, <p>, <ol>, <li>)")


class TaskListComponent(BaseModel):
    """Interactive checklist for hands-on practice exercises."""

    type: Literal["task_list"] = "task_list"
    title: str = Field(description="Heading text (e.g., 'Practice Time')")
    emoji: str | None = Field(default=None, description="Optional emoji prefix (e.g., '✏️')")
    items: list[TaskListItem] = Field(min_length=1, description="Checklist items")


class MultimediaComponent(BaseModel):
    """Embedded video, audio, or interactive media.

    Uses 'mediaType' to avoid collision with the discriminator 'type' field.
    Serialization renames mediaType → type for proto/frontend compatibility.
    """

    type: Literal["multimedia"] = "multimedia"
    mediaType: str = Field(description="Media subtype: video, audio, or interactive")
    url: str = Field(description="Media URL")
    title: str = Field(description="Media title")
    description: str | None = Field(default=None, description="What the media contains")
    provider: str | None = Field(
        default=None, description="Provider: youtube, vimeo, soundcloud, etc."
    )
    isPlaceholder: bool | None = Field(
        default=None, description="True if awaiting actual media"
    )


# =============================================================================
# Discriminated Union
# =============================================================================

ProtoComponent = Annotated[
    Union[
        TextComponent,
        HeadingComponent,
        QuizComponent,
        CodeComponent,
        CalloutComponent,
        StatementComponent,
        QuoteComponent,
        ListComponent,
        ImageComponent,
        DividerComponent,
        TaskListComponent,
        MultimediaComponent,
    ],
    Field(discriminator="type"),
]

# Map from our type string to the proto LessonComponentType enum int values
COMPONENT_TYPE_MAP: dict[str, int] = {
    "text": 1,
    "heading": 2,
    "image": 3,
    "quiz": 4,
    "code": 5,
    "callout": 6,
    "statement": 7,
    "quote": 8,
    "list": 9,
    "multimedia": 11,
    "divider": 13,
    "task_list": 14,
}


# =============================================================================
# Agent Output Type
# =============================================================================


class LessonComponents(BaseModel):
    """Output from the component generation agent. NativeOutput target."""

    components: list[ProtoComponent] = Field(
        min_length=3,
        description="Ordered list of lesson components in proto-compliant format",
    )
    outcomes_covered: list[str] = Field(
        description="Outcome keys (verb object) introduced or practiced in this lesson"
    )
