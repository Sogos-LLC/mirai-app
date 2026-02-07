"""Resource hint models for multimedia URL detection in course creation.

ResourceHint represents a parsed media URL extracted from user-provided context.
ResourceParser is the protocol for URL extraction implementations.
"""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field


class ResourceHint(BaseModel):
    """A parsed media resource extracted from user text."""

    url: str = Field(description="Full URL of the media resource")
    media_type: Literal["video", "audio", "interactive", "reference"] = Field(
        description="Classification: video/audio/interactive embeds, or reference links"
    )
    provider: str | None = Field(
        default=None, description="Provider name: youtube, vimeo, soundcloud, etc."
    )


class ResourceParser(Protocol):
    """Protocol for extracting resource hints from text."""

    def parse(self, text: str) -> list[ResourceHint]: ...
