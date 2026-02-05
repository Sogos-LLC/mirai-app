"""Embedding pipeline - calls the embedding service for vector generation."""

from src.adapters.embedding import EmbeddingClient


async def embed_texts(
    texts: list[str], client: EmbeddingClient | None = None
) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    client = client or EmbeddingClient()
    return await client.embed(texts)


async def embed_query(
    query: str, client: EmbeddingClient | None = None
) -> list[float]:
    """Generate embedding for a search query."""
    client = client or EmbeddingClient()
    return await client.embed_single(query)
