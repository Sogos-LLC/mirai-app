"""Shared utilities for wizard step graphs.

Contains RAG search helpers, validation functions, and constants
used by all 5 wizard graphs (title, outcomes, sme, audience, tone).
"""

import structlog

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.models.knowledge import KnowledgeChunk
from src.rag.search import search_knowledge

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

MAX_WIZARD_RETRIES = 2

BLOOMS_VERBS: set[str] = {
    "analyze",
    "apply",
    "appraise",
    "arrange",
    "assess",
    "build",
    "categorize",
    "classify",
    "compare",
    "compose",
    "construct",
    "contrast",
    "create",
    "critique",
    "define",
    "demonstrate",
    "describe",
    "design",
    "develop",
    "differentiate",
    "discuss",
    "distinguish",
    "evaluate",
    "examine",
    "explain",
    "formulate",
    "identify",
    "illustrate",
    "implement",
    "interpret",
    "justify",
    "list",
    "organize",
    "outline",
    "plan",
    "predict",
    "produce",
    "propose",
    "recognize",
    "recommend",
    "relate",
    "select",
    "solve",
    "summarize",
    "synthesize",
    "understand",
    "use",
}

TITLE_CASE_MINOR_WORDS: set[str] = {
    "a", "an", "the", "and", "but", "or", "for", "nor",
    "of", "in", "to", "at", "by", "on", "up", "as", "is",
    "it", "so", "yet", "via", "per", "with",
}

GENERIC_TITLE_PREFIXES: list[str] = [
    "introduction to",
    "a course about",
    "learn about",
    "learning about",
    "course on",
    "a guide to",
    "guide to",
    "basics of",
    "the basics of",
]


# ---------------------------------------------------------------------------
# RAG search
# ---------------------------------------------------------------------------


async def search_wizard_knowledge(
    queries: list[str],
    qdrant: QdrantAdapter,
    embedding_client: EmbeddingClient,
    rag_filters: dict[str, str] | None,
    top_k: int = 10,
    max_queries: int = 3,
) -> tuple[list[KnowledgeChunk], int]:
    """Search knowledge base for wizard context.

    Returns:
        (deduplicated_chunks, total_count) — empty if no filters.
    """
    if not rag_filters:
        return [], 0

    all_chunks: list[KnowledgeChunk] = []
    seen_ids: set[str] = set()

    for query in queries[:max_queries]:
        chunks = await search_knowledge(
            query=query,
            filters=rag_filters,
            top_k=top_k,
            qdrant=qdrant,
            embedding_client=embedding_client,
        )
        for c in chunks:
            chunk_id = f"{c.source_id}:{c.chunk_index}"
            if chunk_id not in seen_ids:
                seen_ids.add(chunk_id)
                all_chunks.append(c)

    log.info("wizard_rag_search", chunks=len(all_chunks))
    return all_chunks, len(all_chunks)


# ---------------------------------------------------------------------------
# Validation helpers — each returns str | None (None = valid)
# ---------------------------------------------------------------------------


def check_word_count(
    text: str, min_words: int, max_words: int, label: str,
) -> str | None:
    """Check that text has between min and max words."""
    count = len(text.split())
    if count < min_words:
        return f"{label} has {count} words; minimum is {min_words}"
    if count > max_words:
        return f"{label} has {count} words; maximum is {max_words}"
    return None


def check_sentence_count(
    text: str, min_sentences: int, max_sentences: int, label: str,
) -> str | None:
    """Check sentence count (split on . ! ?)."""
    sentences = [s.strip() for s in text.replace("!", ".").replace("?", ".").split(".") if s.strip()]
    count = len(sentences)
    if count < min_sentences:
        return f"{label} has {count} sentence(s); minimum is {min_sentences}"
    if count > max_sentences:
        return f"{label} has {count} sentence(s); maximum is {max_sentences}"
    return None


def check_exact_count(items: list, count: int, label: str) -> str | None:
    """Check that list has exactly `count` items."""
    if len(items) != count:
        return f"{label}: expected {count} items, got {len(items)}"
    return None


def check_unique_values(items: list, label: str) -> str | None:
    """Check that all items are unique (case-insensitive for strings)."""
    normalized = [str(v).lower().strip() for v in items]
    if len(set(normalized)) != len(normalized):
        seen: set[str] = set()
        dupes: list[str] = []
        for v in normalized:
            if v in seen:
                dupes.append(v)
            seen.add(v)
        return f"{label}: duplicate values found: {', '.join(dupes)}"
    return None


def check_in_set(value: str, allowed: set[str], label: str) -> str | None:
    """Check that value is in the allowed set."""
    if value.lower().strip() not in allowed:
        return f"{label}: '{value}' is not one of {sorted(allowed)}"
    return None


def check_min_count(items: list, min_count: int, label: str) -> str | None:
    """Check that list has at least `min_count` items."""
    if len(items) < min_count:
        return f"{label}: expected at least {min_count} items, got {len(items)}"
    return None


# ---------------------------------------------------------------------------
# Refinement helper
# ---------------------------------------------------------------------------


def build_refinement_feedback(violations: list[str]) -> str:
    """Build constraint feedback for a retry prompt."""
    lines = [
        "## CONSTRAINT VIOLATIONS FROM PREVIOUS ATTEMPT",
        "The previous output had the following issues that MUST be fixed:\n",
    ]
    for v in violations:
        lines.append(f"- {v}")
    lines.append(
        "\nPlease regenerate fixing ALL of the above issues."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# RAG section builder for prompts
# ---------------------------------------------------------------------------


def build_rag_section(rag_chunks: list[KnowledgeChunk] | None) -> str:
    """Build a standardized RAG context section for agent prompts."""
    if not rag_chunks:
        return ""
    parts = ["\n## Reference Materials", "Use it to inform your generation:\n"]
    for i, chunk in enumerate(rag_chunks):
        parts.append(f"### Source {i + 1}: {chunk.source_name}")
        parts.append(chunk.content)
        parts.append("")
    return "\n".join(parts) + "---\n"
