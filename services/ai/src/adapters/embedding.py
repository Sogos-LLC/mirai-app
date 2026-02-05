"""HTTP client for the embedding service."""

import structlog
import httpx

from src.config import settings

log = structlog.get_logger()


class EmbeddingClient:
    """Client for the sentence-transformers embedding service."""

    def __init__(self, base_url: str | None = None) -> None:
        self.base_url = (base_url or settings.embedding_url).rstrip("/")
        self.batch_size = settings.embedding_batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts.

        Handles batching automatically if texts exceed max batch size.
        """
        if not texts:
            return []

        all_embeddings: list[list[float]] = []

        async with httpx.AsyncClient(timeout=60.0) as client:
            for i in range(0, len(texts), self.batch_size):
                batch = texts[i : i + self.batch_size]
                response = await client.post(
                    f"{self.base_url}/embed",
                    json={"texts": batch},
                )
                response.raise_for_status()
                data = response.json()
                all_embeddings.extend(data["embeddings"])

        return all_embeddings

    async def embed_single(self, text: str) -> list[float]:
        """Generate embedding for a single text."""
        results = await self.embed([text])
        return results[0]
