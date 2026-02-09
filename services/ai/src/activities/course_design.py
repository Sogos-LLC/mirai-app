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
from src.workflows.types import ActivityUsage

log = structlog.get_logger()


def _extract_usage(result: object, activity_name: str) -> ActivityUsage:
    """Extract ActivityUsage from a pydantic-ai RunResult."""
    try:
        run_usage = result.usage()  # type: ignore[union-attr]
        return ActivityUsage(
            activity_name=activity_name,
            input_tokens=run_usage.input_tokens or 0,
            output_tokens=run_usage.output_tokens or 0,
            cache_read_tokens=run_usage.cache_read_tokens or 0,
            cache_write_tokens=run_usage.cache_write_tokens or 0,
            requests=run_usage.requests or 0,
            total_tokens=(run_usage.input_tokens or 0) + (run_usage.output_tokens or 0),
        )
    except Exception:
        return ActivityUsage(activity_name=activity_name)

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
    strict_knowledge_only: bool = False
    additional_context: str = ""


@dataclass
class WebSourceData:
    title: str
    url: str
    snippet: str = ""
    confidence: float = 0.85  # default for Gemini-grounded sources


@dataclass
class GenerateAnalysisOutput:
    analysis: CourseAnalysis
    web_sources: list[WebSourceData] | None = None
    usage: ActivityUsage | None = None


@dataclass
class GenerateOutcomesInput:
    api_key: str
    topic: str
    audience: str
    purpose_statement: str
    learner_assumptions: list[str]
    constraints: list[str]
    rag_context: str = ""
    strict_knowledge_only: bool = False
    additional_context: str = ""


@dataclass
class GenerateOutcomesOutput:
    outcomes: CourseOutcomes
    usage: ActivityUsage | None = None


@dataclass
class GenerateStructureInput:
    api_key: str
    topic: str
    audience: str
    outcomes: CourseOutcomes
    rag_context: str = ""
    strict_knowledge_only: bool = False
    additional_context: str = ""


@dataclass
class GenerateStructureOutput:
    structure: CourseStructure
    usage: ActivityUsage | None = None


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
    use_context: str = ""
    strict_knowledge_only: bool = False
    additional_context: str = ""


@dataclass
class GenerateSampleLessonOutput:
    lesson: Lesson
    usage: ActivityUsage | None = None


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
    strict_knowledge_only: bool = False


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
    usage: ActivityUsage | None = None


@dataclass
class RunWebResearchInput:
    api_key: str
    topic: str
    audience: str
    query: str = ""


@dataclass
class RunWebResearchOutput:
    research_text: str
    web_sources: list[WebSourceData]


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
    web_sources: list[WebSourceData] = []
    if input.enable_web_research:
        log.info("running_web_research", topic=input.topic)
        research_prompt = build_research_prompt(input.topic, input.audience)
        web_context, web_sources = await _run_web_research(input.api_key, research_prompt)
        log.info("web_research_complete", length=len(web_context))
        log.info("web_sources_extracted", count=len(web_sources))
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
        strict_knowledge_only=input.strict_knowledge_only,
        additional_context=input.additional_context,
    )

    result = await AgentRegistry.get("course-analysis").run(prompt, model=model)
    activity.heartbeat()

    return GenerateAnalysisOutput(
        analysis=result.output,
        web_sources=web_sources if web_sources else None,
        usage=_extract_usage(result, "generate_course_analysis"),
    )


def _resolve_vertex_url(url: str) -> str:
    """Resolve vertexaisearch.cloud.google.com proxy URLs to actual domain URLs."""
    if "vertexaisearch.cloud.google.com" not in url:
        return url
    from urllib.parse import urlparse, parse_qs
    try:
        parsed = urlparse(url)
        qs = parse_qs(parsed.query)
        for param in ("url", "q", "redirect_url", "destination"):
            if param in qs:
                return qs[param][0]
        path = parsed.path
        if "/grounding-api-redirect/" in path:
            remainder = path.split("/grounding-api-redirect/", 1)[1]
            if remainder.startswith("http"):
                return remainder
    except Exception:
        pass
    return url


