"""Embedding adapter using pydantic-ai Embedder with Gemini embeddings.

Replaces the sentence-transformers HTTP client with pydantic-ai's native
Embedder using gemini-embedding-001 (3072 dims). Same Gemini API key
as the generation models — no extra service needed.
"""

import structlog
from pydantic_ai import Embedder

from src.config import settings

log = structlog.get_logger()

EMBEDDING_MODEL = "google-gla:gemini-embedding-001"


class EmbeddingClient:
    """Embedding client using pydantic-ai Embedder with per-tenant Gemini API key.

    Drop-in replacement for the old sentence-transformers HTTP client.
    Methods `embed()` and `embed_single()` have the same signatures.
    """

    def __init__(self, api_key: str) -> None:
        self._embedder = Embedder(EMBEDDING_MODEL, api_key=api_key)
        self.batch_size = settings.embedding_batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts (document mode).

        Uses RETRIEVAL_DOCUMENT task type for optimal indexing quality.
        Handles batching automatically if texts exceed max batch size.
        """
        if not texts:
            return []

        all_embeddings: list[list[float]] = []

        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            result = await self._embedder.embed_documents(batch)
            all_embeddings.extend(result.embeddings)

        return all_embeddings

    async def embed_single(self, text: str) -> list[float]:
        """Generate embedding for a single search query.

        Uses RETRIEVAL_QUERY task type for optimal search quality.
        """
        result = await self._embedder.embed_query(text)
        return result.embeddings[0]
