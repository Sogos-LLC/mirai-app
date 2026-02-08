"""Qdrant vector database client wrapper."""

from typing import Any

import structlog
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchValue,
    PointStruct,
    SearchParams,
    VectorParams,
)

from src.config import settings
from src.models.knowledge import KnowledgeChunk

log = structlog.get_logger()


class QdrantAdapter:
    """Wrapper around Qdrant client with tenant-scoped operations."""

    def __init__(self, url: str | None = None, collection: str | None = None) -> None:
        self.url = url or settings.qdrant_url
        self.collection = collection or settings.qdrant_collection
        self._client: AsyncQdrantClient | None = None

    async def _get_client(self) -> AsyncQdrantClient:
        if self._client is None:
            self._client = AsyncQdrantClient(url=self.url)
        return self._client

    async def ensure_collection(self) -> None:
        """Create or recreate the collection if dimensions don't match."""
        client = await self._get_client()
        expected_dim = settings.embedding_dimensions

        collections = await client.get_collections()
        names = [c.name for c in collections.collections]

        if self.collection in names:
            info = await client.get_collection(self.collection)
            current_dim = info.config.params.vectors.size
            if current_dim != expected_dim:
                log.warn(
                    "collection dimension mismatch, recreating",
                    collection=self.collection,
                    current=current_dim,
                    expected=expected_dim,
                )
                await client.delete_collection(self.collection)
            else:
                return

        await client.create_collection(
            collection_name=self.collection,
            vectors_config=VectorParams(
                size=expected_dim,
                distance=Distance.COSINE,
            ),
        )
        log.info(
            "created qdrant collection",
            collection=self.collection,
            dimensions=expected_dim,
        )

    async def search(
        self,
        query_vector: list[float],
        top_k: int = 15,
        filters: dict[str, str] | None = None,
    ) -> list[KnowledgeChunk]:
        """Perform similarity search with optional metadata filters."""
        client = await self._get_client()

        must_conditions = []
        if filters:
            for key, value in filters.items():
                must_conditions.append(
                    FieldCondition(key=key, match=MatchValue(value=value))
                )

        search_filter = Filter(must=must_conditions) if must_conditions else None

        response = await client.query_points(
            collection_name=self.collection,
            query=query_vector,
            limit=top_k,
            query_filter=search_filter,
            search_params=SearchParams(hnsw_ef=128, exact=False),
        )

        return self._points_to_chunks(response.points)

    async def search_by_source_ids(
        self,
        query_vector: list[float],
        source_ids: list[str],
        tenant_id: str,
        top_k: int = 15,
    ) -> list[KnowledgeChunk]:
        """Search scoped to specific source IDs within a tenant.

        Uses Qdrant filter: must[tenant_id] + should[source_id=A OR source_id=B ...].
        Qdrant semantics: all must conditions AND at least one should condition.
        """
        client = await self._get_client()

        should_conditions = [
            FieldCondition(key="source_id", match=MatchValue(value=sid))
            for sid in source_ids
        ]

        search_filter = Filter(
            must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))],
            should=should_conditions,
        )

        response = await client.query_points(
            collection_name=self.collection,
            query=query_vector,
            limit=top_k,
            query_filter=search_filter,
            search_params=SearchParams(hnsw_ef=128, exact=False),
        )

        return self._points_to_chunks(response.points)

    @staticmethod
    def _points_to_chunks(points: list) -> list[KnowledgeChunk]:
        """Convert Qdrant scored points to KnowledgeChunk models."""
        chunks = []
        for point in points:
            payload = point.payload or {}
            chunks.append(
                KnowledgeChunk(
                    content=payload.get("content", ""),
                    source_name=payload.get("source_name", ""),
                    source_id=payload.get("source_id", ""),
                    chunk_index=payload.get("chunk_index", 0),
                    score=point.score,
                    section_heading=payload.get("section_heading", ""),
                )
            )
        return chunks

    async def upsert_batch(
        self, points: list[dict[str, Any]], batch_size: int = 100
    ) -> None:
        """Upsert points in batches."""
        client = await self._get_client()

        for i in range(0, len(points), batch_size):
            batch = points[i : i + batch_size]
            point_structs = [
                PointStruct(
                    id=p["id"],
                    vector=p["vector"],
                    payload=p["payload"],
                )
                for p in batch
            ]
            await client.upsert(
                collection_name=self.collection,
                points=point_structs,
            )

        log.info("upserted points", count=len(points), collection=self.collection)

    async def delete_by_source(self, source_id: str) -> None:
        """Delete all vectors for a given source_id."""
        client = await self._get_client()
        await client.delete(
            collection_name=self.collection,
            points_selector=Filter(
                must=[
                    FieldCondition(
                        key="source_id", match=MatchValue(value=source_id)
                    )
                ]
            ),
        )
        log.info("deleted vectors by source", source_id=source_id)

    async def scroll_by_source(
        self, source_id: str, limit: int = 1000
    ) -> list[dict[str, Any]]:
        """Scroll all points for a source_id (for document reassembly)."""
        client = await self._get_client()
        results = []
        offset = None

        while True:
            points, next_offset = await client.scroll(
                collection_name=self.collection,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(
                            key="source_id", match=MatchValue(value=source_id)
                        )
                    ]
                ),
                limit=min(limit, 100),
                offset=offset,
            )

            for point in points:
                payload = point.payload or {}
                results.append(
                    {
                        "content": payload.get("content", ""),
                        "chunk_index": payload.get("chunk_index", 0),
                        "source_name": payload.get("source_name", ""),
                    }
                )

            if next_offset is None or len(results) >= limit:
                break
            offset = next_offset

        results.sort(key=lambda x: x["chunk_index"])
        return results

    async def close(self) -> None:
        """Close the client connection."""
        if self._client:
            await self._client.close()
            self._client = None
