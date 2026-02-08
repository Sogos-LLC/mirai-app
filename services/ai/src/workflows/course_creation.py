"""Unified course creation workflow — single-gate instructional design with validated artifacts.

Control flow:
  Intent → Analysis (auto)
  Goal → Outcomes (auto)
  Outcomes → Structure (auto)
  Structure → Sample Lesson (auto)
  Combined Review → Approval (single gate)
  Lesson Template → Full Course → QA → Export (auto)

Each arrow is a Pydantic validated boundary.
Validation failures trigger regeneration, not user prompts.

AI work is done in Python activities on ai-tasks queue.
Infrastructure (DB, MinIO) is done via Go activities on go-tasks queue.
"""

import asyncio
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import structlog
from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    from src.activities.component_generation import (
        GenerateComponentsInput,
        GenerateComponentsOutput,
        ReviewSectionInput,
        ReviewSectionOutput,
    )
    from src.activities.course_design import (
        ExtractTemplateInput,
        ExtractTemplateOutput,
        GenerateAnalysisInput,
        GenerateAnalysisOutput,
        GenerateOutcomesInput,
        GenerateOutcomesOutput,
        GenerateSampleLessonInput,
        GenerateSampleLessonOutput,
        GenerateSectionOutcomesInput,
        GenerateSectionOutcomesOutput,
        GenerateStructureInput,
        GenerateStructureOutput,
        RunQAInput,
        RunQAOutput,
    )
    from src.agents.component_generation_agent import ComponentContext
    from src.models.attribution import (
        SourceReference,
        resolve_component_provenance,
        resolve_lesson_provenance,
    )
    from src.models.component_content import (
        COMPONENT_TYPE_MAP,
        CalloutComponent,
        LessonComponents,
        TextComponent,
    )
    from src.models.resource_hint import ResourceHint
    from src.services.resource_parser import URLResourceParser
    from src.models.course_design import (
        CourseAnalysis,
        CourseOutcomes,
        CourseStructure,
        Lesson,
        LessonTemplate,
        Section,
        SectionOutcomes,
    )
    from src.models.outcome_tracker import OutcomeTracker
    from src.research.orchestrator import ResearchOrchestrator
    from src.research.types import ResearchResult
    from src.workflows.types import (
        CourseCreationInput,
        CourseCreationOutput,
        LockedArtifacts,
        StepApproval,
    )

log = structlog.get_logger()

# Task queues
GO_TASKS = "go-tasks"
AI_TASKS = "ai-tasks"

# Timeout configs
GO_TIMEOUT = timedelta(seconds=30)
AI_SHORT_TIMEOUT = timedelta(minutes=3)
AI_LONG_TIMEOUT = timedelta(minutes=5)
AI_LESSON_TIMEOUT = timedelta(minutes=10)
AI_HEARTBEAT = timedelta(minutes=3)

# Retry policies
GO_RETRY = {"maximum_attempts": 3}
AI_RETRY = {"maximum_attempts": 2}

# Lesson parallelism
LESSON_BATCH_SIZE = 3


def _inject_missing_reference_links(
    lesson: "LessonComponents",
    ref_hints: list["ResourceHint"],
) -> None:
    """Inject reference URLs as callout if the model didn't include them in HTML.

    Scans all text and callout components for each reference URL. If a URL
    is missing from every component, appends a callout with the link.
    Only mutates ``lesson.components`` if links are missing.
    """
    # Collect all HTML from text and callout components
    all_html = ""
    for c in lesson.components:
        if isinstance(c, TextComponent):
            all_html += c.textHtml
        elif isinstance(c, CalloutComponent):
            all_html += c.content

    missing = [h for h in ref_hints if h.url not in all_html]
    if not missing:
        return

    # Build a single callout with all missing reference links
    link_lines = []
    for h in missing:
        # Derive a readable label from the URL path
        from urllib.parse import urlparse
        parsed = urlparse(h.url)
        label = parsed.netloc.replace("www.", "")
        path_parts = [p for p in parsed.path.strip("/").split("/") if p]
        if path_parts:
            slug = path_parts[-1].replace("_", " ").replace("-", " ").title()
            label = f"{slug} ({label})"
        link_lines.append(f'<a href="{h.url}">{label}</a>')

    callout = CalloutComponent(
        style="info",
        title="Additional Resources",
        content="Explore these resources for more information: " + ", ".join(link_lines) + ".",
    )
    lesson.components.append(callout)
    log.info("injected_missing_reference_links", count=len(missing), urls=[h.url for h in missing])


