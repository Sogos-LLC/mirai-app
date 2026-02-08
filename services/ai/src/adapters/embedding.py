"""Embedding adapter using pydantic-ai Embedder with Gemini embeddings.

Replaces the sentence-transformers HTTP client with pydantic-ai's native
Embedder using gemini-embedding-001 (3072 dims). Same Gemini API key
as the generation models — no extra service needed.
"""

import structlog
from pydantic_ai import Embedder
from pydantic_ai.embeddings.google import GoogleEmbeddingModel
from pydantic_ai.providers.google import GoogleProvider

from src.config import settings

log = structlog.get_logger()

EMBEDDING_MODEL_NAME = "gemini-embedding-001"


class EmbeddingClient:
    """Embedding client using pydantic-ai Embedder with per-tenant Gemini API key.

    Drop-in replacement for the old sentence-transformers HTTP client.
    Methods `embed()` and `embed_single()` have the same signatures.
    """

    def __init__(self, api_key: str) -> None:
        model = GoogleEmbeddingModel(
            EMBEDDING_MODEL_NAME,
            provider=GoogleProvider(api_key=api_key),
        )
        self._embedder = Embedder(model)
        self.batch_size = settings.embedding_batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts (document mode).

        Uses RETRIEVAL_DOCUMENT task type for optimal indexing quality.
        Caller is responsible for batching with heartbeats — this method
        embeds all provided texts in a single API call.
        """
        if not texts:
            return []

        result = await self._embedder.embed_documents(texts)
        return result.embeddings

    async def embed_single(self, text: str) -> list[float]:
        """Generate embedding for a single search query.

        Uses RETRIEVAL_QUERY task type for optimal search quality.
        """
        result = await self._embedder.embed_query(text)
        return result.embeddings[0]
