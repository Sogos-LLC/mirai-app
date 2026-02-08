"""Research orchestrator: coordinates source providers within a Temporal workflow.

The orchestrator is a workflow-level helper — it calls Temporal activities
(not direct async code) to perform research. Providers are thin wrappers
that translate workflow inputs into activity calls.

Usage in workflow:
    orchestrator = ResearchOrchestrator.from_input(workflow_ref, input)
    result = await orchestrator.research("query about topic", api_key)
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
from typing import TYPE_CHECKING

import structlog
from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

if TYPE_CHECKING:
    from src.workflows.types import CourseCreationInput

with workflow.unsafe.imports_passed_through():
    from src.activities.course_design import WebSourceData
    from src.activities.knowledge import (
        CheckKnowledgeHealthInput,
        CheckKnowledgeHealthOutput,
        SearchKnowledgeInput,
        SearchKnowledgeOutput,
        SynthesizeKnowledgeInput,
        SynthesizeKnowledgeOutput,
    )
    from src.models.attribution import (
        SourceReference,
        WebSource,
        format_source_context,
    )
    from src.models.knowledge import KnowledgeChunk
    from src.research.types import ResearchResult

log = structlog.get_logger()

AI_TASKS = "ai-tasks"
AI_SHORT_TIMEOUT = timedelta(minutes=3)
AI_HEARTBEAT = timedelta(minutes=3)
AI_RETRY = {"maximum_attempts": 2}


class ResearchOrchestrator:
    """Coordinates research activities within a Temporal workflow.

    Call from_input() to configure providers based on workflow input,
    then research() to run all active providers and merge results.
    """

    def __init__(
        self,
        *,
        source_ids: list[str] | None = None,
        enable_internal: bool = False,
        enable_web: bool = False,
        strict: bool = False,
        tenant_id: str = "",
        topic: str = "",
        audience: str = "",
    ) -> None:
        self._source_ids = source_ids or []
        self._enable_internal = enable_internal and bool(self._source_ids)
        self._enable_web = enable_web
        self._strict = strict
        self._tenant_id = tenant_id
        self._topic = topic
        self._audience = audience

    @staticmethod
    def from_input(input: CourseCreationInput) -> ResearchOrchestrator:
        """Factory: create orchestrator from workflow input settings."""
        all_ids = list(set(
            (input.selected_team_doc_ids or [])
            + (input.selected_global_doc_ids or [])
        ))
        return ResearchOrchestrator(
            source_ids=all_ids,
            enable_internal=input.enable_internal_knowledge,
            enable_web=input.enable_web_research,
            strict=input.strict_knowledge_only,
            tenant_id=input.tenant_id,
            topic=input.topic,
            audience=input.audience,
        )

    async def check_health(self, api_key: str) -> None:
        """Run health check if internal knowledge is enabled.

        Raises ApplicationError in strict mode if no vectors are found.
        """
        if not self._enable_internal:
            return

        health: CheckKnowledgeHealthOutput = await workflow.execute_activity(
            "check_knowledge_health",
            CheckKnowledgeHealthInput(
                source_ids=self._source_ids,
                tenant_id=self._tenant_id,
                api_key=api_key,
            ),
            task_queue=AI_TASKS,
            start_to_close_timeout=AI_SHORT_TIMEOUT,
            retry_policy=RetryPolicy(**AI_RETRY),
            result_type=CheckKnowledgeHealthOutput,
        )

        if not health.has_vectors:
            log.error(
                "knowledge_health_check_failed",
                source_ids=self._source_ids,
                reason=health.reason,
                source_details=health.source_details,
            )
            if self._strict:
                raise ApplicationError(
                    f"Strict knowledge mode is ON but no vectors found for selected sources. "
                    f"Reason: {health.reason}. Please re-upload or re-ingest your documents."
                )
        else:
            log.info(
                "knowledge_health_check_passed",
                source_ids=self._source_ids,
                total_points=health.total_points,
            )

    async def research(self, query: str, api_key: str) -> ResearchResult:
        """Run all active providers and merge results.

        Internal knowledge: search → synthesize → ResearchResult
        Web research: Gemini grounded search → ResearchResult
        Both: run in parallel, merge results
        """
        tasks = []

        if self._enable_internal:
            tasks.append(self._research_internal(query, api_key))

        if self._enable_web:
            tasks.append(self._research_web(query, api_key))

        if not tasks:
            return ResearchResult.empty()

        results: list[ResearchResult] = await asyncio.gather(*tasks)

        # Filter out empty results
        non_empty = [r for r in results if r.source_references]
        if not non_empty:
            if self._strict and self._enable_internal:
                raise ApplicationError(
                    "Strict knowledge mode is ON but research produced no source references. "
                    "The selected documents may not contain relevant content for this query."
                )
            return ResearchResult.empty()

        return ResearchResult.merge(non_empty)

    async def _research_internal(self, query: str, api_key: str) -> ResearchResult:
        """Search internal knowledge + synthesize into research text."""
        log.info(
            "internal_research_starting",
            query=query[:100],
            source_ids=self._source_ids,
        )

        # Step 1: Vector search
        search_result: SearchKnowledgeOutput = await workflow.execute_activity(
            "search_knowledge",
            SearchKnowledgeInput(
                query=query,
                api_key=api_key,
                source_ids=self._source_ids,
                tenant_id=self._tenant_id,
                top_k=10,
            ),
            task_queue=AI_TASKS,
            start_to_close_timeout=AI_SHORT_TIMEOUT,
            retry_policy=RetryPolicy(**AI_RETRY),
            result_type=SearchKnowledgeOutput,
        )

        chunks = search_result.chunks
        log.info(
            "internal_research_search_complete",
            query=query[:100],
            chunks_found=len(chunks),
        )

        if not chunks:
            if self._strict:
                raise ApplicationError(
                    f"Strict knowledge mode is ON but RAG search returned 0 chunks for query: "
                    f"'{query[:100]}'. Source IDs: {self._source_ids}. "
                    "Ensure documents are properly ingested."
                )
            return ResearchResult.empty()

        # Step 2: Synthesize chunks into coherent research text
        synthesis: SynthesizeKnowledgeOutput = await workflow.execute_activity(
            "synthesize_knowledge",
            SynthesizeKnowledgeInput(
                api_key=api_key,
                chunks=chunks,
                topic=self._topic,
                audience=self._audience,
            ),
            task_queue=AI_TASKS,
            start_to_close_timeout=AI_SHORT_TIMEOUT,
            heartbeat_timeout=AI_HEARTBEAT,
            retry_policy=RetryPolicy(**AI_RETRY),
            result_type=SynthesizeKnowledgeOutput,
        )

        log.info(
            "internal_research_synthesis_complete",
            research_length=len(synthesis.research_text),
            key_findings=len(synthesis.key_findings),
            gaps=len(synthesis.gaps),
        )

        # Build formatted context + source references
        formatted_context, source_refs = format_source_context(chunks, [])

        return ResearchResult(
            research_text=synthesis.research_text,
            source_references=source_refs,
            formatted_context=formatted_context,
            provider_type="internal",
            chunks=chunks,
        )

    async def _research_web(self, query: str, api_key: str) -> ResearchResult:
        """Run web research via Gemini grounded search activity."""
        log.info("web_research_starting", query=query[:100])

        from src.activities.course_design import RunWebResearchInput, RunWebResearchOutput

        result: RunWebResearchOutput = await workflow.execute_activity(
            "run_web_research",
            RunWebResearchInput(
                api_key=api_key,
                topic=self._topic,
                audience=self._audience,
                query=query,
            ),
            task_queue=AI_TASKS,
            start_to_close_timeout=AI_SHORT_TIMEOUT,
            heartbeat_timeout=AI_HEARTBEAT,
            retry_policy=RetryPolicy(**AI_RETRY),
            result_type=RunWebResearchOutput,
        )

        web_sources = [
            WebSource(
                title=ws.title,
                url=ws.url,
                snippet=ws.snippet,
                confidence=ws.confidence,
            )
            for ws in result.web_sources
        ]

        if not web_sources and not result.research_text:
            log.warning("web_research_empty", query=query[:100])
            return ResearchResult.empty()

        formatted_context, source_refs = format_source_context([], web_sources)

        log.info(
            "web_research_complete",
            research_length=len(result.research_text),
            source_count=len(web_sources),
        )

        return ResearchResult(
            research_text=result.research_text,
            source_references=source_refs,
            formatted_context=formatted_context,
            provider_type="web",
            web_sources=web_sources,
        )
