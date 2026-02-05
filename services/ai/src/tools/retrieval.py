"""RAG retrieval tool for pydantic-ai agents."""

from dataclasses import dataclass

from pydantic_ai import RunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.models.knowledge import KnowledgeChunk
from src.rag.search import search_knowledge as _search


@dataclass
class RAGDeps:
    """Dependencies for RAG retrieval tool."""

    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    filters: dict[str, str]
    top_k: int = 15


async def retrieve_knowledge(
    ctx: RunContext[RAGDeps], query: str
) -> list[KnowledgeChunk]:
    """Search the knowledge base for relevant content.

    Use this tool when you need additional context from uploaded documents
    to generate more accurate and grounded content.

    Args:
        ctx: Run context with RAG dependencies
        query: Natural language search query describing what you need
    """
    return await _search(
        query=query,
        filters=ctx.deps.filters,
        top_k=ctx.deps.top_k,
        qdrant=ctx.deps.qdrant,
        embedding_client=ctx.deps.embedding_client,
    )
