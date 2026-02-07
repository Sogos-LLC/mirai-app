"""Temporal activities for the 5-step instructional design wizard.

Each activity runs an agent, validates the output, and returns a Pydantic model.
Validation failures trigger automatic retries with feedback to the agent.
"""

from __future__ import annotations

import structlog
from dataclasses import dataclass
from temporalio import activity

from src.agents.model import make_model
from src.agents.registry import AgentRegistry
from src.agents.course_design_agents import (
    build_research_prompt,
    build_analysis_prompt,
    build_outcomes_prompt,
    build_structure_prompt,
    build_structure_coverage_prompt,
    build_section_outcomes_prompt,
    build_lesson_prompt,
    build_template_prompt,
    build_expansion_prompt,
    build_qa_prompt,
)
from src.models.course_design import (
    CourseAnalysis,
    CourseOutcomes,
    CourseStructure,
    SectionOutcomes,
    Lesson,
    LessonTemplate,
    ExpandedLesson,
    CourseQA,
)

log = structlog.get_logger()

MAX_VALIDATION_RETRIES = 2


# =============================================================================
# Activity Input/Output Types
# =============================================================================


@dataclass
class GenerateAnalysisInput:
    api_key: str
    topic: str
    audience: str
    use_context: str = ""
    rag_context: str = ""
    enable_web_research: bool = False


@dataclass
class GenerateAnalysisOutput:
    analysis: CourseAnalysis


@dataclass
class GenerateOutcomesInput:
    api_key: str
    topic: str
    audience: str
    purpose_statement: str
    learner_assumptions: list[str]
    constraints: list[str]
    rag_context: str = ""


@dataclass
class GenerateOutcomesOutput:
    outcomes: CourseOutcomes


@dataclass
class GenerateStructureInput:
    api_key: str
    topic: str
    audience: str
    outcomes: CourseOutcomes
    rag_context: str = ""


@dataclass
class GenerateStructureOutput:
    structure: CourseStructure


@dataclass
class GenerateSectionOutcomesInput:
    api_key: str
    structure: CourseStructure
    outcomes: CourseOutcomes


@dataclass
class GenerateSectionOutcomesOutput:
    section_outcomes: SectionOutcomes


@dataclass
class GenerateSampleLessonInput:
    api_key: str
    topic: str
    audience: str
    course_goal: str
    section_title: str
    section_outcomes: SectionOutcomes | None = None
    rag_context: str = ""


@dataclass
class GenerateSampleLessonOutput:
    lesson: Lesson


@dataclass
class ExtractTemplateInput:
    api_key: str
    lesson: Lesson


@dataclass
class ExtractTemplateOutput:
    template: LessonTemplate


@dataclass
class ExpandLessonInput:
    api_key: str
    topic: str
    audience: str
    course_goal: str
    section_title: str
    lesson_title: str
    lesson_objective: str
    template: LessonTemplate
    rag_context: str = ""


@dataclass
class ExpandLessonOutput:
    lesson: ExpandedLesson


@dataclass
class RunQAInput:
    api_key: str
    outcomes: CourseOutcomes
    structure: CourseStructure
    lesson_titles: list[str]
    total_blocks: int


@dataclass
class RunQAOutput:
    qa: CourseQA


# =============================================================================
# Activities
# =============================================================================


