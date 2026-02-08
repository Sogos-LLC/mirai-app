"""Plain text document parser - splits on paragraph boundaries."""

from __future__ import annotations

import re

from src.rag.parsers import ParsedSection

# Split on two or more consecutive newlines (paragraph boundary)
_PARAGRAPH_RE = re.compile(r"\n\s*\n")


class TextParser:
    """Parse plain text into paragraph-based sections."""

    def parse(self, text: str) -> list[ParsedSection]:
        sections: list[ParsedSection] = []

        paragraphs = _PARAGRAPH_RE.split(text)

        for i, para in enumerate(paragraphs):
            content = para.strip()
            if not content:
                continue

            sections.append(ParsedSection(
                heading=f"Paragraph {i + 1}",
                content=content,
                level=0,
            ))

        return sections
