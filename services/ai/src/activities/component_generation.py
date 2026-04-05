"""Temporal activities for component generation and section QA.

These activities run the component generation agent (NativeOutput) and
the section QA judge for the new expansion pipeline.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import structlog
from temporalio import activity

from src.agents.component_generation_agent import (
    ComponentContext,
    build_component_prompt,
)
from src.agents.model import make_model
from src.agents.registry import AgentRegistry
from src.agents.section_qa_agent import (
    SectionQAResult,
    build_section_qa_prompt,
)
from src.models.component_content import LessonComponents
from src.models.outcome_tracker import OutcomeCoverage
from src.workflows.types import ActivityUsage

log = structlog.get_logger()


# =============================================================================
# Activity Input/Output Types
# =============================================================================


@dataclass
class GenerateComponentsInput:
    """Input for the generate_lesson_components activity."""

    api_key: str
    context: ComponentContext


@dataclass
class GenerateComponentsOutput:
    """Output from the generate_lesson_components activity."""

    lesson_title: str
    section_title: str
    components: LessonComponents
    outcomes_covered: list[str]
    usage: ActivityUsage | None = None


@dataclass
class ReviewSectionInput:
    """Input for the review_section_components activity."""

    api_key: str
    section_title: str
    section_description: str
    section_outcomes: list[str]
    lesson_components: dict[str, LessonComponents]
    course_goal: str
    prior_content_digest: list[str] = field(default_factory=list)


@dataclass
class ReviewSectionOutput:
    """Output from the review_section_components activity."""

    qa: SectionQAResult


# =============================================================================
# Activities
# =============================================================================


@activity.defn
async def generate_lesson_components(
    input: GenerateComponentsInput,
) -> GenerateComponentsOutput:
    """Generate proto-compliant components for a single lesson."""
    log.info(
        "generate_lesson_components",
        lesson=input.context.lesson_title,
        section=input.context.section_title,
    )
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_component_prompt(input.context)

    result = await AgentRegistry.get("component-generator").run(prompt, model=model)
    activity.heartbeat()

    run_usage = result.usage()
    usage = ActivityUsage(
        activity_name="generate_lesson_components",
        input_tokens=run_usage.input_tokens or 0,
        output_tokens=run_usage.output_tokens or 0,
        cache_read_tokens=run_usage.cache_read_tokens or 0,
        cache_write_tokens=run_usage.cache_write_tokens or 0,
        requests=run_usage.requests or 0,
        total_tokens=(run_usage.input_tokens or 0) + (run_usage.output_tokens or 0),
    )

    return GenerateComponentsOutput(
        lesson_title=input.context.lesson_title,
        section_title=input.context.section_title,
        components=result.output,
        outcomes_covered=result.output.outcomes_covered,
        usage=usage,
    )


@activity.defn
async def review_section_components(
    input: ReviewSectionInput,
) -> ReviewSectionOutput:
    """QA judge for one section's components. Single pass, no retry loop."""
    log.info(
        "review_section_components",
        section=input.section_title,
        lessons=len(input.lesson_components),
    )
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_section_qa_prompt(
        section_title=input.section_title,
        section_description=input.section_description,
        section_outcomes=input.section_outcomes,
        lesson_components=input.lesson_components,
        course_goal=input.course_goal,
        prior_content_digest=input.prior_content_digest,
    )

    result = await AgentRegistry.get("section-qa-judge").run(prompt, model=model)
    activity.heartbeat()

    return ReviewSectionOutput(qa=result.output)
