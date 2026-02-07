"""Source attribution models for content provenance tracking.

Maps numbered [Source N] references from agent prompts back to full metadata
(RAG chunks, web sources, model knowledge) for the frontend Source Mode UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from pydantic import BaseModel, Field

from src.models.knowledge import KnowledgeChunk


class WebSource(BaseModel):
    """A web source extracted from Gemini grounding metadata."""

    title: str
    url: str
    snippet: str = ""


@dataclass
class SourceReference:
    """Maps a numbered source in the prompt to full metadata."""

    index: int  # 1-based, matching [Source N] in prompt
    source_type: str  # "internal" or "web"
    source_id: str  # Knowledge doc UUID (internal) or empty
    source_name: str  # Human-readable name
    chunk_index: int  # Chunk position within doc
    score: float  # Relevance score
    url: str = ""  # Web URL (web) or empty
    page_title: str = ""  # Web page title or empty
    team_id: str = ""  # Team UUID (internal) or empty
    team_name: str = ""  # Team name (internal) or empty
    excerpt: str = ""  # Original chunk text (first 200 chars)


def format_source_context(
    rag_chunks: list[KnowledgeChunk],
    web_sources: list[WebSource] | None = None,
) -> tuple[str, list[SourceReference]]:
    """Format sources as numbered [Source N] references for agent prompt.

    Returns (prompt_section_text, source_reference_list).
    """
    if not rag_chunks and not web_sources:
        return "", []

    refs: list[SourceReference] = []
    lines: list[str] = []
    index = 1

    # Internal knowledge sources
    for chunk in rag_chunks:
        refs.append(SourceReference(
            index=index,
            source_type="internal",
            source_id=chunk.source_id,
            source_name=chunk.source_name,
            chunk_index=chunk.chunk_index,
            score=chunk.score,
            excerpt=chunk.content[:200],
        ))
        lines.append(
            f"[Source {index}] (Internal: {chunk.source_name})\n"
            f"{chunk.content[:500]}"
        )
        index += 1

    # Web sources
    if web_sources:
        for ws in web_sources:
            refs.append(SourceReference(
                index=index,
                source_type="web",
                source_id="",
                source_name=ws.title,
                chunk_index=0,
                score=0.0,
                url=ws.url,
                page_title=ws.title,
                excerpt=ws.snippet[:200] if ws.snippet else "",
            ))
            lines.append(
                f"[Source {index}] (Web: {ws.title})\n"
                f"URL: {ws.url}\n"
                f"{ws.snippet[:500] if ws.snippet else ''}"
            )
            index += 1

    section = (
        "## Knowledge Sources\n"
        "Reference sources using [Source N] numbers in source_refs fields.\n"
        "Empty source_refs = content from your own knowledge.\n\n"
        + "\n\n".join(lines)
    )
    return section, refs


def _determine_source_type(
    source_indices: list[int],
    refs: list[SourceReference],
) -> str:
    """Determine the dominant source type from a set of source indices."""
    if not source_indices:
        return "model"

    type_counts: dict[str, int] = {}
    for idx in source_indices:
        # Source indices are 1-based
        if 1 <= idx <= len(refs):
            st = refs[idx - 1].source_type
            type_counts[st] = type_counts.get(st, 0) + 1

    if not type_counts:
        return "model"

    return max(type_counts, key=lambda k: type_counts[k])


def resolve_component_provenance(
    component: object,
    source_refs: list[SourceReference],
    model_name: str,
    generation_context: str,
) -> dict:
    """Convert source_ref indices on a component back to full provenance objects.

    Returns a provenance dict matching the Go ComponentProvenance JSON shape.
    """
    # Get source_refs from the component
    comp_source_refs: list[int] = []
    paragraphs_data: list[dict] | None = None

    comp_type = getattr(component, "type", "")

    if comp_type == "text" and hasattr(component, "paragraphs"):
        # Text component with paragraph-level attribution
        all_refs: set[int] = set()
        paragraphs_data = []
        for para in component.paragraphs:
            para_refs = para.source_refs if para.source_refs else []
            all_refs.update(para_refs)
            paragraphs_data.append({
                "html": para.html,
                "sourceIndices": [
                    _resolve_source_index(r, source_refs) for r in para_refs
                ],
            })
        comp_source_refs = list(all_refs)
    elif hasattr(component, "source_refs"):
        comp_source_refs = component.source_refs or []

    # Build provenance chunks
    source_chunks: list[dict] = []
    seen_indices: set[int] = set()
    for idx in comp_source_refs:
        if idx in seen_indices:
            continue
        seen_indices.add(idx)
        if 1 <= idx <= len(source_refs):
            ref = source_refs[idx - 1]
            chunk = {
                "chunkId": f"{ref.source_id}:{ref.chunk_index}" if ref.source_id else f"web:{idx}",
                "sourceId": ref.source_id,
                "sourceName": ref.source_name,
                "excerpt": ref.excerpt,
                "similarityScore": ref.score,
                "scope": "team" if ref.source_type == "internal" else "web",
                "sourceType": ref.source_type,
                "url": ref.url,
                "pageTitle": ref.page_title,
                "teamId": ref.team_id,
                "teamName": ref.team_name,
            }
            source_chunks.append(chunk)

    dominant = _determine_source_type(comp_source_refs, source_refs)

    provenance: dict = {
        "sourceChunks": source_chunks,
        "queries": [],
        "teamTokens": 0,
        "globalTokens": 0,
        "courseTokens": 0,
        "totalTokens": 0,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "dominantSourceType": dominant,
        "modelName": model_name,
        "generationContext": generation_context,
    }

    if paragraphs_data is not None:
        provenance["paragraphs"] = paragraphs_data

    return provenance


def _resolve_source_index(ref_idx: int, source_refs: list[SourceReference]) -> int:
    """Map a 1-based source ref index to a 0-based index into source_chunks.

    Since we build source_chunks in order matching source_refs, the mapping
    is simply ref_idx - 1 (adjusting for 1-based to 0-based).
    """
    return ref_idx - 1 if ref_idx >= 1 else 0


def resolve_lesson_provenance(
    component_provenances: list[dict],
) -> dict:
    """Aggregate component provenances into lesson-level provenance.

    Returns a dict matching Go LessonProvenance JSON shape.
    """
    total_sources: set[str] = set()
    internal_count = 0
    web_count = 0
    model_count = 0

    for prov in component_provenances:
        dominant = prov.get("dominantSourceType", "model")
        if dominant == "internal":
            internal_count += 1
        elif dominant == "web":
            web_count += 1
        else:
            model_count += 1
        for chunk in prov.get("sourceChunks", []):
            sid = chunk.get("sourceId", "")
            if sid:
                total_sources.add(sid)

    total = internal_count + web_count + model_count
    grounded = internal_count + web_count
    grounding_score = grounded / total if total > 0 else 0.0

    return {
        "groundingScore": grounding_score,
        "teamTokens": 0,
        "globalTokens": 0,
        "courseTokens": 0,
        "ungroundedTokens": model_count,
        "totalTokens": total,
        "sourceCount": len(total_sources),
    }
