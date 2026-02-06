"""Mirai AI Service - FastAPI health endpoint + Temporal worker startup."""

import asyncio
import logging

import structlog
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from temporalio.client import Client
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.worker import Worker

from src.activities.course_design import (
    generate_course_analysis,
    generate_course_outcomes,
    generate_course_structure,
    generate_section_outcomes,
    generate_sample_lesson,
    extract_lesson_template,
    expand_lesson,
    run_course_qa,
)
from src.activities.knowledge import (
    ingest_document,
    search_knowledge,
    delete_knowledge,
)
from src.activities.visualization import get_graph_visualization
from src.workflows.course_creation import CourseCreationWorkflow
from src.config import settings

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.getLevelName(settings.log_level.upper())
    ),
)

log = structlog.get_logger()

# Configure Logfire if token is available
if settings.logfire_token:
    import logfire

    logfire.configure(
        token=settings.logfire_token,
        service_name="mirai-ai-service",
        service_version="0.1.0",
    )
    logfire.instrument_pydantic_ai()
    logfire.instrument_httpx()
    log.info("logfire configured")

# FastAPI health app
app = FastAPI(title="Mirai AI Service", version="0.1.0")

# Instrument FastAPI with Logfire (after app creation)
if settings.logfire_token:
    import logfire

    logfire.instrument_fastapi(app)

class HealthResponse(BaseModel):
    status: str
    worker_running: bool


worker_running = False


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", worker_running=worker_running)


async def run_worker() -> None:
    """Connect to Temporal and run the activity worker."""
    global worker_running

    log.info(
        "connecting to temporal",
        address=settings.temporal_address,
        namespace=settings.temporal_namespace,
        task_queue=settings.temporal_task_queue,
    )

    # Build Temporal client with optional OTel tracing interceptor
    interceptors = []
    if settings.logfire_token:
        from temporalio.contrib.opentelemetry import TracingInterceptor

        interceptors.append(TracingInterceptor())
        log.info("temporal tracing interceptor enabled")

    client = await Client.connect(
        settings.temporal_address,
        namespace=settings.temporal_namespace,
        interceptors=interceptors,
        data_converter=pydantic_data_converter,
    )

    worker = Worker(
        client,
        task_queue=settings.temporal_task_queue,
        workflows=[CourseCreationWorkflow],
        activities=[
            # Course design activities (5-step wizard)
            generate_course_analysis,
            generate_course_outcomes,
            generate_course_structure,
            generate_section_outcomes,
            generate_sample_lesson,
            extract_lesson_template,
            expand_lesson,
            run_course_qa,
            # Knowledge activities
            ingest_document,
            search_knowledge,
            delete_knowledge,
            # Visualization
            get_graph_visualization,
        ],
    )

    worker_running = True
    log.info("temporal worker started", task_queue=settings.temporal_task_queue)

    await worker.run()


async def main() -> None:
    """Run both FastAPI health server and Temporal worker concurrently."""
    config = uvicorn.Config(
        app,
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )
    server = uvicorn.Server(config)

    await asyncio.gather(
        server.serve(),
        run_worker(),
    )


if __name__ == "__main__":
    asyncio.run(main())
