"""Document parser adapter pattern for structure-aware chunking.

Each parser extracts heading/section structure from a specific document type,
producing a list of ParsedSection objects that preserve document hierarchy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass
class ParsedSection:
    """A section of a document with heading context."""

    heading: str  # Breadcrumb like "Introduction > Background"
    content: str  # Section text content
    level: int  # Heading depth (1=h1, 2=h2, etc.)


class DocumentParser(Protocol):
    """Protocol for document type parsers."""

    def parse(self, text: str) -> list[ParsedSection]: ...


def get_parser(mime_type: str, filename: str) -> DocumentParser:
    """Get the appropriate parser for a document type.

    Falls back to plain text parser for unknown types.
    """
    from src.rag.parsers.markdown_parser import MarkdownParser
    from src.rag.parsers.text_parser import TextParser

    # Check mime type first
    if mime_type in ("text/markdown", "text/x-markdown"):
        return MarkdownParser()

    # Check file extension as fallback
    lower = filename.lower()
    if lower.endswith((".md", ".markdown")):
        return MarkdownParser()

    return TextParser()
