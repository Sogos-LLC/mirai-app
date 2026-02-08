"""Document ingestion pipeline - chunk, embed, and store in Qdrant."""

import uuid
from collections.abc import Callable

import structlog

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.rag.structured_chunker import chunk_document

log = structlog.get_logger()


async def ingest_document(
    text: str,
    source_id: str,
    source_name: str,
    embedding_client: EmbeddingClient,
    metadata: dict[str, str] | None = None,
    qdrant: QdrantAdapter | None = None,
    mime_type: str = "text/plain",
    filename: str = "",
    heartbeat_fn: Callable[[str], None] | None = None,
) -> int:
    """Ingest a document into the knowledge base.

    Pipeline: text → structured chunk → embed → upsert to Qdrant.

    Args:
        text: Document text content
        source_id: Unique identifier for the source document
        source_name: Human-readable source name
        embedding_client: Embedding client (requires API key)
        metadata: Additional metadata (tenant_id, course_id, team_id, session_id)
        qdrant: Optional Qdrant adapter
        mime_type: MIME type for parser selection
        filename: Filename for parser selection fallback
        heartbeat_fn: Optional heartbeat callback for Temporal activity

    Returns:
        Number of chunks ingested
    """
    qdrant = qdrant or QdrantAdapter()
    metadata = metadata or {}

    # Step 1: Structure-aware chunking
    if heartbeat_fn:
        heartbeat_fn("chunking document")
    structured_chunks = chunk_document(text, mime_type=mime_type, filename=filename or source_name)
    if not structured_chunks:
        log.warn("no chunks produced from document", source_id=source_id)
        return 0

    log.info(
        "chunked document",
        source_id=source_id,
        source_name=source_name,
        chunk_count=len(structured_chunks),
    )

    # Step 2: Generate embeddings
    if heartbeat_fn:
        heartbeat_fn(f"embedding {len(structured_chunks)} chunks")
    chunk_texts = [c.content for c in structured_chunks]
    embeddings = await embedding_client.embed(chunk_texts)

    # Step 3: Build Qdrant points with section heading metadata
    points = []
    for i, (sc, embedding) in enumerate(zip(structured_chunks, embeddings)):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}:{i}"))
        payload = {
            "content": sc.content,
            "source_id": source_id,
            "source_name": source_name,
            "chunk_index": i,
            "section_heading": sc.section_heading,
            **metadata,
        }
        points.append(
            {
                "id": point_id,
                "vector": embedding,
                "payload": payload,
            }
        )

        # Heartbeat every 50 chunks during point building
        if heartbeat_fn and i > 0 and i % 50 == 0:
            heartbeat_fn(f"prepared {i}/{len(structured_chunks)} chunks")

    # Step 4: Upsert to Qdrant in batches
    if heartbeat_fn:
        heartbeat_fn("storing in vector database")
    await qdrant.ensure_collection()
    await qdrant.upsert_batch(points, batch_size=100)

    log.info(
        "document ingested",
        source_id=source_id,
        chunks=len(structured_chunks),
    )

    return len(structured_chunks)
