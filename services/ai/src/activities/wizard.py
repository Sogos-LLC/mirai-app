"""Temporal activities for wizard steps — thin wrappers around wizard agents."""

from dataclasses import dataclass, field

import structlog
from temporalio import activity

from src.agents.wizard_agents import (
    generate_audience_personas,
    generate_outcomes,
    generate_sme_personas,
    generate_title,
    generate_tone_options,
)
from src.models.wizard import WizardAudiencePersona, WizardSMEPersona

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Title Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateTitleInput:
    api_key: str
    course_name: str


@dataclass
class GenerateTitleOutput:
    improved_title: str
    description: str


@activity.defn
async def generate_title_activity(input: GenerateTitleInput) -> GenerateTitleOutput:
    """Generate an improved course title and description."""
    log.info("generate_title_activity", course_name=input.course_name)

    result = await generate_title(
        api_key=input.api_key,
        course_name=input.course_name,
    )

    return GenerateTitleOutput(
        improved_title=result.improved_title,
        description=result.description,
    )


# ---------------------------------------------------------------------------
# Outcomes Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateOutcomesInput:
    api_key: str
    course_name: str
    rag_chunks: list[dict] = field(default_factory=list)


@dataclass
class GenerateOutcomesOutput:
    outcomes: str


@activity.defn
async def generate_outcomes_activity(
    input: GenerateOutcomesInput,
) -> GenerateOutcomesOutput:
    """Generate learning outcomes, optionally grounded in RAG content."""
    log.info("generate_outcomes_activity", course_name=input.course_name)

    from src.models.knowledge import KnowledgeChunk

    chunks = (
        [KnowledgeChunk(**c) for c in input.rag_chunks]
        if input.rag_chunks
        else None
    )

    result = await generate_outcomes(
        api_key=input.api_key,
        course_name=input.course_name,
        rag_chunks=chunks,
    )

    return GenerateOutcomesOutput(outcomes=result.outcomes)


# ---------------------------------------------------------------------------
# SME Personas Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateSMEPersonasInput:
    api_key: str
    title: str
    description: str


@dataclass
class GenerateSMEPersonasOutput:
    personas: list[dict] = field(default_factory=list)


@activity.defn
async def generate_sme_personas_activity(
    input: GenerateSMEPersonasInput,
) -> GenerateSMEPersonasOutput:
    """Generate 3 SME personas for the course."""
    log.info("generate_sme_personas_activity", title=input.title)

    result = await generate_sme_personas(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
    )

    return GenerateSMEPersonasOutput(
        personas=[p.model_dump() for p in result.personas],
    )


# ---------------------------------------------------------------------------
# Audience Personas Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateAudiencePersonasInput:
    api_key: str
    title: str
    description: str
    sme_personas: list[dict] = field(default_factory=list)


@dataclass
class GenerateAudiencePersonasOutput:
    personas: list[dict] = field(default_factory=list)


@activity.defn
async def generate_audience_personas_activity(
    input: GenerateAudiencePersonasInput,
) -> GenerateAudiencePersonasOutput:
    """Generate 3 audience personas for the course."""
    log.info("generate_audience_personas_activity", title=input.title)

    sme_list = [WizardSMEPersona(**p) for p in input.sme_personas]

    result = await generate_audience_personas(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
        sme_personas=sme_list,
    )

    return GenerateAudiencePersonasOutput(
        personas=[p.model_dump() for p in result.personas],
    )


# ---------------------------------------------------------------------------
# Tone Options Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateToneOptionsInput:
    api_key: str
    title: str
    description: str
    audience_personas: list[dict] = field(default_factory=list)


@dataclass
class GenerateToneOptionsOutput:
    options: list[dict] = field(default_factory=list)


@activity.defn
async def generate_tone_options_activity(
    input: GenerateToneOptionsInput,
) -> GenerateToneOptionsOutput:
    """Generate 3 tone/style options for the course."""
    log.info("generate_tone_options_activity", title=input.title)

    audience_list = [WizardAudiencePersona(**p) for p in input.audience_personas]

    result = await generate_tone_options(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
        audience_personas=audience_list,
    )

    return GenerateToneOptionsOutput(
        options=[o.model_dump() for o in result.options],
    )
