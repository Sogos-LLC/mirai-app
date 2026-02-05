"""Document chunking - port from Go's unified_knowledge_service.go."""

from src.config import settings


def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[str]:
    """Split text into overlapping chunks.

    Matches Go implementation: 500 char chunks, 50 char overlap.
    Splits on sentence boundaries when possible.
    """
    chunk_size = chunk_size or settings.default_chunk_size
    chunk_overlap = chunk_overlap or settings.default_chunk_overlap

    if not text or not text.strip():
        return []

    text = text.strip()

    if len(text) <= chunk_size:
        return [text]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        # Try to break at sentence boundary
        if end < len(text):
            # Look backwards for sentence endings
            for sep in [". ", ".\n", "! ", "!\n", "? ", "?\n", "\n\n"]:
                last_sep = text[start:end].rfind(sep)
                if last_sep > chunk_size // 2:
                    end = start + last_sep + len(sep)
                    break

        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)

        # Move start with overlap
        start = end - chunk_overlap
        if start >= len(text):
            break
        # Prevent infinite loop
        if start <= (end - chunk_size):
            start = end

    return chunks
