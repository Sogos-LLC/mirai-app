"""Markdown document parser - extracts heading hierarchy and section content."""

from __future__ import annotations

import re

from src.rag.parsers import ParsedSection

# Match ATX-style headings: # H1, ## H2, ### H3, etc.
_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE)


class MarkdownParser:
    """Parse markdown documents into sections with heading breadcrumbs."""

    def parse(self, text: str) -> list[ParsedSection]:
        sections: list[ParsedSection] = []
        heading_stack: list[tuple[int, str]] = []  # (level, title)

        # Find all headings with their positions
        matches = list(_HEADING_RE.finditer(text))

        if not matches:
            # No headings - treat entire document as one section
            content = text.strip()
            if content:
                sections.append(ParsedSection(
                    heading="Document",
                    content=content,
                    level=0,
                ))
            return sections

        # Handle text before first heading
        first_pos = matches[0].start()
        preamble = text[:first_pos].strip()
        if preamble:
            sections.append(ParsedSection(
                heading="Introduction",
                content=preamble,
                level=0,
            ))

        # Process each heading and its content
        for i, match in enumerate(matches):
            level = len(match.group(1))  # Number of # characters
            title = match.group(2).strip()

            # Update heading stack - pop everything at same or deeper level
            while heading_stack and heading_stack[-1][0] >= level:
                heading_stack.pop()
            heading_stack.append((level, title))

            # Build breadcrumb from stack
            breadcrumb = " > ".join(h[1] for h in heading_stack)

            # Extract content between this heading and the next
            content_start = match.end()
            content_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            content = text[content_start:content_end].strip()

            if content:
                sections.append(ParsedSection(
                    heading=breadcrumb,
                    content=content,
                    level=level,
                ))

        return sections
