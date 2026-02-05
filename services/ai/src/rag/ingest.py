"""Document ingestion pipeline - chunk, embed, and store in Qdrant."""

import uuid

import structlog

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.rag.chunker import chunk_text

log = structlog.get_logger()


async def ingest_document(
    text: str,
    source_id: str,
    source_name: str,
    metadata: dict[str, str] | None = None,
    qdrant: QdrantAdapter | None = None,
    embedding_client: EmbeddingClient | None = None,
) -> int:
    """Ingest a document into the knowledge base.

    Pipeline: text → chunk → embed → upsert to Qdrant.

    Args:
        text: Document text content
        source_id: Unique identifier for the source document
        source_name: Human-readable source name
        metadata: Additional metadata (tenant_id, course_id, team_id, session_id)
        qdrant: Optional Qdrant adapter
        embedding_client: Optional embedding client

    Returns:
        Number of chunks ingested
    """
    qdrant = qdrant or QdrantAdapter()
    embedding_client = embedding_client or EmbeddingClient()
    metadata = metadata or {}

    # Step 1: Chunk the document
    chunks = chunk_text(text)
    if not chunks:
        log.warn("no chunks produced from document", source_id=source_id)
        return 0

    log.info(
        "chunked document",
        source_id=source_id,
        source_name=source_name,
        chunk_count=len(chunks),
    )

    # Step 2: Generate embeddings
    embeddings = await embedding_client.embed(chunks)

    # Step 3: Build Qdrant points
    points = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        point_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{source_id}:{i}"))
        payload = {
            "content": chunk,
            "source_id": source_id,
            "source_name": source_name,
            "chunk_index": i,
            **metadata,
        }
        points.append(
            {
                "id": point_id,
                "vector": embedding,
                "payload": payload,
            }
        )

    # Step 4: Upsert to Qdrant in batches
    await qdrant.ensure_collection()
    await qdrant.upsert_batch(points, batch_size=100)

    log.info(
        "document ingested",
        source_id=source_id,
        chunks=len(chunks),
    )

    return len(chunks)
