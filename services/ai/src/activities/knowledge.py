"""Temporal activities for knowledge management (ingest, search, delete)."""

from dataclasses import dataclass

from pydantic import BaseModel

import structlog
from temporalio import activity

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.document_analysis_agent import analyze_document
from src.models.knowledge import KnowledgeChunk
from src.rag.ingest import ingest_document as _ingest
from src.rag.search import search_knowledge as _search, search_knowledge_by_source_ids as _search_by_source_ids

log = structlog.get_logger()


@dataclass
class IngestDocumentInput:
    """Input for document ingestion activity."""

    text: str
    source_id: str
    source_name: str
    api_key: str
    metadata: dict[str, str]
    mime_type: str = "text/plain"
    filename: str = ""


@dataclass
class IngestDocumentOutput:
    """Output from document ingestion activity."""

    chunk_count: int
    summary: str = ""
    token_count: int = 0
    document_index: dict | None = None


@activity.defn
async def ingest_document(input: IngestDocumentInput) -> IngestDocumentOutput:
    """Ingest a document into the knowledge base (chunk → embed → store → analyze)."""
    activity.heartbeat("starting ingestion")

    embedding_client = EmbeddingClient(input.api_key)

    # Heartbeat callback for long-running embedding batches
    def heartbeat_fn(msg: str) -> None:
        activity.heartbeat(msg)

    chunk_count = await _ingest(
        text=input.text,
        source_id=input.source_id,
        source_name=input.source_name,
        embedding_client=embedding_client,
        metadata=input.metadata,
        mime_type=input.mime_type,
        filename=input.filename,
        heartbeat_fn=heartbeat_fn,
    )

    # Analyze document for summary and metadata
    activity.heartbeat("analyzing document")
    summary = ""
    document_index = None
    try:
        analysis = await analyze_document(input.text, input.api_key)
        summary = analysis.summary
        document_index = {
            "title": analysis.title,
            "main_topics": analysis.main_topics,
            "key_concepts": analysis.key_concepts,
            "estimated_lesson_count": analysis.estimated_lesson_count,
            "content_depth": analysis.content_depth,
        }
        log.info(
            "document analysis complete",
            source_id=input.source_id,
            title=analysis.title,
        )
    except Exception as e:
        log.warn(
            "document analysis failed, continuing without",
            source_id=input.source_id,
            error=str(e),
        )

    # Estimate token count (chars / 4 is a reasonable approximation)
    token_count = len(input.text) // 4

    return IngestDocumentOutput(
        chunk_count=chunk_count,
        summary=summary,
        token_count=token_count,
        document_index=document_index,
    )


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