async def _run_web_research(
    api_key: str, prompt: str,
) -> tuple[str, list[WebSourceData]]:
    """Run web research using google.genai directly to access grounding metadata.

    pydantic-ai strips GroundingMetadata from Gemini responses, so we bypass it
    for this call and use the google.genai SDK which preserves the full response
    including grounding_chunks with URIs and titles.

    Returns (research_text, web_sources).
    """
    from google import genai
    from google.genai import types

    sources: list[WebSourceData] = []
    text = ""

    try:
        client = genai.Client(api_key=api_key)
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                system_instruction=(
                    "You are a research assistant preparing background material "
                    "for an instructional designer. Search the web for relevant, "
                    "current information and return a concise research summary "
                    "(3-5 paragraphs) with the most useful findings."
                ),
            ),
        )

        # Extract text response
        text = response.text or ""

        # Extract grounding metadata — this is why we use google.genai directly
        grounding = getattr(response.candidates[0], "grounding_metadata", None)
        if grounding and grounding.grounding_chunks:
            # Build chunk index → resolved URL map
            chunk_url_map: dict[int, str] = {}
            seen_urls: set[str] = set()
            for ci, chunk in enumerate(grounding.grounding_chunks):
                web = getattr(chunk, "web", None)
                if web and web.uri:
                    resolved = _resolve_vertex_url(web.uri)
                    chunk_url_map[ci] = resolved
                    if resolved not in seen_urls:
                        seen_urls.add(resolved)
                        sources.append(WebSourceData(
                            title=web.title or resolved,
                            url=resolved,
                        ))

            # Extract confidence scores and snippets from grounding_supports
            supports = getattr(grounding, "grounding_supports", None)
            if supports:
                chunk_confidences: dict[int, list[float]] = {}
                url_snippets: dict[str, list[str]] = {}

                for support in supports:
                    indices = getattr(support, "grounding_chunk_indices", None) or []
                    scores = getattr(support, "confidence_scores", None) or []
                    seg = getattr(support, "segment", None)
                    seg_text = getattr(seg, "text", "").strip() if seg else ""

                    for ci, conf in zip(indices, scores):
                        chunk_confidences.setdefault(ci, []).append(conf)

                    if seg_text:
                        for ci in indices:
                            url = chunk_url_map.get(ci)
                            if url:
                                url_snippets.setdefault(url, []).append(seg_text)

                # Apply confidence and snippets to sources
                for src in sources:
                    # Confidence: max score across all supports referencing this URL
                    scores_for_url = [
                        s for ci, sl in chunk_confidences.items()
                        for s in sl if chunk_url_map.get(ci) == src.url
                    ]
                    if scores_for_url:
                        src.confidence = max(scores_for_url)

                    # Snippet: first 2 segments, capped at 300 chars
                    snippets = url_snippets.get(src.url, [])
                    if snippets:
                        src.snippet = " ".join(snippets[:2])[:300]

            log.info("grounding_chunks_found", count=len(grounding.grounding_chunks), unique_urls=len(sources))
        else:
            log.warning("no_grounding_metadata", has_candidates=bool(response.candidates))

    except Exception:
        log.warning("web_research_failed", exc_info=True)

    return text, sources


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
            strict_knowledge_only=input.strict_knowledge_only,
            additional_context=input.additional_context,
        )
        if last_error:
            prompt += f"\n\n## PREVIOUS ATTEMPT FAILED VALIDATION\n{last_error}\nPlease fix the issues and try again."

        try:
            result = await AgentRegistry.get("course-outcomes").run(prompt, model=model)
            activity.heartbeat()
            # Additional validation: check outcome quality
            _validate_outcomes(result.output)
            return GenerateOutcomesOutput(
                outcomes=result.output,
                usage=_extract_usage(result, "generate_course_outcomes"),
            )
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
            strict_knowledge_only=input.strict_knowledge_only,
            additional_context=input.additional_context,
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
            return GenerateStructureOutput(
                structure=result.output,
                usage=_extract_usage(result, "generate_course_structure"),
            )
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
    result = await AgentRegistry.get("structure-coverage-judge").run(prompt, model=model)
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

    result = await AgentRegistry.get("section-outcomes").run(prompt, model=model)
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
        use_context=input.use_context,
        strict_knowledge_only=input.strict_knowledge_only,
        additional_context=input.additional_context,
    )

    result = await AgentRegistry.get("sample-lesson").run(prompt, model=model)
    activity.heartbeat()

    return GenerateSampleLessonOutput(
        lesson=result.output,
        usage=_extract_usage(result, "generate_sample_lesson"),
    )


@activity.defn
async def extract_lesson_template(input: ExtractTemplateInput) -> ExtractTemplateOutput:
    """Hidden: Extract reusable template from approved sample lesson."""
    log.info("extract_lesson_template")
    activity.heartbeat()

    model = make_model(input.api_key)
    prompt = build_template_prompt(lesson=input.lesson)

    result = await AgentRegistry.get("lesson-template").run(prompt, model=model)
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
        strict_knowledge_only=input.strict_knowledge_only,
    )

    result = await AgentRegistry.get("lesson-expansion").run(prompt, model=model)
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

    return RunQAOutput(
        qa=result.output,
        usage=_extract_usage(result, "run_course_qa"),
    )


@activity.defn
async def run_web_research(input: RunWebResearchInput) -> RunWebResearchOutput:
    """Standalone web research activity for the orchestrator.

    Wraps _run_web_research() so it can be called as a Temporal activity
    from the ResearchOrchestrator.
    """
    log.info("run_web_research_activity", topic=input.topic)
    activity.heartbeat()

    research_prompt = build_research_prompt(input.topic, input.audience)
    text, sources = await _run_web_research(input.api_key, research_prompt)
    activity.heartbeat()

    return RunWebResearchOutput(research_text=text, web_sources=sources)