@workflow.defn(sandboxed=False)
class CourseCreationWorkflow:
    """Single-gate course creation workflow with update-based human-in-the-loop.

    All 4 AI generation steps run automatically, then a single combined review
    is presented. After approval, component generation, QA, and export run
    without further approval gates.
    """

    def __init__(self) -> None:
        self._approval: StepApproval | None = None
        self._current_step: str = ""
        self._status: str = "processing"
        self._step_data: str = ""
        self._progress: int = 0
        self._progress_message: str = ""
        self._artifacts = LockedArtifacts()
        self._orchestrator: ResearchOrchestrator | None = None
        self._course_research: ResearchResult | None = None  # Cached top-level research
        self._section_source_refs: dict[str, list[SourceReference]] = {}  # section_title -> refs

    # ------------------------------------------------------------------
    # Query handler
    # ------------------------------------------------------------------

    @workflow.query
    def get_state(self) -> dict:
        return {
            "status": self._status,
            "current_step": self._current_step,
            "step_data_json": self._step_data,
            "progress_percent": self._progress,
            "progress_message": self._progress_message,
        }

    # ------------------------------------------------------------------
    # Update handlers
    # ------------------------------------------------------------------

    @workflow.update
    async def approve_step(self, data: StepApproval) -> None:
        self._approval = data

    @approve_step.validator
    def validate_approve(self, data: StepApproval) -> None:
        if self._status != "awaiting_approval":
            raise ApplicationError(f"Not in approval state: {self._status}")

    @workflow.update
    async def reject_step(self, data: StepApproval) -> None:
        data.approved = False
        self._approval = data

    @reject_step.validator
    def validate_reject(self, data: StepApproval) -> None:
        if self._status != "awaiting_approval":
            raise ApplicationError(f"Not in approval state: {self._status}")

    # ------------------------------------------------------------------
    # Main run
    # ------------------------------------------------------------------

    @workflow.run
    async def run(self, input: CourseCreationInput) -> CourseCreationOutput:
        """Execute the single-gate course creation pipeline.

        All 4 AI generation steps run automatically, a single combined review
        is presented for approval, then component generation + QA + export
        run without further gates.
        """
        log.info(
            "course_creation_started",
            job_id=input.job_id,
            topic=input.topic,
            enable_internal_knowledge=input.enable_internal_knowledge,
            strict_knowledge_only=input.strict_knowledge_only,
            enable_web_research=input.enable_web_research,
            team_doc_ids=input.selected_team_doc_ids,
            global_doc_ids=input.selected_global_doc_ids,
        )

        self._status = "processing"
        self._progress = 0
        self._progress_message = "Starting course creation"
        await self._update_job(input, "PROCESSING", 0, "Starting course creation")

        # Decrypt API key (Go activity)
        api_key = await self._decrypt_api_key(input.tenant_id)

        # Initialize research orchestrator + health check
        self._orchestrator = ResearchOrchestrator.from_input(input)
        await self._orchestrator.check_health(api_key)

        # =============================================================
        # AUTO-GENERATE: Run all 4 AI steps without approval
        # =============================================================

        analysis, knowledge_coverage = await self._generate_analysis(api_key, input)
        outcomes = await self._generate_outcomes(api_key, input, analysis)
        structure, section_outcomes = await self._generate_structure(api_key, input, outcomes)
        sample_lesson, template, preview_components = await self._generate_sample(
            api_key, input, outcomes, structure, section_outcomes,
        )

        # =============================================================
        # COMBINED REVIEW: Single approval gate for all artifacts
        # =============================================================

        combined_data = self._build_combined_review_data(
            analysis, knowledge_coverage, outcomes,
            structure, section_outcomes, sample_lesson, preview_components,
        )

        approval = await self._publish_and_wait(
            input, "combined_review",
            json.dumps(combined_data),
            55,
        )

        # Handle deferral: user chose to assign gaps to SMEs and save draft
        if approval and not approval.approved and approval.feedback == "__DEFERRED__":
            self._status = "deferred"
            self._progress = 10
            self._progress_message = "Saved as draft — waiting for knowledge gaps to be filled"
            await self._update_job(
                input, "DEFERRED", 10,
                "Saved as draft — waiting for knowledge gaps to be filled",
            )
            await workflow.wait_condition(workflow.all_handlers_finished)
            return CourseCreationOutput(
                course_id=input.course_id,
                total_lessons=0,
                total_sections=0,
            )

        # Handle rejection: re-run ALL 4 generators with feedback
        if approval and not approval.approved and approval.feedback:
            feedback = approval.feedback
            # Append feedback to audience for regeneration
            feedback_input = CourseCreationInput(
                job_id=input.job_id,
                tenant_id=input.tenant_id,
                course_id=input.course_id,
                user_id=input.user_id,
                topic=input.topic,
                audience=f"{input.audience}\n\nFEEDBACK: {feedback}",
                use_context=input.use_context,
                enable_internal_knowledge=input.enable_internal_knowledge,
                strict_knowledge_only=input.strict_knowledge_only,
                enable_web_research=input.enable_web_research,
                selected_team_doc_ids=input.selected_team_doc_ids,
                selected_global_doc_ids=input.selected_global_doc_ids,
            )

            analysis, knowledge_coverage = await self._generate_analysis(api_key, feedback_input)
            outcomes = await self._generate_outcomes(api_key, feedback_input, analysis)
            structure, section_outcomes = await self._generate_structure(
                api_key, feedback_input, outcomes,
            )
            sample_lesson, template, preview_components = await self._generate_sample(
                api_key, feedback_input, outcomes, structure, section_outcomes,
            )

            combined_data = self._build_combined_review_data(
                analysis, knowledge_coverage, outcomes,
                structure, section_outcomes, sample_lesson, preview_components,
            )

            approval = await self._publish_and_wait(
                input, "combined_review",
                json.dumps(combined_data),
                55,
            )

            # Handle deferral after retry
            if approval and not approval.approved and approval.feedback == "__DEFERRED__":
                self._status = "deferred"
                self._progress = 10
                self._progress_message = "Saved as draft — waiting for knowledge gaps to be filled"
                await self._update_job(
                    input, "DEFERRED", 10,
                    "Saved as draft — waiting for knowledge gaps to be filled",
                )
                await workflow.wait_condition(workflow.all_handlers_finished)
                return CourseCreationOutput(
                    course_id=input.course_id,
                    total_lessons=0,
                    total_sections=0,
                )

        # Apply user modifications from approval
        if approval and approval.modifications:
            # Apply purpose_statement modification to analysis
            if "purpose_statement" in approval.modifications:
                data = analysis.model_dump()
                data["purpose_statement"] = approval.modifications["purpose_statement"]
                analysis = CourseAnalysis(**data)

            # Apply section_N_title modifications to structure + section_outcomes
            sections_list = [s.model_dump() for s in structure.sections]
            so_data = section_outcomes
            modified_structure = False
            for key, value in approval.modifications.items():
                parts = key.split("_")
                if len(parts) == 3 and parts[0] == "section" and parts[2] == "title":
                    try:
                        idx = int(parts[1])
                    except ValueError:
                        continue
                    if 0 <= idx < len(sections_list):
                        old_title = sections_list[idx]["title"]
                        sections_list[idx]["title"] = value
                        if old_title in so_data.section_outcomes:
                            so_data.section_outcomes[value] = so_data.section_outcomes.pop(old_title)
                        modified_structure = True
            if modified_structure:
                structure = CourseStructure(sections=[Section(**s) for s in sections_list])
                section_outcomes = so_data

        # Lock all artifacts
        self._artifacts.analysis = analysis
        self._artifacts.outcomes = outcomes
        self._artifacts.structure = structure
        self._artifacts.section_outcomes = section_outcomes
        self._artifacts.sample_lesson = sample_lesson
        self._artifacts.template = template

        # =============================================================
        # AUTO-RUN: Component Generation Pipeline
        # =============================================================

        all_lesson_components = await self._generate_all_components(
            api_key, input, outcomes, structure, section_outcomes,
            sample_lesson, template,
        )

        # =============================================================
        # AUTO-RUN: QA (informational, no approval gate)
        # =============================================================

        total_components = sum(
            len(lc.components) for lcs in all_lesson_components.values()
            for lc in lcs.values()
        )
        await self._run_qa(api_key, input, outcomes, structure, all_lesson_components, total_components)

        # =============================================================
        # AUTO-RUN: Export to S3
        # =============================================================

        self._set_progress(95, "Exporting course content...")
        await self._update_job(input, "PROCESSING", 95, "Exporting course content")

        course_content = self._build_s3_content_v2(
            input, analysis, outcomes, structure,
            section_outcomes, all_lesson_components,
        )
        await self._write_course_content(input.tenant_id, input.course_id, course_content)

        self._status = "completed"
        self._progress = 100
        self._progress_message = "Course creation complete"
        await self._update_job(input, "COMPLETED", 100, "Course creation complete")

        await workflow.wait_condition(workflow.all_handlers_finished)

        total_lessons = sum(len(lcs) for lcs in all_lesson_components.values())
        return CourseCreationOutput(
            course_id=input.course_id,
            total_lessons=total_lessons,
            total_sections=len(structure.sections),
        )

    # -------------------------------------------------------------------
    # Approval-free generators
    # -------------------------------------------------------------------

    async def _generate_analysis(
        self, api_key: str, input: CourseCreationInput,
    ) -> tuple[CourseAnalysis, dict | None]:
        """Run research + course analysis. Returns (analysis, knowledge_coverage)."""
        self._set_progress(5, "Analyzing course intent...")
        await self._update_job(input, "PROCESSING", 5, "Analyzing course intent")

        # Unified research: internal knowledge + web (run via orchestrator)
        assert self._orchestrator is not None
        research = await self._orchestrator.research(
            f"{input.topic} {input.audience}", api_key,
        )
        self._course_research = research  # Cache for later steps

        # Pass orchestrator research as rag_context
        rag_context = research.formatted_context
        if research.research_text:
            rag_context = (
                f"## Synthesized Research\n{research.research_text}\n\n"
                f"{rag_context}"
            )

        analysis_result: GenerateAnalysisOutput = await self._run_ai_activity(
            "generate_course_analysis",
            GenerateAnalysisInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                use_context=input.use_context,
                enable_web_research=False,  # Orchestrator handles web research now
                rag_context=rag_context,
                strict_knowledge_only=input.strict_knowledge_only,
            ),
            GenerateAnalysisOutput,
        )

        # Build knowledge coverage if strict mode
        knowledge_coverage = None
        if input.strict_knowledge_only:
            knowledge_coverage = self._build_knowledge_coverage()

        return analysis_result.analysis, knowledge_coverage

    async def _generate_outcomes(
        self, api_key: str, input: CourseCreationInput, analysis: CourseAnalysis,
    ) -> CourseOutcomes:
        """Generate learning outcomes from analysis. Returns CourseOutcomes."""
        self._set_progress(15, "Generating learning outcomes...")
        await self._update_job(input, "PROCESSING", 15, "Generating learning outcomes")

        # Use cached course-level research
        rag_context = self._course_research.formatted_context if self._course_research else ""

        outcomes_result: GenerateOutcomesOutput = await self._run_ai_activity(
            "generate_course_outcomes",
            GenerateOutcomesInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                purpose_statement=analysis.purpose_statement,
                learner_assumptions=analysis.learner_assumptions,
                constraints=analysis.constraints,
                rag_context=rag_context,
                strict_knowledge_only=input.strict_knowledge_only,
            ),
            GenerateOutcomesOutput,
        )

        return outcomes_result.outcomes

    async def _generate_structure(
        self, api_key: str, input: CourseCreationInput, outcomes: CourseOutcomes,
    ) -> tuple[CourseStructure, SectionOutcomes]:
        """Generate course structure + section outcomes. Returns (structure, section_outcomes)."""
        self._set_progress(25, "Designing course structure...")
        await self._update_job(input, "PROCESSING", 25, "Designing course structure")

        # Use cached course-level research
        rag_context = self._course_research.formatted_context if self._course_research else ""

        structure_result: GenerateStructureOutput = await self._run_ai_activity(
            "generate_course_structure",
            GenerateStructureInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                outcomes=outcomes,
                rag_context=rag_context,
                strict_knowledge_only=input.strict_knowledge_only,
            ),
            GenerateStructureOutput,
        )

        # Generate section outcomes
        self._set_progress(30, "Mapping section outcomes...")
        section_outcomes_result: GenerateSectionOutcomesOutput = await self._run_ai_activity(
            "generate_section_outcomes",
            GenerateSectionOutcomesInput(
                api_key=api_key,
                structure=structure_result.structure,
                outcomes=outcomes,
            ),
            GenerateSectionOutcomesOutput,
        )

        return structure_result.structure, section_outcomes_result.section_outcomes

    async def _generate_sample(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
    ) -> tuple[Lesson, LessonTemplate, list]:
        """Generate sample lesson + extract template. Returns (lesson, template, preview_components)."""
        self._set_progress(40, "Generating sample lesson...")
        await self._update_job(input, "PROCESSING", 40, "Generating sample lesson")

        # Select the first section as representative
        representative_section = structure.sections[0]

        # Parse multimedia resources from user context
        resource_hints: list[ResourceHint] = []
        if input.use_context:
            parser = URLResourceParser()
            resource_hints = parser.parse(input.use_context)

        # Use cached course-level research
        rag_context = self._course_research.formatted_context if self._course_research else ""

        lesson_result: GenerateSampleLessonOutput = await self._run_ai_activity(
            "generate_sample_lesson",
            GenerateSampleLessonInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                course_goal=outcomes.goal.goal_statement,
                section_title=representative_section.title,
                section_outcomes=section_outcomes,
                use_context=input.use_context,
                rag_context=rag_context,
                strict_knowledge_only=input.strict_knowledge_only,
            ),
            GenerateSampleLessonOutput,
            timeout=AI_LESSON_TIMEOUT,
        )

        # Format the sample lesson through the component agent
        self._set_progress(45, "Formatting sample lesson components...")
        sample_ctx = ComponentContext(
            topic=input.topic,
            audience=input.audience,
            course_goal=outcomes.goal.goal_statement,
            section_title=representative_section.title,
            section_description=representative_section.description,
            section_outcomes=[
                so.description
                for so in section_outcomes.section_outcomes.get(representative_section.title, [])
            ],
            is_first_section=True,
            is_last_section=len(structure.sections) == 1,
            next_section_title=(
                structure.sections[1].title if len(structure.sections) > 1 else None
            ),
            lesson_title=lesson_result.lesson.title,
            lesson_objective=lesson_result.lesson.objective.description,
            is_first_lesson=True,
            is_last_lesson=True,  # Only lesson in the sample
            lesson_number=1,
            total_lessons_in_section=1,
            next_lesson_title=None,
            block_sequence=[b.type for b in lesson_result.lesson.sample_blocks],
            interaction_rules=[
                "Follow the block sequence from the sample lesson",
                "Include at least one quiz",
                "Open with a hook or context-setting introduction",
            ],
            outcomes_to_introduce=[],
            outcomes_to_reinforce=[],
            recently_covered=[],
            resource_hints=resource_hints,
            rag_context=rag_context,
            strict_knowledge_only=input.strict_knowledge_only,
        )

        sample_components_result: GenerateComponentsOutput = await self._run_ai_activity(
            "generate_lesson_components",
            GenerateComponentsInput(api_key=api_key, context=sample_ctx),
            GenerateComponentsOutput,
            timeout=AI_LESSON_TIMEOUT,
        )

        # Inject missing reference links into sample lesson
        if resource_hints:
            ref_urls = [h for h in resource_hints if h.media_type == "reference"]
            if ref_urls:
                _inject_missing_reference_links(sample_components_result.components, ref_urls)

        # Build preview components for the combined review
        preview_components = self._components_to_preview(sample_components_result.components)

        # Extract template from lesson
        self._set_progress(50, "Extracting lesson pattern...")
        template_result: ExtractTemplateOutput = await self._run_ai_activity(
            "extract_lesson_template",
            ExtractTemplateInput(api_key=api_key, lesson=lesson_result.lesson),
            ExtractTemplateOutput,
        )

        return lesson_result.lesson, template_result.template, preview_components

    # -------------------------------------------------------------------
    # Combined review data builder
    # -------------------------------------------------------------------

    def _build_combined_review_data(
        self,
        analysis: CourseAnalysis,
        knowledge_coverage: dict | None,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
        sample_lesson: Lesson,
        preview_components: list,
    ) -> dict:
        """Build the combined review JSON for the single approval gate."""
        # Compute lesson preview for structure
        lesson_preview = self._compute_lesson_preview(structure, section_outcomes)

        # Build sample lesson data
        sample_data = sample_lesson.model_dump()
        sample_data["components"] = preview_components

        combined = {
            "analysis": {
                "purpose_statement": analysis.purpose_statement,
                "learner_assumptions": analysis.learner_assumptions,
                "constraints": analysis.constraints,
            },
            "knowledge_coverage": knowledge_coverage,
            "outcomes": {
                "behavior_change": outcomes.behavior_change,
                "goal": outcomes.goal.model_dump(),
                "outcomes": [o.model_dump() for o in outcomes.outcomes],
            },
            "structure": {
                "sections": lesson_preview["sections"],
                "total_lessons": lesson_preview["total_lessons"],
            },
            "sample_lesson": sample_data,
        }

        return combined

    def _compute_lesson_preview(
        self,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
    ) -> dict:
        """Compute deterministic lesson titles/objectives from section outcomes.

        Replicates the algorithm used in _generate_all_components so users
        can see the lesson breakdown before approving the structure.
        """
        enriched_sections = []
        total_lessons = 0
        for section in structure.sections:
            section_sos = section_outcomes.section_outcomes.get(section.title, [])
            num_lessons = max(1, min(3, len(section_sos)))
            total_lessons += num_lessons
            lessons = []
            for i in range(num_lessons):
                objective = (
                    section_sos[i].description
                    if i < len(section_sos)
                    else f"Apply {section.title} concepts"
                )
                title = (
                    f"{section.title}: Part {i + 1}"
                    if num_lessons > 1
                    else section.title
                )
                lessons.append({"title": title, "objective": objective})
            enriched_sections.append({**section.model_dump(), "lessons": lessons})
        return {"sections": enriched_sections, "total_lessons": total_lessons}

    # -------------------------------------------------------------------
    # Auto-run QA (informational, no approval gate)
    # -------------------------------------------------------------------

    async def _run_qa(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        all_lesson_components: dict[str, dict[str, LessonComponents]],
        total_components: int,
    ) -> None:
        """Run course-level QA checks. Informational only — no approval gate."""
        self._set_progress(88, "Running quality checks...")
        await self._update_job(input, "PROCESSING", 88, "Running quality checks")

        all_lesson_titles = [
            title
            for section_lessons in all_lesson_components.values()
            for title in section_lessons
        ]

        qa_result: RunQAOutput = await self._run_ai_activity(
            "run_course_qa",
            RunQAInput(
                api_key=api_key,
                outcomes=outcomes,
                structure=structure,
                lesson_titles=all_lesson_titles,
                total_blocks=total_components,
            ),
            RunQAOutput,
        )

        self._artifacts.qa = qa_result.qa

        log.info(
            "qa_complete",
            all_outcomes_covered=qa_result.qa.all_outcomes_covered,
            has_issues=qa_result.qa.has_issues,
            total_sections=len(structure.sections),
            total_lessons=len(all_lesson_titles),
            total_blocks=total_components,
        )

    # -------------------------------------------------------------------
    # Component Generation Pipeline
    # -------------------------------------------------------------------

    async def _generate_all_components(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
        sample_lesson: Lesson,
        template: LessonTemplate,
    ) -> dict[str, dict[str, LessonComponents]]:
        """Generate proto-compliant components for all lessons.

        Processes sections sequentially (for outcome tracking) but
        lessons within a section in parallel.

        Returns: {section_title: {lesson_title: LessonComponents}}
        """
        self._set_progress(60, "Generating lesson components...")
        await self._update_job(input, "PROCESSING", 60, "Generating lesson components")

        # Parse multimedia resources from user context
        resource_hints: list[ResourceHint] = []
        if input.use_context:
            parser = URLResourceParser()
            resource_hints = parser.parse(input.use_context)

        tracker = OutcomeTracker.from_course(outcomes, structure)
        all_components: dict[str, dict[str, LessonComponents]] = {}
        representative_section = structure.sections[0].title

        # Count total lessons for progress tracking
        total_lessons = 0
        for section in structure.sections:
            section_sos = section_outcomes.section_outcomes.get(section.title, [])
            total_lessons += max(1, min(3, len(section_sos)))
        completed_lessons = 0

        assert self._orchestrator is not None

        # Cross-section content digest for dedup
        accumulated_content_digest: list[str] = []

        for s_idx, section in enumerate(structure.sections):
            section_sos = section_outcomes.section_outcomes.get(section.title, [])
            num_lessons = max(1, min(3, len(section_sos)))

            is_first_section = s_idx == 0
            is_last_section = s_idx == len(structure.sections) - 1
            next_section_title = (
                structure.sections[s_idx + 1].title
                if s_idx < len(structure.sections) - 1
                else None
            )

            # Snapshot tracker state for this section
            pending = tracker.pending_for_section(s_idx, section.mapped_outcomes)
            reinforce = tracker.reinforcement_candidates(s_idx)
            recent = tracker.recently_covered()

            # Pre-compute lesson titles so we can reference the next lesson
            lesson_metas: list[tuple[str, str]] = []  # (title, objective)
            for i in range(num_lessons):
                objective = (
                    section_sos[i].description
                    if i < len(section_sos)
                    else f"Apply {section.title} concepts"
                )
                lesson_title = (
                    f"{section.title}: Part {i + 1}"
                    if num_lessons > 1
                    else section.title
                )
                is_sample = section.title == representative_section and i == 0
                if is_sample:
                    lesson_title = sample_lesson.title
                    objective = sample_lesson.objective.description
                lesson_metas.append((lesson_title, objective))

            # Per-section research via orchestrator (internal + web, synthesized)
            section_research = await self._orchestrator.research(
                f"{section.title} {section.description}", api_key,
            )
            rag_context_text = section_research.formatted_context
            source_references = section_research.source_references

            # Prepend synthesized research text for better context
            if section_research.research_text:
                rag_context_text = (
                    f"## Synthesized Research\n{section_research.research_text}\n\n"
                    f"{rag_context_text}"
                )

            # Build component contexts for each lesson in this section
            lesson_contexts: list[GenerateComponentsInput] = []
            for i, (lesson_title, objective) in enumerate(lesson_metas):
                next_lesson_title = (
                    lesson_metas[i + 1][0] if i < num_lessons - 1 else None
                )

                ctx = ComponentContext(
                    topic=input.topic,
                    audience=input.audience,
                    course_goal=outcomes.goal.goal_statement,
                    section_title=section.title,
                    section_description=section.description,
                    section_outcomes=[so.description for so in section_sos],
                    is_first_section=is_first_section,
                    is_last_section=is_last_section,
                    next_section_title=next_section_title,
                    lesson_title=lesson_title,
                    lesson_objective=objective,
                    is_first_lesson=(i == 0),
                    is_last_lesson=(i == num_lessons - 1),
                    lesson_number=i + 1,
                    total_lessons_in_section=num_lessons,
                    next_lesson_title=next_lesson_title,
                    block_sequence=template.block_sequence,
                    interaction_rules=template.interaction_rules,
                    outcomes_to_introduce=pending,
                    outcomes_to_reinforce=reinforce,
                    recently_covered=recent,
                    prior_content_digest=list(accumulated_content_digest),
                    resource_hints=resource_hints,
                    rag_context=rag_context_text,
                    source_references=source_references,
                    strict_knowledge_only=input.strict_knowledge_only,
                )
                lesson_contexts.append(
                    GenerateComponentsInput(api_key=api_key, context=ctx)
                )

            # Generate lessons in parallel batches within section
            section_results: dict[str, LessonComponents] = {}
            for batch_start in range(0, len(lesson_contexts), LESSON_BATCH_SIZE):
                batch = lesson_contexts[batch_start:batch_start + LESSON_BATCH_SIZE]

                tasks = [
                    self._run_ai_activity(
                        "generate_lesson_components", ci, GenerateComponentsOutput,
                        timeout=AI_LESSON_TIMEOUT,
                    )
                    for ci in batch
                ]
                results: list[GenerateComponentsOutput] = await asyncio.gather(*tasks)

                for r in results:
                    section_results[r.lesson_title] = r.components

                completed_lessons += len(batch)
                progress = 60 + int((completed_lessons / total_lessons) * 22)
                self._set_progress(progress, f"Generated {completed_lessons}/{total_lessons} lessons")
                await self._update_job(
                    input, "PROCESSING", progress,
                    f"Generated {completed_lessons}/{total_lessons} lessons",
                )

            # Strip hallucinated multimedia URLs (only allow URLs from resource hints)
            if resource_hints:
                allowed_urls = {h.url for h in resource_hints}
                for lc in section_results.values():
                    lc.components = [
                        c for c in lc.components
                        if not (hasattr(c, "mediaType") and c.url not in allowed_urls)
                    ]

            # Inject missing reference links into first lesson of this section
            if resource_hints:
                ref_urls = [h for h in resource_hints if h.media_type == "reference"]
                if ref_urls and section_results:
                    first_lesson_components = next(iter(section_results.values()))
                    _inject_missing_reference_links(first_lesson_components, ref_urls)

            # Update tracker after all lessons in section
            for title, lc in section_results.items():
                tracker.mark_covered(lc.outcomes_covered, s_idx, title)
                accumulated_content_digest.extend(lc.content_digest())

            # Run section QA judge
            section_outcome_strs = [so.description for so in section_sos]
            qa_result: ReviewSectionOutput = await self._run_ai_activity(
                "review_section_components",
                ReviewSectionInput(
                    api_key=api_key,
                    section_title=section.title,
                    section_description=section.description,
                    section_outcomes=section_outcome_strs,
                    lesson_components=section_results,
                    course_goal=outcomes.goal.goal_statement,
                    prior_content_digest=list(accumulated_content_digest),
                ),
                ReviewSectionOutput,
            )

            # Apply removals from QA
            if qa_result.qa.component_ids_to_remove:
                for comp_id in qa_result.qa.component_ids_to_remove:
                    # comp_id format: "lesson_title:index"
                    parts = comp_id.rsplit(":", 1)
                    if len(parts) == 2:
                        lt, idx_str = parts
                        try:
                            idx = int(idx_str)
                            if lt in section_results and 0 <= idx < len(section_results[lt].components):
                                section_results[lt].components.pop(idx)
                        except (ValueError, IndexError):
                            pass

            all_components[section.title] = section_results
            self._section_source_refs[section.title] = source_references

        log.info(
            "component_generation_complete",
            outcome_summary=tracker.summary(),
            total_sections=len(all_components),
        )

        return all_components

    # -------------------------------------------------------------------
    # S3 Content Builder
    # -------------------------------------------------------------------

    def _build_s3_content_v2(
        self,
        input: CourseCreationInput,
        analysis: CourseAnalysis,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
        all_lesson_components: dict[str, dict[str, LessonComponents]],
    ) -> dict:
        """Transform validated artifacts into S3CourseContent format for the editor.

        Components are already proto-compliant — serialization is just model_dump().
        """
        now = datetime.now(timezone.utc).isoformat()

        s3_sections: list[dict] = []
        all_lessons: list[dict] = []

        for s_idx, section in enumerate(structure.sections):
            section_id = str(uuid.uuid4())
            section_lessons_meta: list[dict] = []

            section_lesson_components = all_lesson_components.get(section.title, {})

            for lesson_title, lc in section_lesson_components.items():
                lesson_id = str(uuid.uuid4())
                outline_lesson_id = str(uuid.uuid4())

                # Find description from section outcomes
                section_sos = section_outcomes.section_outcomes.get(section.title, [])
                description = section_sos[0].description if section_sos else lesson_title

                section_lessons_meta.append({
                    "id": outline_lesson_id,
                    "title": lesson_title,
                    "description": description,
                    "position": len(section_lessons_meta) + 1,
                })

                # Components are already proto-compliant — direct serialization
                # S3 content.json uses string type names (Go LessonComponent.Type is string)
                section_refs = self._section_source_refs.get(section.title, [])
                generation_context = (
                    f"Generated for '{description}' targeting {input.audience}"
                )
                components = []
                component_provenances = []
                for i, comp in enumerate(lc.components):
                    # Get content fields (everything except 'type' and 'source_refs')
                    exclude_fields = {"type", "source_refs"}
                    comp_type_str = comp.type if isinstance(comp.type, str) else "text"

                    # For text components, serialize paragraphs as textHtml for backward compat
                    if comp_type_str == "text" and hasattr(comp, "paragraphs"):
                        content_data = {"textHtml": self._strip_source_markers(comp.textHtml)}
                        exclude_fields.add("paragraphs")
                    else:
                        content_data = comp.model_dump(exclude=exclude_fields)

                    # Multimedia: rename mediaType → type for proto/frontend compatibility
                    if comp_type_str == "multimedia" and "mediaType" in content_data:
                        content_data["type"] = content_data.pop("mediaType")

                    # Strip [Source N] markers from all string content fields
                    for key in ("html", "text", "title", "description", "explanation"):
                        if key in content_data and isinstance(content_data[key], str):
                            content_data[key] = self._strip_source_markers(content_data[key])
                    if "items" in content_data and isinstance(content_data["items"], list):
                        for item in content_data["items"]:
                            if isinstance(item, dict):
                                for key in ("text", "description"):
                                    if key in item and isinstance(item[key], str):
                                        item[key] = self._strip_source_markers(item[key])

                    # Resolve provenance from source_refs
                    provenance = resolve_component_provenance(
                        comp, section_refs, "gemini-2.5-flash", generation_context,
                    )
                    component_provenances.append(provenance)

                    components.append({
                        "id": str(uuid.uuid4()),
                        "type": comp_type_str,
                        "order": i + 1,
                        "contentJson": content_data,
                        "learningObjectiveIds": [],
                        "createdAt": now,
                        "updatedAt": now,
                        "provenance": provenance,
                    })

                # Compute aggregate lesson provenance
                aggregate_provenance = resolve_lesson_provenance(component_provenances)

                all_lessons.append({
                    "id": lesson_id,
                    "sectionId": section_id,
                    "outlineLessonId": outline_lesson_id,
                    "title": lesson_title,
                    "components": components,
                    "generatedAt": now,
                    "aggregateProvenance": aggregate_provenance,
                })

            s3_sections.append({
                "id": section_id,
                "title": section.title,
                "description": section.description,
                "position": s_idx + 1,
                "lessons": section_lessons_meta,
            })

        # Build outcome text for settings
        outcome_text = "; ".join(
            f"{o.verb} {o.object}" for o in outcomes.outcomes
        )

        return {
            "settings": {
                "title": input.topic,
                "desiredOutcome": outcome_text,
                "dataSource": "open-web",
            },
            "personas": [],
            "learningObjectives": [
                {
                    "id": str(uuid.uuid4()),
                    "text": f"{o.verb} {o.object} ({o.condition})",
                }
                for o in outcomes.outcomes
            ],
            "assessmentSettings": {
                "enableEmbeddedKnowledgeChecks": False,
                "enableFinalExam": False,
            },
            "content": {
                "sections": s3_sections,
                "courseBlocks": [],
            },
            "generatedLessons": all_lessons,
        }

    @staticmethod
    def _components_to_preview(lc: LessonComponents) -> list[dict]:
        """Convert LessonComponents to preview format for the wizard step data.

        Returns a list of dicts with id, type (int), order, and contentJson
        matching the proto LessonComponent structure for frontend rendering.
        """
        preview = []
        for i, comp in enumerate(lc.components):
            exclude_fields = {"type", "source_refs"}
            comp_type_str = comp.type if isinstance(comp.type, str) else "text"
            comp_type_int = COMPONENT_TYPE_MAP.get(comp_type_str, 1)

            # For text components, flatten paragraphs back to textHtml for preview
            if comp_type_str == "text" and hasattr(comp, "paragraphs"):
                content_data = {"textHtml": comp.textHtml}
            else:
                content_data = comp.model_dump(exclude=exclude_fields)

            # Multimedia: rename mediaType → type for proto/frontend compatibility
            if comp_type_str == "multimedia" and "mediaType" in content_data:
                content_data["type"] = content_data.pop("mediaType")

            preview.append({
                "id": str(uuid.uuid4()),
                "type": comp_type_int,
                "order": i + 1,
                "contentJson": json.dumps(content_data),
            })
        return preview

    @staticmethod
    def _strip_source_markers(text: str) -> str:
        """Remove [Source N], (Source N), and bare Source N from generated text."""
        text = re.sub(r'\[(?i:source)\s+\d+\]', '', text)
        text = re.sub(r'\((?i:source)\s+\d+\)', '', text)
        text = re.sub(r'(?<!\w)(?i:source)\s+\d+(?!\w)', '', text)
        text = re.sub(r'\s{2,}', ' ', text)
        text = re.sub(r'\s+([.,;:!?])', r'\1', text)
        return text.strip()

    # -------------------------------------------------------------------
    # Knowledge Coverage
    # -------------------------------------------------------------------

    def _build_knowledge_coverage(self) -> dict | None:
        """Build knowledge coverage metadata from cached research."""
        if not self._course_research:
            return None
        research = self._course_research
        if not research.gaps and not research.key_findings:
            return None

        gap_count = len(research.gaps)
        finding_count = len(research.key_findings)

        if gap_count == 0:
            coverage = "comprehensive"
        elif gap_count <= 2 and finding_count >= gap_count:
            coverage = "moderate"
        else:
            coverage = "limited"

        return {
            "gaps": research.gaps,
            "key_findings": research.key_findings,
            "source_count": len(research.chunks),
            "coverage_assessment": coverage,
            "recommended_format": "micro_course" if coverage == "limited" else "full_course",
        }

    # -------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------

    def _set_progress(self, percent: int, message: str) -> None:
        self._progress = percent
        self._progress_message = message

    async def _publish_and_wait(
        self,
        input: CourseCreationInput,
        step: str,
        data_json: str,
        progress: int,
    ) -> StepApproval:
        """Set internal state for query, then wait for user approval update."""
        self._current_step = step
        self._step_data = data_json
        self._status = "awaiting_approval"
        self._progress = progress
        self._progress_message = f"Waiting for approval: {step}"
        self._approval = None

        await self._update_job(
            input, "AWAITING_APPROVAL", progress,
            f"Waiting for approval: {step}",
        )

        await workflow.wait_condition(lambda: self._approval is not None)

        approval = self._approval
        assert approval is not None
        self._approval = None
        self._status = "processing"
        self._step_data = ""
        return approval

    async def _decrypt_api_key(self, tenant_id: str) -> str:
        result = await workflow.execute_activity(
            "DecryptAPIKey",
            {"tenant_id": tenant_id},
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=RetryPolicy(**GO_RETRY),
        )
        return result["api_key"]

    async def _update_job(
        self,
        input: CourseCreationInput,
        status: str,
        progress: int,
        message: str,
    ) -> None:
        await workflow.execute_activity(
            "UpdateJobStatus",
            {
                "job_id": input.job_id,
                "status": status,
                "progress_percent": progress,
                "progress_message": message,
            },
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=RetryPolicy(**GO_RETRY),
        )

    async def _write_course_content(
        self, tenant_id: str, course_id: str, content: dict,
    ) -> None:
        await workflow.execute_activity(
            "WriteCourseContent",
            {
                "tenant_id": tenant_id,
                "course_id": course_id,
                "content": content,
            },
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=RetryPolicy(**GO_RETRY),
        )

    async def _run_ai_activity(
        self,
        activity_name: str,
        input_data: object,
        output_type: type,
        timeout: timedelta = AI_SHORT_TIMEOUT,
    ) -> object:
        return await workflow.execute_activity(
            activity_name,
            input_data,
            task_queue=AI_TASKS,
            start_to_close_timeout=timeout,
            heartbeat_timeout=AI_HEARTBEAT,
            retry_policy=RetryPolicy(**AI_RETRY),
            result_type=output_type,
        )
