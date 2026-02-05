"""Temporal activities for wizard steps — thin wrappers around wizard graphs."""

from dataclasses import dataclass, field

import structlog
from temporalio import activity

from src.graphs.audience_graph import run_audience_graph
from src.graphs.outcomes_graph import run_outcomes_graph
from src.graphs.sme_graph import run_sme_graph
from src.graphs.title_graph import run_title_graph
from src.graphs.tone_graph import run_tone_graph
from src.models.wizard import WizardAudiencePersona, WizardSMEPersona

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# Title Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateTitleInput:
    api_key: str
    course_name: str
    feedback: str = ""
    rag_filters: dict[str, str] | None = None


@dataclass
class GenerateTitleOutput:
    improved_title: str
    description: str
    constraint_violations: list[str] = field(default_factory=list)
    rag_chunks_used: int = 0


@activity.defn
async def generate_title_activity(input: GenerateTitleInput) -> GenerateTitleOutput:
    """Generate an improved course title and description via graph."""
    log.info("generate_title_activity", course_name=input.course_name)

    result = await run_title_graph(
        api_key=input.api_key,
        course_name=input.course_name,
        feedback=input.feedback,
        rag_filters=input.rag_filters,
    )

    return GenerateTitleOutput(
        improved_title=result.improved_title,
        description=result.description,
        constraint_violations=result.violations,
        rag_chunks_used=result.chunks_used,
    )


# ---------------------------------------------------------------------------
# Outcomes Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateOutcomesInput:
    api_key: str
    course_name: str
    feedback: str = ""
    rag_filters: dict[str, str] | None = None


@dataclass
class GenerateOutcomesOutput:
    outcomes: str
    constraint_violations: list[str] = field(default_factory=list)
    rag_chunks_used: int = 0


@activity.defn
async def generate_outcomes_activity(
    input: GenerateOutcomesInput,
) -> GenerateOutcomesOutput:
    """Generate learning outcomes via graph."""
    log.info("generate_outcomes_activity", course_name=input.course_name)

    result = await run_outcomes_graph(
        api_key=input.api_key,
        course_name=input.course_name,
        feedback=input.feedback,
        rag_filters=input.rag_filters,
    )

    return GenerateOutcomesOutput(
        outcomes=result.outcomes,
        constraint_violations=result.violations,
        rag_chunks_used=result.chunks_used,
    )


# ---------------------------------------------------------------------------
# SME Personas Generation
# ---------------------------------------------------------------------------


@dataclass
class GenerateSMEPersonasInput:
    api_key: str
    title: str
    description: str
    rag_filters: dict[str, str] | None = None


@dataclass
class GenerateSMEPersonasOutput:
    personas: list[dict] = field(default_factory=list)
    constraint_violations: list[str] = field(default_factory=list)
    rag_chunks_used: int = 0


@activity.defn
async def generate_sme_personas_activity(
    input: GenerateSMEPersonasInput,
) -> GenerateSMEPersonasOutput:
    """Generate 3 SME personas via graph."""
    log.info("generate_sme_personas_activity", title=input.title)

    result = await run_sme_graph(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
        rag_filters=input.rag_filters,
    )

    return GenerateSMEPersonasOutput(
        personas=result.personas,
        constraint_violations=result.violations,
        rag_chunks_used=result.chunks_used,
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
    rag_filters: dict[str, str] | None = None


@dataclass
class GenerateAudiencePersonasOutput:
    personas: list[dict] = field(default_factory=list)
    constraint_violations: list[str] = field(default_factory=list)
    rag_chunks_used: int = 0


@activity.defn
async def generate_audience_personas_activity(
    input: GenerateAudiencePersonasInput,
) -> GenerateAudiencePersonasOutput:
    """Generate 3 audience personas via graph."""
    log.info("generate_audience_personas_activity", title=input.title)

    sme_list = [WizardSMEPersona(**p) for p in input.sme_personas]

    result = await run_audience_graph(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
        sme_personas=sme_list,
        rag_filters=input.rag_filters,
    )

    return GenerateAudiencePersonasOutput(
        personas=result.personas,
        constraint_violations=result.violations,
        rag_chunks_used=result.chunks_used,
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
    rag_filters: dict[str, str] | None = None


@dataclass
class GenerateToneOptionsOutput:
    options: list[dict] = field(default_factory=list)
    constraint_violations: list[str] = field(default_factory=list)
    rag_chunks_used: int = 0


@activity.defn
async def generate_tone_options_activity(
    input: GenerateToneOptionsInput,
) -> GenerateToneOptionsOutput:
    """Generate 3 tone/style options via graph."""
    log.info("generate_tone_options_activity", title=input.title)

    audience_list = [WizardAudiencePersona(**p) for p in input.audience_personas]

    result = await run_tone_graph(
        api_key=input.api_key,
        title=input.title,
        description=input.description,
        audience_personas=audience_list,
        rag_filters=input.rag_filters,
    )

    return GenerateToneOptionsOutput(
        options=result.options,
        constraint_violations=result.violations,
        rag_chunks_used=result.chunks_used,
    )
