"""Structure-aware document chunking.

Preserves heading/section context from document parsers while splitting
content into appropriately-sized chunks for embedding.
"""

from __future__ import annotations

from dataclasses import dataclass

from src.rag.parsers import get_parser


@dataclass
class StructuredChunk:
    """A chunk with section heading context from the original document."""

    content: str
    section_heading: str  # Breadcrumb from parser (e.g. "Getting Started > Installation")
    chunk_index: int


def chunk_document(
    text: str,
    mime_type: str = "text/plain",
    filename: str = "",
    max_chunk_size: int = 800,
    overlap: int = 50,
) -> list[StructuredChunk]:
    """Split a document into structured chunks with section headings.

    Uses document-type-aware parsing to preserve heading hierarchy,
    then splits large sections at sentence boundaries with overlap.

    Args:
        text: Full document text
        mime_type: MIME type for parser selection
        filename: Filename for parser selection fallback
        max_chunk_size: Maximum characters per chunk
        overlap: Character overlap between consecutive sub-chunks of the same section

    Returns:
        List of structured chunks with section context
    """
    if not text or not text.strip():
        return []

    parser = get_parser(mime_type, filename)
    sections = parser.parse(text)

    if not sections:
        return [StructuredChunk(content=text.strip(), section_heading="Document", chunk_index=0)]

    chunks: list[StructuredChunk] = []
    global_index = 0

    for section in sections:
        content = section.content.strip()
        if not content:
            continue

        if len(content) <= max_chunk_size:
            # Small section → single chunk
            chunks.append(StructuredChunk(
                content=content,
                section_heading=section.heading,
                chunk_index=global_index,
            ))
            global_index += 1
        else:
            # Large section → split at sentence boundaries with overlap
            sub_chunks = _split_at_sentences(content, max_chunk_size, overlap)
            for sub in sub_chunks:
                chunks.append(StructuredChunk(
                    content=sub,
                    section_heading=section.heading,
                    chunk_index=global_index,
                ))
                global_index += 1

    return chunks


def _split_at_sentences(
    text: str, max_size: int, overlap: int
) -> list[str]:
    """Split text at sentence boundaries with overlap."""
    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + max_size, len(text))

        # Try to break at a sentence boundary
        if end < len(text):
            for sep in [". ", ".\n", "! ", "!\n", "? ", "?\n", "\n\n"]:
                last_sep = text[start:end].rfind(sep)
                if last_sep > max_size // 2:
                    end = start + last_sep + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move forward with overlap
        start = end - overlap
        if start >= len(text):
            break
        # Prevent infinite loop
        if start <= (end - max_size):
            start = end

    return chunks
