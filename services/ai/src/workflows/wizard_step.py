"""WizardStepWorkflow — thin Temporal workflow that dispatches to wizard activities.

The Go handler starts this workflow on the `ai-tasks` queue and blocks until
completion via ``run.Get()``, turning an async Temporal activity into a
synchronous RPC from the frontend's perspective.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from src.activities.wizard import (
        GenerateAudiencePersonasInput,
        GenerateOutcomesInput,
        GenerateSMEPersonasInput,
        GenerateTitleInput,
        GenerateToneOptionsInput,
        generate_audience_personas_activity,
        generate_outcomes_activity,
        generate_sme_personas_activity,
        generate_title_activity,
        generate_tone_options_activity,
    )


@dataclass
class WizardStepInput:
    """Input for the WizardStepWorkflow dispatcher."""

    step_type: str  # activity name: generate_title, generate_outcomes, etc.
    api_key: str
    payload_json: str  # JSON-encoded step-specific params
    rag_filters: dict[str, str] = field(default_factory=dict)


# Maximum time for any single wizard activity (generous for LLM calls)
_ACTIVITY_TIMEOUT = timedelta(minutes=5)


@workflow.defn
class WizardStepWorkflow:
    """Dispatch to the appropriate wizard activity based on step_type."""

    @workflow.run
    async def run(self, input: WizardStepInput) -> dict:
        import json

        payload = json.loads(input.payload_json)
        rag_filters = input.rag_filters if input.rag_filters else None

        if input.step_type == "generate_title":
            result = await workflow.execute_activity(
                generate_title_activity,
                GenerateTitleInput(
                    api_key=input.api_key,
                    course_name=payload["course_name"],
                    feedback=payload.get("feedback", ""),
                    rag_filters=rag_filters,
                ),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
            )
            return result.model_dump()

        if input.step_type == "generate_outcomes":
            result = await workflow.execute_activity(
                generate_outcomes_activity,
                GenerateOutcomesInput(
                    api_key=input.api_key,
                    course_name=payload["course_name"],
                    feedback=payload.get("feedback", ""),
                    rag_filters=rag_filters,
                ),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
            )
            return result.model_dump()

        if input.step_type == "generate_sme_personas":
            result = await workflow.execute_activity(
                generate_sme_personas_activity,
                GenerateSMEPersonasInput(
                    api_key=input.api_key,
                    title=payload["title"],
                    description=payload["description"],
                    rag_filters=rag_filters,
                ),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
            )
            return result.model_dump()

        if input.step_type == "generate_audience_personas":
            # Pass raw dicts — Pydantic coerces them to SMEPersona.
            # Constructing SMEPersona inside the workflow sandbox creates
            # sandboxed instances that fail Pydantic type checks against the
            # unsandboxed GenerateAudiencePersonasInput field type.
            result = await workflow.execute_activity(
                generate_audience_personas_activity,
                GenerateAudiencePersonasInput(
                    api_key=input.api_key,
                    title=payload["title"],
                    description=payload["description"],
                    sme_personas=payload.get("sme_personas", []),
                    rag_filters=rag_filters,
                ),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
            )
            return result.model_dump()

        if input.step_type == "generate_tone_options":
            # Pass raw dicts — same sandbox issue as audience step above.
            result = await workflow.execute_activity(
                generate_tone_options_activity,
                GenerateToneOptionsInput(
                    api_key=input.api_key,
                    title=payload["title"],
                    description=payload["description"],
                    audience_personas=payload.get("audience_personas", []),
                    rag_filters=rag_filters,
                ),
                start_to_close_timeout=_ACTIVITY_TIMEOUT,
            )
            return result.model_dump()

        raise ValueError(f"Unknown wizard step type: {input.step_type}")
