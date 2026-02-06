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
    component_generation_agent,
)
from src.agents.model import make_model
from src.agents.section_qa_agent import (
    SectionQAResult,
    build_section_qa_prompt,
    section_qa_agent,
)
from src.models.component_content import LessonComponents
from src.models.outcome_tracker import OutcomeCoverage

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


@dataclass
class ReviewSectionInput:
    """Input for the review_section_components activity."""

    api_key: str
    section_title: str
    section_description: str
    section_outcomes: list[str]
    lesson_components: dict[str, LessonComponents]
    course_goal: str


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

    result = await component_generation_agent.run(prompt, model=model)
    activity.heartbeat()

    return GenerateComponentsOutput(
        lesson_title=input.context.lesson_title,
        section_title=input.context.section_title,
        components=result.output,
        outcomes_covered=result.output.outcomes_covered,
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
    )

    result = await section_qa_agent.run(prompt, model=model)
    activity.heartbeat()

    return ReviewSectionOutput(qa=result.output)
