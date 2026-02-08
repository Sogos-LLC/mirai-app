"""Types for the unified research module."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.models.attribution import SourceReference, WebSource, format_source_context
from src.models.knowledge import KnowledgeChunk


@dataclass
class ResearchContext:
    """Input context for a research query."""

    query: str
    topic: str
    audience: str
    api_key: str
    tenant_id: str


@dataclass
class ResearchResult:
    """Unified output from any source provider."""

    research_text: str
    source_references: list[SourceReference]
    formatted_context: str  # Ready-to-inject prompt section with [Source N] refs
    provider_type: str  # "internal", "web", or "combined"
    chunks: list[KnowledgeChunk] = field(default_factory=list)
    web_sources: list[WebSource] = field(default_factory=list)
    gaps: list[str] = field(default_factory=list)
    key_findings: list[str] = field(default_factory=list)

    @staticmethod
    def empty() -> ResearchResult:
        """Return an empty result (no sources found)."""
        return ResearchResult(
            research_text="",
            source_references=[],
            formatted_context="",
            provider_type="none",
        )

    @staticmethod
    def merge(results: list[ResearchResult]) -> ResearchResult:
        """Merge multiple provider results into a combined result.

        Re-indexes source references sequentially and rebuilds
        formatted_context via format_source_context().
        """
        if not results:
            return ResearchResult.empty()

        if len(results) == 1:
            return results[0]

        # Collect all raw data for re-indexing
        all_chunks: list[KnowledgeChunk] = []
        all_web: list[WebSource] = []
        all_gaps: list[str] = []
        all_findings: list[str] = []
        research_parts: list[str] = []

        for r in results:
            all_chunks.extend(r.chunks)
            all_web.extend(r.web_sources)
            all_gaps.extend(r.gaps)
            all_findings.extend(r.key_findings)
            if r.research_text:
                label = r.provider_type.title()
                research_parts.append(f"## {label} Research\n\n{r.research_text}")

        # Rebuild formatted context + refs with sequential indices
        formatted_context, source_refs = format_source_context(all_chunks, all_web)

        combined_research = "\n\n".join(research_parts)

        return ResearchResult(
            research_text=combined_research,
            source_references=source_refs,
            formatted_context=formatted_context,
            provider_type="combined",
            chunks=all_chunks,
            web_sources=all_web,
            gaps=all_gaps,
            key_findings=all_findings,
        )
