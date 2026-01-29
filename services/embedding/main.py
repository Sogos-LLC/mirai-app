"""
Embedding Service for RAG
FastAPI service using sentence-transformers for text embeddings.
Model: all-MiniLM-L6-v2 (384 dimensions, fast inference)
"""

import os
import logging
from typing import List
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
MODEL_NAME = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "64"))
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))

# Global model reference
model = None


class EmbedRequest(BaseModel):
    """Request body for embedding endpoint."""
    texts: List[str] = Field(..., min_length=1, max_length=MAX_BATCH_SIZE)


class EmbedResponse(BaseModel):
    """Response body for embedding endpoint."""
    embeddings: List[List[float]]
    model: str
    dimensions: int


class HealthResponse(BaseModel):
    """Response body for health endpoint."""
    status: str
    model: str
    dimensions: int


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load the model on startup."""
    global model
    logger.info(f"Loading embedding model: {MODEL_NAME}")

    from sentence_transformers import SentenceTransformer
    model = SentenceTransformer(MODEL_NAME)

    # Warm up the model with a test embedding
    _ = model.encode(["warmup"])

    dims = model.get_sentence_embedding_dimension()
    logger.info(f"Model loaded successfully. Dimensions: {dims}")

    yield

    logger.info("Shutting down embedding service")


app = FastAPI(
    title="Mirai Embedding Service",
    description="Text embedding service for RAG using sentence-transformers",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check endpoint."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    return HealthResponse(
        status="ok",
        model=MODEL_NAME,
        dimensions=model.get_sentence_embedding_dimension(),
    )


@app.post("/embed", response_model=EmbedResponse)
async def embed(request: EmbedRequest):
    """Generate embeddings for a batch of texts."""
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if len(request.texts) > MAX_BATCH_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Batch size exceeds maximum of {MAX_BATCH_SIZE}",
        )

    # Filter empty strings
    texts = [t for t in request.texts if t.strip()]
    if not texts:
        raise HTTPException(status_code=400, detail="No valid texts provided")

    try:
        embeddings = model.encode(texts, convert_to_numpy=True)
        embeddings_list = embeddings.tolist()

        return EmbedResponse(
            embeddings=embeddings_list,
            model=MODEL_NAME,
            dimensions=model.get_sentence_embedding_dimension(),
        )
    except Exception as e:
        logger.error(f"Embedding error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT)