@activity.defn
async def generate_course_analysis(input: GenerateAnalysisInput) -> GenerateAnalysisOutput:
    """Step 1: Generate CourseAnalysis from intent."""
    log.info("generate_course_analysis", topic=input.topic, web_research=input.enable_web_research)
    activity.heartbeat()

    model = make_model(input.api_key)

    # Optional: run web research first to gather background context
    web_context = ""
    if input.enable_web_research:
        log.info("running_web_research", topic=input.topic)
        research_prompt = build_research_prompt(input.topic, input.audience)
        research_result = await AgentRegistry.get("course-web-research").run(research_prompt, model=model)
        web_context = research_result.output
        log.info("web_research_complete", length=len(web_context))
        activity.heartbeat()

    # Combine RAG context with web research context
    combined_context = input.rag_context
    if web_context:
        if combined_context:
            combined_context += f"\n\n## Web Research Findings\n{web_context}"
        else:
            combined_context = web_context

    prompt = build_analysis_prompt(
        topic=input.topic,
        audience=input.audience,
        use_context=input.use_context,
        rag_context=combined_context,
    )

    result = await AgentRegistry.get("course-analysis").run(prompt, model=model)
    activity.heartbeat()

    return GenerateAnalysisOutput(analysis=result.output)


@activity.defn
async def generate_course_outcomes(input: GenerateOutcomesInput) -> GenerateOutcomesOutput:
    """Step 2: Generate CourseOutcomes from approved analysis."""
    log.info("generate_course_outcomes", topic=input.topic)
    activity.heartbeat()

    model = make_model(input.api_key)

    # Retry loop: if validation fails, feed back errors and retry
    last_error = ""
    for attempt in range(MAX_VALIDATION_RETRIES + 1):
        prompt = build_outcomes_prompt(
            purpose_statement=input.purpose_statement,
            learner_assumptions=input.learner_assumptions,
            constraints=input.constraints,
            topic=input.topic,
            audience=input.audience,
            rag_context=input.rag_context,
        )
        if last_error:
            prompt += f"\n\n## PREVIOUS ATTEMPT FAILED VALIDATION\n{last_error}\nPlease fix the issues and try again."

        try:
            result = await AgentRegistry.get("course-outcomes").run(prompt, model=model)
            activity.heartbeat()
            # Additional validation: check outcome quality
            _validate_outcomes(result.output)
            return GenerateOutcomesOutput(outcomes=result.output)
        except Exception as e:
            last_error = str(e)
            log.warning("outcome_validation_failed", attempt=attempt, error=last_error)
            if attempt == MAX_VALIDATION_RETRIES:
                raise
            activity.heartbeat()

    raise RuntimeError("Unreachable")


def _validate_outcomes(outcomes: CourseOutcomes) -> None:
    """Validate outcome quality beyond Pydantic schema validation."""
    # Check for duplicate outcomes
    seen = set()
    for o in outcomes.outcomes:
        key = f"{o.verb.lower()} {o.object.lower()}"
        if key in seen:
            raise ValueError(f"Duplicate outcome: '{key}'. Each outcome must be unique.")
        seen.add(key)


@activity.defn
async def generate_course_structure(input: GenerateStructureInput) -> GenerateStructureOutput:
    """Step 3: Generate CourseStructure from approved outcomes."""
    log.info("generate_course_structure")
    activity.heartbeat()

    model = make_model(input.api_key)

    last_error = ""
    for attempt in range(MAX_VALIDATION_RETRIES + 1):
        prompt = build_structure_prompt(
            outcomes=input.outcomes,
            topic=input.topic,
            audience=input.audience,
            rag_context=input.rag_context,
        )
        if last_error:
            prompt += f"\n\n## PREVIOUS ATTEMPT FAILED VALIDATION\n{last_error}\nPlease fix."

        try:
            result = await AgentRegistry.get("course-structure").run(prompt, model=model)
            activity.heartbeat()
            # Deterministic check: every section must have at least one mapped outcome
            _validate_structure_basic(result.output)
            # LLM judge: semantic coverage check (no exact string matching)
            await _validate_structure_coverage(result.output, input.outcomes, model)
            activity.heartbeat()
            return GenerateStructureOutput(structure=result.output)
        except Exception as e:
            last_error = str(e)
            log.warning("structure_validation_failed", attempt=attempt, error=last_error)
            if attempt == MAX_VALIDATION_RETRIES:
                raise
            activity.heartbeat()

    raise RuntimeError("Unreachable")


