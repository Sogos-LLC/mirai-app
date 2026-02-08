"""Temporal activities for knowledge management (search, delete, health, synthesis).

Note: Document ingestion has been moved to the Go backend for better performance.
"""

from dataclasses import dataclass

from pydantic import BaseModel

import structlog
from temporalio import activity

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.registry import AgentRegistry
from src.models.knowledge import KnowledgeChunk
from src.models.research import KnowledgeResearchResult
from src.rag.search import search_knowledge as _search, search_knowledge_by_source_ids as _search_by_source_ids

log = structlog.get_logger()


class SearchKnowledgeInput(BaseModel):
    """Input for knowledge search activity."""

    query: str
    api_key: str
    filters: dict[str, str] = {}
    top_k: int = 15
    source_ids: list[str] = []
    tenant_id: str = ""


class SearchKnowledgeOutput(BaseModel):
    """Output from knowledge search activity."""

    chunks: list[KnowledgeChunk]


@activity.defn
async def search_knowledge(input: SearchKnowledgeInput) -> SearchKnowledgeOutput:
    """Search the knowledge base for relevant content.

    Uses source_id-scoped search when source_ids and tenant_id are provided.
    Falls back to generic filter-based search otherwise.
    """
    embedding_client = EmbeddingClient(input.api_key)

    if input.source_ids and input.tenant_id:
        chunks = await _search_by_source_ids(
            query=input.query,
            embedding_client=embedding_client,
            source_ids=input.source_ids,
            tenant_id=input.tenant_id,
            top_k=input.top_k,
        )
    else:
        chunks = await _search(
            query=input.query,
            embedding_client=embedding_client,
            filters=input.filters if input.filters else None,
            top_k=input.top_k,
        )

    return SearchKnowledgeOutput(chunks=chunks)


@dataclass
class DeleteKnowledgeInput:
    """Input for knowledge deletion activity."""

    source_id: str


@activity.defn
async def delete_knowledge(input: DeleteKnowledgeInput) -> None:
    """Delete all vectors for a knowledge source."""
    qdrant = QdrantAdapter()
    await qdrant.delete_by_source(input.source_id)
    log.info("deleted knowledge source vectors", source_id=input.source_id)


# =============================================================================
# Health Check
# =============================================================================


class CheckKnowledgeHealthInput(BaseModel):
    """Input for knowledge health check activity."""

    source_ids: list[str]
    tenant_id: str
    api_key: str


class CheckKnowledgeHealthOutput(BaseModel):
    """Output from knowledge health check activity."""

    has_vectors: bool
    total_points: int = 0
    reason: str = ""
    source_details: dict[str, int] = {}  # source_id -> point count


@activity.defn
async def check_knowledge_health(input: CheckKnowledgeHealthInput) -> CheckKnowledgeHealthOutput:
    """Verify Qdrant connectivity and that vectors exist for the given source IDs."""
    qdrant = QdrantAdapter()

    try:
        await qdrant._get_client()
    except Exception as e:
        log.error("qdrant_connection_failed", error=str(e))
        return CheckKnowledgeHealthOutput(
            has_vectors=False,
            reason=f"Cannot connect to Qdrant: {e}",
        )

    total_points = 0
    source_details: dict[str, int] = {}

    for source_id in input.source_ids:
        try:
            points = await qdrant.scroll_by_source(source_id, limit=1)
            count = len(points)
            source_details[source_id] = count
            total_points += count
        except Exception as e:
            log.warning("health_check_scroll_failed", source_id=source_id, error=str(e))
            source_details[source_id] = 0

    if total_points == 0:
        empty_ids = [sid for sid, c in source_details.items() if c == 0]
        return CheckKnowledgeHealthOutput(
            has_vectors=False,
            total_points=0,
            source_details=source_details,
            reason=f"No vectors found for source IDs: {empty_ids}",
        )

    return CheckKnowledgeHealthOutput(
        has_vectors=True,
        total_points=total_points,
        source_details=source_details,
    )


# =============================================================================
# Knowledge Synthesis
# =============================================================================


class SynthesizeKnowledgeInput(BaseModel):
    """Input for knowledge synthesis activity."""

    api_key: str
    chunks: list[KnowledgeChunk]
    topic: str
    audience: str = ""


class SynthesizeKnowledgeOutput(BaseModel):
    """Output from knowledge synthesis activity."""

    research_text: str
    key_findings: list[str] = []
    gaps: list[str] = []


@activity.defn
async def synthesize_knowledge(input: SynthesizeKnowledgeInput) -> SynthesizeKnowledgeOutput:
    """Synthesize RAG chunks into coherent research text using the knowledge-researcher agent."""
    if not input.chunks:
        return SynthesizeKnowledgeOutput(research_text="", key_findings=[], gaps=[])

    activity.heartbeat("synthesizing knowledge")

    # Format chunks as numbered source references for the agent
    source_lines: list[str] = []
    for i, chunk in enumerate(input.chunks, 1):
        section_ctx = chunk.source_name
        if chunk.section_heading:
            section_ctx = f"{chunk.source_name} > {chunk.section_heading}"
        source_lines.append(
            f"[Source {i}] (Document: {section_ctx}, relevance: {chunk.score:.2f})\n"
            f"{chunk.content}"
        )

    prompt = (
        f"## Topic\n{input.topic}\n\n"
        f"## Target Audience\n{input.audience}\n\n"
        f"## Document Excerpts\n\n"
        + "\n\n---\n\n".join(source_lines)
        + "\n\n## Task\n"
        "Synthesize these document excerpts into a coherent research summary "
        "that an instructional designer can use to build course content on this topic "
        "for the specified audience. Reference source numbers [Source N] naturally."
    )

    model = make_model(input.api_key)

    try:
        result = await AgentRegistry.get("knowledge-researcher").run(prompt, model=model)
        output: KnowledgeResearchResult = result.output
        activity.heartbeat("synthesis complete")

        return SynthesizeKnowledgeOutput(
            research_text=output.research_text,
            key_findings=output.key_findings,
            gaps=output.gaps,
        )
    except Exception:
        log.error("knowledge_synthesis_failed", exc_info=True)
        # Fallback: return raw chunk text so we don't lose the context entirely
        fallback = "\n\n".join(source_lines)
        return SynthesizeKnowledgeOutput(
            research_text=fallback,
            key_findings=[],
            gaps=["Synthesis agent failed; raw chunks returned as fallback."],
        )
