"""Unified course creation workflow — 5-step instructional design with validated artifacts.

Control flow:
  Intent → Analysis → Approval
  Goal → Outcomes → Approval
  Outcomes → Structure → Approval (hidden: section outcomes)
  Structure → Sample Lesson → Approval (hidden: template extraction)
  Lesson Template → Full Course → QA → Approval → Export

Each arrow is a Pydantic validated boundary.
Hidden steps skip the approval gate.
Validation failures trigger regeneration, not user prompts.

AI work is done in Python activities on ai-tasks queue.
Infrastructure (DB, MinIO) is done via Go activities on go-tasks queue.
"""

import asyncio
import json
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
        WebSource,
        format_source_context,
        resolve_component_provenance,
        resolve_lesson_provenance,
    )
    from src.models.component_content import (
        COMPONENT_TYPE_MAP,
        LessonComponents,
    )
    from src.models.resource_hint import ResourceHint
    from src.services.resource_parser import URLResourceParser
    from src.models.course_design import (
        CourseAnalysis,
        CourseOutcomes,
        CourseStructure,
        Lesson,
        LessonTemplate,
        SectionOutcomes,
    )
    from src.models.knowledge import KnowledgeChunk
    from src.models.outcome_tracker import OutcomeTracker
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


@workflow.defn(sandboxed=False)
class CourseCreationWorkflow:
    """5-step instructional design workflow with update-based human-in-the-loop.

    Each step produces a validated Pydantic artifact.
    Artifacts are immutable once approved.
    """

    def __init__(self) -> None:
        self._approval: StepApproval | None = None
        self._current_step: str = ""
        self._status: str = "processing"
        self._step_data: str = ""
        self._progress: int = 0
        self._progress_message: str = ""
        self._artifacts = LockedArtifacts()
        self._web_sources: list[WebSource] = []
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
        """Execute the full 5-step course creation pipeline."""
        log.info("course_creation_started", job_id=input.job_id, topic=input.topic)

        self._status = "processing"
        self._progress = 0
        self._progress_message = "Starting course creation"
        await self._update_job(input, "PROCESSING", 0, "Starting course creation")

        # Decrypt API key (Go activity)
        api_key = await self._decrypt_api_key(input.tenant_id)

        # =============================================================
        # STEP 1: Define Intent → CourseAnalysis
        # =============================================================

        analysis = await self._step_intent_analysis(api_key, input)

        # =============================================================
        # STEP 2: Define Success → CourseOutcomes
        # =============================================================

        outcomes = await self._step_define_success(api_key, input, analysis)

        # =============================================================
        # STEP 3: Approve Structure → CourseStructure
        # =============================================================

        structure, section_outcomes = await self._step_approve_structure(
            api_key, input, outcomes,
        )

        # =============================================================
        # STEP 4: Approve Sample Lesson → Lesson pattern locked
        # =============================================================

        sample_lesson, template = await self._step_sample_lesson(
            api_key, input, outcomes, structure, section_outcomes,
        )

        # =============================================================
        # HIDDEN: Component Generation Pipeline (between Steps 4 and 5)
        # =============================================================

        all_lesson_components = await self._generate_all_components(
            api_key, input, outcomes, structure, section_outcomes,
            sample_lesson, template,
        )

        # =============================================================
        # STEP 5: Final Review → QA + Export
        # =============================================================

        total_components = sum(
            len(lc.components) for lcs in all_lesson_components.values()
            for lc in lcs.values()
        )
        await self._step_final_review_v2(
            api_key, input, outcomes, structure,
            all_lesson_components, total_components,
        )

        # =============================================================
        # FINALIZE: Transform artifacts into S3CourseContent format
        # =============================================================

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
    # Step 1: Intent Analysis
    # -------------------------------------------------------------------

    async def _step_intent_analysis(
        self, api_key: str, input: CourseCreationInput,
    ) -> CourseAnalysis:
        self._set_progress(5, "Analyzing course intent...")
        await self._update_job(input, "PROCESSING", 5, "Analyzing course intent")

        analysis_result: GenerateAnalysisOutput = await self._run_ai_activity(
            "generate_course_analysis",
            GenerateAnalysisInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                use_context=input.use_context,
                enable_web_research=input.enable_web_research,
            ),
            GenerateAnalysisOutput,
        )

        # Present to user for approval
        approval = await self._publish_and_wait(
            input, "intent_analysis",
            json.dumps(analysis_result.analysis.model_dump()),
            10,
        )

        if approval and not approval.approved and approval.feedback:
            # Regenerate with feedback
            analysis_result = await self._run_ai_activity(
                "generate_course_analysis",
                GenerateAnalysisInput(
                    api_key=api_key,
                    topic=input.topic,
                    audience=input.audience,
                    use_context=input.use_context + f"\n\nFEEDBACK: {approval.feedback}",
                    enable_web_research=input.enable_web_research,
                ),
                GenerateAnalysisOutput,
            )
            # Re-present for approval
            approval = await self._publish_and_wait(
                input, "intent_analysis",
                json.dumps(analysis_result.analysis.model_dump()),
                10,
            )

        # Apply user modifications if any
        analysis = analysis_result.analysis
        if approval and approval.modifications:
            data = analysis.model_dump()
            data.update(approval.modifications)
            analysis = CourseAnalysis(**data)

        # Capture web sources for provenance tracking
        if analysis_result.web_sources:
            self._web_sources = [
                WebSource(title=ws.title, url=ws.url, snippet=ws.snippet)
                for ws in analysis_result.web_sources
            ]

        self._artifacts.analysis = analysis
        return analysis

    # -------------------------------------------------------------------
    # Step 2: Define Success
    # -------------------------------------------------------------------

    async def _step_define_success(
        self, api_key: str, input: CourseCreationInput, analysis: CourseAnalysis,
    ) -> CourseOutcomes:
        self._set_progress(20, "Generating learning outcomes...")
        await self._update_job(input, "PROCESSING", 20, "Generating learning outcomes")

        outcomes_result: GenerateOutcomesOutput = await self._run_ai_activity(
            "generate_course_outcomes",
            GenerateOutcomesInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                purpose_statement=analysis.purpose_statement,
                learner_assumptions=analysis.learner_assumptions,
                constraints=analysis.constraints,
            ),
            GenerateOutcomesOutput,
        )

        # Present to user for approval
        approval = await self._publish_and_wait(
            input, "define_success",
            json.dumps(outcomes_result.outcomes.model_dump()),
            25,
        )

        if approval and not approval.approved and approval.feedback:
            outcomes_result = await self._run_ai_activity(
                "generate_course_outcomes",
                GenerateOutcomesInput(
                    api_key=api_key,
                    topic=input.topic,
                    audience=f"{input.audience}\n\nFEEDBACK: {approval.feedback}",
                    purpose_statement=analysis.purpose_statement,
                    learner_assumptions=analysis.learner_assumptions,
                    constraints=analysis.constraints,
                ),
                GenerateOutcomesOutput,
            )
            approval = await self._publish_and_wait(
                input, "define_success",
                json.dumps(outcomes_result.outcomes.model_dump()),
                25,
            )

        self._artifacts.outcomes = outcomes_result.outcomes
        return outcomes_result.outcomes

    # -------------------------------------------------------------------
    # Step 3: Approve Structure
    # -------------------------------------------------------------------

    async def _step_approve_structure(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
    ) -> tuple[CourseStructure, SectionOutcomes]:
        self._set_progress(35, "Designing course structure...")
        await self._update_job(input, "PROCESSING", 35, "Designing course structure")

        structure_result: GenerateStructureOutput = await self._run_ai_activity(
            "generate_course_structure",
            GenerateStructureInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                outcomes=outcomes,
            ),
            GenerateStructureOutput,
        )

        # Hidden: generate section outcomes before presenting
        self._set_progress(40, "Mapping section outcomes...")
        section_outcomes_result: GenerateSectionOutcomesOutput = await self._run_ai_activity(
            "generate_section_outcomes",
            GenerateSectionOutcomesInput(
                api_key=api_key,
                structure=structure_result.structure,
                outcomes=outcomes,
            ),
            GenerateSectionOutcomesOutput,
        )

        # User only sees the structure (section titles + mapped outcomes)
        approval = await self._publish_and_wait(
            input, "approve_structure",
            json.dumps(structure_result.structure.model_dump()),
            45,
        )

        if approval and not approval.approved and approval.feedback:
            structure_result = await self._run_ai_activity(
                "generate_course_structure",
                GenerateStructureInput(
                    api_key=api_key,
                    topic=input.topic,
                    audience=f"{input.audience}\n\nFEEDBACK: {approval.feedback}",
                    outcomes=outcomes,
                ),
                GenerateStructureOutput,
            )
            # Regenerate section outcomes for new structure
            section_outcomes_result = await self._run_ai_activity(
                "generate_section_outcomes",
                GenerateSectionOutcomesInput(
                    api_key=api_key,
                    structure=structure_result.structure,
                    outcomes=outcomes,
                ),
                GenerateSectionOutcomesOutput,
            )
            approval = await self._publish_and_wait(
                input, "approve_structure",
                json.dumps(structure_result.structure.model_dump()),
                45,
            )

        self._artifacts.structure = structure_result.structure
        self._artifacts.section_outcomes = section_outcomes_result.section_outcomes
        return structure_result.structure, section_outcomes_result.section_outcomes

    # -------------------------------------------------------------------
    # Step 4: Sample Lesson
    # -------------------------------------------------------------------

    async def _step_sample_lesson(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
    ) -> tuple[Lesson, LessonTemplate]:
        self._set_progress(50, "Generating sample lesson...")
        await self._update_job(input, "PROCESSING", 50, "Generating sample lesson")

        # Select the first section as representative
        representative_section = structure.sections[0]

        # Parse multimedia resources from user context for sample lesson
        resource_hints: list[ResourceHint] = []
        if input.use_context:
            parser = URLResourceParser()
            resource_hints = parser.parse(input.use_context)

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
            ),
            GenerateSampleLessonOutput,
            timeout=AI_LESSON_TIMEOUT,
        )

        # Format the sample lesson through the component agent
        self._set_progress(52, "Formatting sample lesson components...")
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
        )

        sample_components_result: GenerateComponentsOutput = await self._run_ai_activity(
            "generate_lesson_components",
            GenerateComponentsInput(api_key=api_key, context=sample_ctx),
            GenerateComponentsOutput,
            timeout=AI_LESSON_TIMEOUT,
        )

        # Build step data with both lesson metadata and rendered components
        sample_step_data = lesson_result.lesson.model_dump()
        sample_step_data["components"] = self._components_to_preview(
            sample_components_result.components,
        )

        # Present to user for approval (user can edit tone/depth)
        approval = await self._publish_and_wait(
            input, "sample_lesson",
            json.dumps(sample_step_data),
            55,
        )

        if approval and not approval.approved and approval.feedback:
            lesson_result = await self._run_ai_activity(
                "generate_sample_lesson",
                GenerateSampleLessonInput(
                    api_key=api_key,
                    topic=input.topic,
                    audience=f"{input.audience}\n\nFEEDBACK ON LESSON: {approval.feedback}",
                    course_goal=outcomes.goal.goal_statement,
                    section_title=representative_section.title,
                    section_outcomes=section_outcomes,
                    use_context=input.use_context,
                ),
                GenerateSampleLessonOutput,
                timeout=AI_LESSON_TIMEOUT,
            )
            # Re-format components
            sample_ctx.lesson_title = lesson_result.lesson.title
            sample_ctx.lesson_objective = lesson_result.lesson.objective.description
            sample_ctx.block_sequence = [b.type for b in lesson_result.lesson.sample_blocks]

            sample_components_result = await self._run_ai_activity(
                "generate_lesson_components",
                GenerateComponentsInput(api_key=api_key, context=sample_ctx),
                GenerateComponentsOutput,
                timeout=AI_LESSON_TIMEOUT,
            )
            sample_step_data = lesson_result.lesson.model_dump()
            sample_step_data["components"] = self._components_to_preview(
                sample_components_result.components,
            )
            approval = await self._publish_and_wait(
                input, "sample_lesson",
                json.dumps(sample_step_data),
                55,
            )

        lesson = lesson_result.lesson
        self._artifacts.sample_lesson = lesson

        # Hidden: extract template from approved lesson
        self._set_progress(58, "Extracting lesson pattern...")
        template_result: ExtractTemplateOutput = await self._run_ai_activity(
            "extract_lesson_template",
            ExtractTemplateInput(api_key=api_key, lesson=lesson),
            ExtractTemplateOutput,
        )

        self._artifacts.template = template_result.template
        return lesson, template_result.template

    # -------------------------------------------------------------------
    # Hidden: Component Generation Pipeline
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

        # Collect web sources from workflow state (captured in Step 1)
        web_sources = self._web_sources

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

            # RAG search for section context (if knowledge sources are selected)
            rag_chunks: list[KnowledgeChunk] = []
            if input.rag_filters:
                try:
                    from src.activities.knowledge import SearchKnowledgeInput, SearchKnowledgeOutput
                    search_query = f"{section.title} {section.description}"
                    search_result: SearchKnowledgeOutput = await self._run_ai_activity(
                        "search_knowledge",
                        SearchKnowledgeInput(
                            query=search_query,
                            api_key=api_key,
                            filters=input.rag_filters,
                            top_k=10,
                        ),
                        SearchKnowledgeOutput,
                    )
                    rag_chunks = search_result.chunks
                except Exception:
                    log.warning("rag_search_failed", section=section.title, exc_info=True)

            # Format source context for all lessons in this section
            rag_context_text, source_references = format_source_context(
                rag_chunks, web_sources,
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
                    resource_hints=resource_hints,
                    rag_context=rag_context_text,
                    source_references=source_references,
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

            # Update tracker after all lessons in section
            for title, lc in section_results.items():
                tracker.mark_covered(lc.outcomes_covered, s_idx, title)

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
    # Step 5: Final Review
    # -------------------------------------------------------------------

    async def _step_final_review_v2(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        all_lesson_components: dict[str, dict[str, LessonComponents]],
        total_components: int,
    ) -> None:
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

        # Present QA results + summary for final approval
        qa_summary = {
            "qa": qa_result.qa.model_dump(),
            "total_sections": len(structure.sections),
            "total_lessons": len(all_lesson_titles),
            "total_blocks": total_components,
            "all_outcomes_covered": qa_result.qa.all_outcomes_covered,
            "has_issues": qa_result.qa.has_issues,
        }

        approval = await self._publish_and_wait(
            input, "final_review",
            json.dumps(qa_summary),
            92,
        )

        # If rejected, user is just noting issues — we still proceed
        # (the QA is informational, not blocking)

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
                        content_data = {"textHtml": comp.textHtml}
                        exclude_fields.add("paragraphs")
                    else:
                        content_data = comp.model_dump(exclude=exclude_fields)

                    # Multimedia: rename mediaType → type for proto/frontend compatibility
                    if comp_type_str == "multimedia" and "mediaType" in content_data:
                        content_data["type"] = content_data.pop("mediaType")

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
