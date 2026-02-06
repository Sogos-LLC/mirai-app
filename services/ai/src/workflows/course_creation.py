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
    from src.activities.course_design import (
        ExpandLessonInput,
        ExpandLessonOutput,
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
    from src.models.course_design import (
        CourseAnalysis,
        CourseOutcomes,
        CourseStructure,
        ExpandedLesson,
        Lesson,
        LessonTemplate,
        SectionOutcomes,
    )
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
        # HIDDEN: Expansion Pipeline (between Steps 4 and 5)
        # =============================================================

        expanded_lessons = await self._expand_all_lessons(
            api_key, input, outcomes, structure, section_outcomes, template,
        )

        # =============================================================
        # STEP 5: Final Review → QA + Export
        # =============================================================

        await self._step_final_review(
            api_key, input, outcomes, structure, sample_lesson, expanded_lessons,
        )

        # =============================================================
        # FINALIZE: Transform artifacts into S3CourseContent format
        # =============================================================

        course_content = self._build_s3_content(
            input, analysis, outcomes, structure,
            section_outcomes, sample_lesson, expanded_lessons,
        )
        await self._write_course_content(input.tenant_id, input.course_id, course_content)

        self._status = "completed"
        self._progress = 100
        self._progress_message = "Course creation complete"
        await self._update_job(input, "COMPLETED", 100, "Course creation complete")

        await workflow.wait_condition(workflow.all_handlers_finished)

        total_lessons = 1 + len(expanded_lessons)  # sample + expanded
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

        lesson_result: GenerateSampleLessonOutput = await self._run_ai_activity(
            "generate_sample_lesson",
            GenerateSampleLessonInput(
                api_key=api_key,
                topic=input.topic,
                audience=input.audience,
                course_goal=outcomes.goal.goal_statement,
                section_title=representative_section.title,
                section_outcomes=section_outcomes,
            ),
            GenerateSampleLessonOutput,
            timeout=AI_LESSON_TIMEOUT,
        )

        # Present to user for approval (user can edit tone/depth)
        approval = await self._publish_and_wait(
            input, "sample_lesson",
            json.dumps(lesson_result.lesson.model_dump()),
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
                ),
                GenerateSampleLessonOutput,
                timeout=AI_LESSON_TIMEOUT,
            )
            approval = await self._publish_and_wait(
                input, "sample_lesson",
                json.dumps(lesson_result.lesson.model_dump()),
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
    # Hidden: Expansion Pipeline
    # -------------------------------------------------------------------

    async def _expand_all_lessons(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
        template: LessonTemplate,
    ) -> list[ExpandedLesson]:
        """Expand remaining lessons using the approved template. Runs between Steps 4 and 5."""
        self._set_progress(60, "Generating remaining lessons...")
        await self._update_job(input, "PROCESSING", 60, "Generating remaining lessons")

        # Build list of lessons to generate (skip sample lesson's section first lesson)
        lesson_inputs: list[ExpandLessonInput] = []
        representative_section = structure.sections[0].title

        for section in structure.sections:
            # Get section outcomes for this section
            section_sos = section_outcomes.section_outcomes.get(section.title, [])
            # Generate 1-3 lessons per section based on outcome count
            num_lessons = max(1, min(3, len(section_sos)))

            for i in range(num_lessons):
                # Skip the sample lesson slot (first lesson of first section)
                if section.title == representative_section and i == 0:
                    continue

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

                lesson_inputs.append(ExpandLessonInput(
                    api_key=api_key,
                    topic=input.topic,
                    audience=input.audience,
                    course_goal=outcomes.goal.goal_statement,
                    section_title=section.title,
                    lesson_title=lesson_title,
                    lesson_objective=objective,
                    template=template,
                ))

        if not lesson_inputs:
            return []

        # Generate in parallel batches
        all_lessons: list[ExpandedLesson] = []
        total = len(lesson_inputs)

        for batch_start in range(0, total, LESSON_BATCH_SIZE):
            batch = lesson_inputs[batch_start:batch_start + LESSON_BATCH_SIZE]

            tasks = [
                self._run_ai_activity(
                    "expand_lesson", li, ExpandLessonOutput,
                    timeout=AI_LESSON_TIMEOUT,
                )
                for li in batch
            ]
            results = await asyncio.gather(*tasks)

            for r in results:
                all_lessons.append(r.lesson)

            completed = len(all_lessons)
            progress = 60 + int((completed / total) * 25)
            self._set_progress(progress, f"Generated {completed}/{total} lessons")
            await self._update_job(
                input, "PROCESSING", progress,
                f"Generated {completed}/{total} lessons",
            )

        self._artifacts.expanded_lessons = all_lessons
        return all_lessons

    # -------------------------------------------------------------------
    # Step 5: Final Review
    # -------------------------------------------------------------------

    async def _step_final_review(
        self,
        api_key: str,
        input: CourseCreationInput,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        sample_lesson: Lesson,
        expanded_lessons: list[ExpandedLesson],
    ) -> None:
        self._set_progress(88, "Running quality checks...")
        await self._update_job(input, "PROCESSING", 88, "Running quality checks")

        all_lesson_titles = [sample_lesson.title] + [l.title for l in expanded_lessons]
        total_blocks = (
            len(sample_lesson.sample_blocks)
            + sum(len(l.content_blocks) for l in expanded_lessons)
        )

        qa_result: RunQAOutput = await self._run_ai_activity(
            "run_course_qa",
            RunQAInput(
                api_key=api_key,
                outcomes=outcomes,
                structure=structure,
                lesson_titles=all_lesson_titles,
                total_blocks=total_blocks,
            ),
            RunQAOutput,
        )

        self._artifacts.qa = qa_result.qa

        # Present QA results + summary for final approval
        qa_summary = {
            "qa": qa_result.qa.model_dump(),
            "total_sections": len(structure.sections),
            "total_lessons": len(all_lesson_titles),
            "total_blocks": total_blocks,
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

    def _build_s3_content(
        self,
        input: CourseCreationInput,
        analysis: CourseAnalysis,
        outcomes: CourseOutcomes,
        structure: CourseStructure,
        section_outcomes: SectionOutcomes,
        sample_lesson: Lesson,
        expanded_lessons: list[ExpandedLesson],
    ) -> dict:
        """Transform validated artifacts into S3CourseContent format for the editor."""
        now = datetime.now(timezone.utc).isoformat()

        # Build sections with IDs and lesson slots
        s3_sections: list[dict] = []
        all_lessons: list[dict] = []

        for s_idx, section in enumerate(structure.sections):
            section_id = str(uuid.uuid4())

            # Collect lessons belonging to this section
            section_lessons_meta: list[dict] = []

            # Check if sample lesson belongs to this section
            if sample_lesson.section_title == section.title:
                lesson_id = str(uuid.uuid4())
                outline_lesson_id = str(uuid.uuid4())
                section_lessons_meta.append({
                    "id": outline_lesson_id,
                    "title": sample_lesson.title,
                    "description": sample_lesson.objective.description,
                    "position": len(section_lessons_meta) + 1,
                })
                all_lessons.append(self._lesson_to_s3(
                    lesson_id, section_id, outline_lesson_id,
                    sample_lesson.title, sample_lesson.sample_blocks, now,
                ))

            # Add expanded lessons for this section
            for exp in expanded_lessons:
                if exp.section_title == section.title:
                    lesson_id = str(uuid.uuid4())
                    outline_lesson_id = str(uuid.uuid4())
                    section_lessons_meta.append({
                        "id": outline_lesson_id,
                        "title": exp.title,
                        "description": exp.objective.description,
                        "position": len(section_lessons_meta) + 1,
                    })
                    all_lessons.append(self._lesson_to_s3(
                        lesson_id, section_id, outline_lesson_id,
                        exp.title, exp.content_blocks, now,
                    ))

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
    def _lesson_to_s3(
        lesson_id: str,
        section_id: str,
        outline_lesson_id: str,
        title: str,
        blocks: list,
        now: str,
    ) -> dict:
        """Convert lesson blocks into S3 GeneratedLesson format."""
        components = []
        for i, block in enumerate(blocks):
            block_type = block.type if hasattr(block, "type") else block.get("type", "text")
            content = block.content if hasattr(block, "content") else block.get("content", "")
            heading = block.heading if hasattr(block, "heading") else block.get("heading", "")

            # Build contentJson based on block type
            if block_type == "heading":
                content_json = {"text": heading or content, "level": 2}
            elif block_type == "image":
                content_json = {"prompt": content, "alt": heading}
            elif block_type == "quiz":
                content_json = {"question": content, "type": "multiple_choice"}
            elif block_type == "list":
                content_json = {"items": content.split("\n"), "ordered": False}
            else:
                # text, callout, activity, code, etc.
                content_json = {"text": content}

            components.append({
                "id": str(uuid.uuid4()),
                "type": block_type,
                "order": i + 1,
                "contentJson": content_json,
                "learningObjectiveIds": [],
                "createdAt": now,
                "updatedAt": now,
            })

        return {
            "id": lesson_id,
            "sectionId": section_id,
            "outlineLessonId": outline_lesson_id,
            "title": title,
            "components": components,
            "generatedAt": now,
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
