"""Configuration for the AI service using pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """AI service configuration loaded from environment variables."""

    # Temporal
    temporal_address: str = "localhost:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "ai-tasks"

    # External services
    qdrant_url: str = "http://localhost:6333"

    # Observability
    logfire_token: str | None = None
    log_level: str = "info"

    # Health server
    host: str = "0.0.0.0"
    port: int = 8080

    # Qdrant collection
    qdrant_collection: str = "knowledge_chunks"

    # Embedding (gemini-embedding-001 via pydantic-ai Embedder)
    embedding_dimensions: int = 3072
    embedding_batch_size: int = 64

    # RAG defaults
    default_chunk_size: int = 500
    default_chunk_overlap: int = 50
    default_top_k: int = 15

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
