"""Temporal activities for knowledge management (ingest, search, delete)."""

from dataclasses import dataclass

from pydantic import BaseModel, Field

import structlog
from temporalio import activity

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.models.knowledge import KnowledgeChunk
from src.rag.ingest import ingest_document as _ingest
from src.rag.search import search_knowledge as _search

log = structlog.get_logger()


@dataclass
class IngestDocumentInput:
    """Input for document ingestion activity."""

    text: str
    source_id: str
    source_name: str
    metadata: dict[str, str]


@dataclass
class IngestDocumentOutput:
    """Output from document ingestion activity."""

    chunk_count: int


@activity.defn
async def ingest_document(input: IngestDocumentInput) -> IngestDocumentOutput:
    """Ingest a document into the knowledge base (chunk → embed → store)."""
    activity.heartbeat(f"ingesting {input.source_name}")

    chunk_count = await _ingest(
        text=input.text,
        source_id=input.source_id,
        source_name=input.source_name,
        metadata=input.metadata,
    )

    return IngestDocumentOutput(chunk_count=chunk_count)


class SearchKnowledgeInput(BaseModel):
    """Input for knowledge search activity."""

    query: str
    filters: dict[str, str]
    top_k: int = 15


class SearchKnowledgeOutput(BaseModel):
    """Output from knowledge search activity."""

    chunks: list[KnowledgeChunk]


@activity.defn
async def search_knowledge(input: SearchKnowledgeInput) -> SearchKnowledgeOutput:
    """Search the knowledge base for relevant content."""
    chunks = await _search(
        query=input.query,
        filters=input.filters,
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
