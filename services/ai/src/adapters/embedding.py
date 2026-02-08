"""Lightweight embedding adapter using Gemini REST API directly.

Uses httpx to call the Gemini embedding API instead of pydantic-ai's
Embedder, which pulls in the full Google GenAI SDK and causes excessive
memory usage (~6Gi OOM) during batch embedding operations.
"""

import httpx
import structlog

from src.config import settings

log = structlog.get_logger()

EMBEDDING_MODEL_NAME = "gemini-embedding-001"
GEMINI_EMBED_URL = (
    f"https://generativelanguage.googleapis.com/v1beta/models/{EMBEDDING_MODEL_NAME}:batchEmbedContents"
)


class EmbeddingClient:
    """Lightweight embedding client using Gemini REST API directly.

    Avoids pydantic-ai Embedder overhead for memory-constrained environments.
    """

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self.batch_size = settings.embedding_batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts (document mode).

        Caller is responsible for batching with heartbeats — this method
        embeds all provided texts in a single API call.
        """
        if not texts:
            return []

        requests = [
            {
                "model": f"models/{EMBEDDING_MODEL_NAME}",
                "content": {"parts": [{"text": t}]},
                "taskType": "RETRIEVAL_DOCUMENT",
            }
            for t in texts
        ]

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                GEMINI_EMBED_URL,
                params={"key": self._api_key},
                json={"requests": requests},
            )
            resp.raise_for_status()
            data = resp.json()

        return [e["values"] for e in data["embeddings"]]

    async def embed_single(self, text: str) -> list[float]:
        """Generate embedding for a single search query."""
        requests = [
            {
                "model": f"models/{EMBEDDING_MODEL_NAME}",
                "content": {"parts": [{"text": text}]},
                "taskType": "RETRIEVAL_QUERY",
            }
        ]

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                GEMINI_EMBED_URL,
                params={"key": self._api_key},
                json={"requests": requests},
            )
            resp.raise_for_status()
            data = resp.json()

        return data["embeddings"][0]["values"]
