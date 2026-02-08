"""Vector similarity search - port from Go's vectordb.QdrantClient."""

import structlog

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.config import settings
from src.models.knowledge import KnowledgeChunk

log = structlog.get_logger()


async def search_knowledge(
    query: str,
    embedding_client: EmbeddingClient,
    filters: dict[str, str] | None = None,
    top_k: int | None = None,
    qdrant: QdrantAdapter | None = None,
) -> list[KnowledgeChunk]:
    """Perform semantic search over knowledge base.

    Args:
        query: Natural language search query
        embedding_client: Embedding client (requires API key)
        filters: Metadata filters (e.g. course_id, team_id, session_id, source_id)
        top_k: Number of results to return
        qdrant: Optional Qdrant adapter (creates default if not provided)

    Returns:
        List of knowledge chunks sorted by relevance
    """
    top_k = top_k or settings.default_top_k
    qdrant = qdrant or QdrantAdapter()

    # Generate query embedding
    query_vector = await embedding_client.embed_single(query)

    # Search Qdrant
    chunks = await qdrant.search(
        query_vector=query_vector,
        top_k=top_k,
        filters=filters,
    )

    log.info(
        "knowledge search completed",
        query=query[:100],
        results=len(chunks),
        filters=filters,
    )

    return chunks


async def search_knowledge_by_source_ids(
    query: str,
    embedding_client: EmbeddingClient,
    source_ids: list[str],
    tenant_id: str,
    top_k: int | None = None,
    qdrant: QdrantAdapter | None = None,
) -> list[KnowledgeChunk]:
    """Search knowledge base scoped to specific source IDs.

    Args:
        query: Natural language search query
        embedding_client: Embedding client (requires API key)
        source_ids: List of source IDs to scope the search to
        tenant_id: Tenant ID for RLS scoping
        top_k: Number of results to return
        qdrant: Optional Qdrant adapter

    Returns:
        List of knowledge chunks sorted by relevance
    """
    top_k = top_k or settings.default_top_k
    qdrant = qdrant or QdrantAdapter()

    query_vector = await embedding_client.embed_single(query)

    chunks = await qdrant.search_by_source_ids(
        query_vector=query_vector,
        source_ids=source_ids,
        tenant_id=tenant_id,
        top_k=top_k,
    )

    log.info(
        "knowledge search by source_ids completed",
        query=query[:100],
        results=len(chunks),
        source_ids=source_ids,
        tenant_id=tenant_id,
    )

    return chunks