def _validate_structure_basic(structure: CourseStructure) -> None:
    """Deterministic checks that don't need an LLM."""
    for section in structure.sections:
        if not section.mapped_outcomes:
            raise ValueError(
                f"Section '{section.title}' has no mapped outcomes. "
                "Every section must address at least one learning outcome."
            )


async def _validate_structure_coverage(
    structure: CourseStructure,
    outcomes: CourseOutcomes,
    model: object,
) -> None:
    """Use an LLM judge to verify all outcomes are semantically covered."""
    prompt = build_structure_coverage_prompt(outcomes, structure)
    result = await AgentRegistry.get("course-structure-coverage-judge").run(prompt, model=model)
    score = result.output

    if not score.all_covered:
        uncovered = ", ".join(score.uncovered_outcomes) if score.uncovered_outcomes else "unknown"
        raise ValueError(
            f"Outcomes not covered by any section: {uncovered}. "
            f"Reason: {score.reasoning}. "
            "Every outcome must be mapped to at least one section."
        )


@activity.defn
async def generate_section_outcomes(input: GenerateSectionOutcomesInput) -> GenerateSectionOutcomesOutput:
    """Hidden: Generate granular section-level outcomes."""
    log.info("generate_section_outcomes")
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_section_outcomes_prompt(
        structure=input.structure,
        outcomes=input.outcomes,
    )

    result = await AgentRegistry.get("course-section-outcomes").run(prompt, model=model)
    activity.heartbeat()

    return GenerateSectionOutcomesOutput(section_outcomes=result.output)


@activity.defn
async def generate_sample_lesson(input: GenerateSampleLessonInput) -> GenerateSampleLessonOutput:
    """Step 4: Generate a complete sample lesson."""
    log.info("generate_sample_lesson", section=input.section_title)
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_lesson_prompt(
        section_title=input.section_title,
        section_outcomes=[input.section_outcomes] if input.section_outcomes else None,
        course_goal=input.course_goal,
        topic=input.topic,
        audience=input.audience,
        rag_context=input.rag_context,
    )

    result = await AgentRegistry.get("course-lesson").run(prompt, model=model)
    activity.heartbeat()

    return GenerateSampleLessonOutput(lesson=result.output)


@activity.defn
async def extract_lesson_template(input: ExtractTemplateInput) -> ExtractTemplateOutput:
    """Hidden: Extract reusable template from approved sample lesson."""
    log.info("extract_lesson_template")
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_template_prompt(lesson=input.lesson)

    result = await AgentRegistry.get("course-template").run(prompt, model=model)
    activity.heartbeat()

    return ExtractTemplateOutput(template=result.output)


@activity.defn
async def expand_lesson(input: ExpandLessonInput) -> ExpandLessonOutput:
    """Hidden: Generate a lesson using the approved template."""
    log.info("expand_lesson", section=input.section_title, lesson=input.lesson_title)
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_expansion_prompt(
        section_title=input.section_title,
        lesson_title=input.lesson_title,
        lesson_objective=input.lesson_objective,
        template=input.template,
        course_goal=input.course_goal,
        topic=input.topic,
        audience=input.audience,
        rag_context=input.rag_context,
    )

    result = await AgentRegistry.get("course-expansion").run(prompt, model=model)
    activity.heartbeat()

    return ExpandLessonOutput(lesson=result.output)


@activity.defn
async def run_course_qa(input: RunQAInput) -> RunQAOutput:
    """Step 5: Run QA validators on the complete course."""
    log.info("run_course_qa", lessons=len(input.lesson_titles))
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_qa_prompt(
        outcomes=input.outcomes,
        structure=input.structure,
        lesson_titles=input.lesson_titles,
        total_blocks=input.total_blocks,
    )

    result = await AgentRegistry.get("course-qa").run(prompt, model=model)
    activity.heartbeat()

    return RunQAOutput(qa=result.output)
