# Mirai AI Service - Temporal activity worker for AI generation
# Multi-stage build for smaller image
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies in separate layer for caching
FROM base AS dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Final stage
FROM dependencies AS runtime

# Create non-root user
RUN useradd -m -u 1000 appuser
USER appuser

# Copy application code
COPY --chown=appuser:appuser src/ ./src/

# Expose health endpoint port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"

# Run the service (FastAPI health + Temporal worker)
CMD ["python", "-m", "src.main"]
