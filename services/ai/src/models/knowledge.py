"""Knowledge and RAG models."""

from pydantic import BaseModel


class KnowledgeChunk(BaseModel):
    """A chunk of knowledge retrieved from vector search."""

    content: str
    source_name: str
    source_id: str
    chunk_index: int
    score: float = 0.0


class SearchResult(BaseModel):
    """Result from a knowledge search operation."""

    chunks: list[KnowledgeChunk]
    query: str
    total_found: int


class RAGContext(BaseModel):
    """RAG context passed to generation agents."""

    chunks: list[KnowledgeChunk]
    scope_description: str = ""
