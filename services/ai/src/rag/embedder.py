"""Embedding pipeline - thin wrappers around EmbeddingClient."""

from src.adapters.embedding import EmbeddingClient


async def embed_texts(
    texts: list[str], client: EmbeddingClient
) -> list[list[float]]:
    """Generate embeddings for a list of texts."""
    return await client.embed(texts)


async def embed_query(
    query: str, client: EmbeddingClient
) -> list[float]:
    """Generate embedding for a search query."""
    return await client.embed_single(query)
