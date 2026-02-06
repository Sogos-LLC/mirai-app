"""Unified course creation workflow — wizard through lessons in one Temporal workflow.

Hierarchical decomposition:
  1. Wizard Phase (parallel where possible): title+outcomes → SME → audience → tone
  2. (Optional) Planning Phase: document analysis → course plan
  3. Outline Phase: generate outline → human approval
  4. Lesson Phase (parallel batches): lessons generated concurrently in batches of 3
  5. Structural Elements Phase: section intros, summaries, conclusion
  6. Finalize: write course content to MinIO

AI work is done in Python activities on ai-tasks queue.
Infrastructure (DB, MinIO) is done via Go activities on go-tasks queue.
"""

import asyncio
import json
from datetime import timedelta

import structlog
from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError

with workflow.unsafe.imports_passed_through():
    from src.activities.generation import (
        GenerateLessonInput,
        GenerateLessonOutput,
        GenerateOutlineInput,
        GenerateOutlineOutput,
        GenerateStructuralElementsInput,
        GenerateStructuralElementsOutput,
    )
    from src.activities.planning import AnalyzeDocumentInput, AnalyzeDocumentOutput
    from src.activities.wizard import (
        GenerateAudiencePersonasInput,
        GenerateAudiencePersonasOutput,
        GenerateOutcomesInput,
        GenerateOutcomesOutput,
        GenerateSMEPersonasInput,
        GenerateSMEPersonasOutput,
        GenerateTitleInput,
        GenerateTitleOutput,
        GenerateToneOptionsInput,
        GenerateToneOptionsOutput,
    )
    from src.models.outline import CourseOutline, OutlineSection
    from src.models.wizard import SMEPersona, AudiencePersona, ToneOption
    from src.workflows.types import (
        CourseCreationInput,
        CourseCreationOutput,
        StepApproval,
        WizardResult,
    )

log = structlog.get_logger()

# Task queues
GO_TASKS = "go-tasks"
AI_TASKS = "ai-tasks"

# Timeout configs
GO_TIMEOUT = timedelta(seconds=30)
AI_SHORT_TIMEOUT = timedelta(minutes=2)
AI_LONG_TIMEOUT = timedelta(minutes=5)
AI_LESSON_TIMEOUT = timedelta(minutes=15)
AI_HEARTBEAT = timedelta(minutes=3)

# Retry policies
GO_RETRY = {"maximum_attempts": 3}
AI_RETRY = {"maximum_attempts": 2}

# Lesson parallelism
LESSON_BATCH_SIZE = 3


@workflow.defn(sandboxed=False)
class CourseCreationWorkflow:
    """Unified course creation workflow with update-based human-in-the-loop."""

    def __init__(self) -> None:
        self._approval: StepApproval | None = None
        self._current_step: str = ""
        self._status: str = "processing"
        self._step_data: str = ""
        self._progress: int = 0
        self._progress_message: str = ""

    # ------------------------------------------------------------------
    # Query handler — lightweight, read-only snapshot of workflow state
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
    # Update handlers — synchronous round-trip for approvals/rejections
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

    @workflow.run
    async def run(self, input: CourseCreationInput) -> CourseCreationOutput:
        """Execute the full course creation pipeline."""
        log.info(
            "course_creation_started",
            job_id=input.job_id,
            course_name=input.course_name,
        )

        self._status = "processing"
        self._progress = 0
        self._progress_message = "Starting course creation"
        await self._update_job(input, "PROCESSING", 0, "Starting course creation")

        # 1. Decrypt API key (Go activity)
        api_key = await self._decrypt_api_key(input.tenant_id)

        # ---------------------------------------------------------------
        # WIZARD PHASE — parallel where possible
        # ---------------------------------------------------------------

        wizard_result = await self._run_wizard_phase(api_key, input)

        # Save wizard data to course content
        await self._write_course_content(
            input.tenant_id, input.course_id, {"wizard": wizard_result.model_dump()},
        )

        # ---------------------------------------------------------------
        # PLANNING PHASE (conditional: if knowledge sources selected)
        # ---------------------------------------------------------------

        course_plan_context = await self._run_planning_phase(
            api_key, input, wizard_result.improved_title, wizard_result.desired_outcomes,
        )

        # ---------------------------------------------------------------
        # OUTLINE PHASE
        # ---------------------------------------------------------------

        outline_result = await self._run_outline_phase(
            api_key, input, wizard_result, course_plan_context,
        )

        # Write outline to course content
        course_content = {
            "wizard": wizard_result.model_dump(),
            "outline": outline_result.outline.model_dump(),
        }
        await self._write_course_content(
            input.tenant_id, input.course_id, course_content,
        )

        # ---------------------------------------------------------------
        # LESSON PHASE — parallel batches
        # ---------------------------------------------------------------

        outline = outline_result.outline
        total_lessons = sum(len(s.lessons) for s in outline.sections)

        await self._run_lesson_phase(
            api_key, input, wizard_result, outline, total_lessons,
        )

        # ---------------------------------------------------------------
        # STRUCTURAL ELEMENTS PHASE
        # ---------------------------------------------------------------

        self._progress = 92
        self._progress_message = "Adding transitions and summaries..."
        await self._update_job(
            input, "PROCESSING", 92, "Adding transitions and summaries",
        )

        structural_result = await self._run_ai_activity(
            "generate_structural_elements_activity",
            GenerateStructuralElementsInput(api_key=api_key, outline=outline),
            GenerateStructuralElementsOutput,
            timeout=AI_LONG_TIMEOUT,
        )

        for section in outline.sections:
            section.introduction = structural_result.section_introductions.get(
                section.id, ""
            )
            section.summary = structural_result.section_summaries.get(
                section.id, ""
            )
        outline.conclusion = structural_result.conclusion

        # ---------------------------------------------------------------
        # FINALIZE
        # ---------------------------------------------------------------

        course_content = {
            "wizard": wizard_result.model_dump(),
            "outline": outline.model_dump(),
        }
        await self._write_course_content(
            input.tenant_id, input.course_id, course_content,
        )

        self._status = "completed"
        self._progress = 100
        self._progress_message = "Course creation complete"
        await self._update_job(input, "COMPLETED", 100, "Course creation complete")

        await workflow.wait_condition(workflow.all_handlers_finished)

        return CourseCreationOutput(
            course_id=input.course_id,
            total_lessons=total_lessons,
            completed_lessons=total_lessons,
        )

    # -------------------------------------------------------------------
    # Phase Methods — hierarchical decomposition
    # -------------------------------------------------------------------

    async def _run_wizard_phase(
        self, api_key: str, input: CourseCreationInput,
    ) -> WizardResult:
        """Wizard phase: generate title, outcomes, personas, tone.

        Parallelizes independent steps:
          Batch 1: title + outcomes (no cross-dependency)
          Batch 2: SME personas (needs title)
          Batch 3: audience personas (needs SME)
          Batch 4: tone options (needs audience)
        """
        self._progress = 5
        self._progress_message = "Generating title and outcomes..."

        # Batch 1: title + outcomes in parallel
        title_task = self._run_ai_activity(
            "generate_title_activity",
            GenerateTitleInput(
                api_key=api_key,
                course_name=input.course_name,
                rag_filters=input.rag_filters or None,
            ),
            GenerateTitleOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        outcomes_task = self._run_ai_activity(
            "generate_outcomes_activity",
            GenerateOutcomesInput(
                api_key=api_key,
                course_name=input.course_name,
                rag_filters=input.rag_filters or None,
            ),
            GenerateOutcomesOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        title_result, outcomes_result = await asyncio.gather(
            title_task, outcomes_task,
        )

        improved_title = title_result.improved_title
        description = title_result.description
        desired_outcomes = outcomes_result.outcomes

        # Batch 2: SME personas (needs title + description)
        self._progress = 20
        self._progress_message = "Generating expert personas..."
        sme_result = await self._run_ai_activity(
            "generate_sme_personas_activity",
            GenerateSMEPersonasInput(
                api_key=api_key,
                title=improved_title,
                description=description,
                rag_filters=input.rag_filters or None,
            ),
            GenerateSMEPersonasOutput,
            timeout=AI_SHORT_TIMEOUT,
        )

        # Batch 3: audience personas (needs SME)
        self._progress = 30
        self._progress_message = "Generating audience personas..."
        audience_result = await self._run_ai_activity(
            "generate_audience_personas_activity",
            GenerateAudiencePersonasInput(
                api_key=api_key,
                title=improved_title,
                description=description,
                sme_personas=sme_result.personas,
                rag_filters=input.rag_filters or None,
            ),
            GenerateAudiencePersonasOutput,
            timeout=AI_SHORT_TIMEOUT,
        )

        # Batch 4: tone options (needs audience)
        self._progress = 38
        self._progress_message = "Selecting tone & style..."
        tone_result = await self._run_ai_activity(
            "generate_tone_options_activity",
            GenerateToneOptionsInput(
                api_key=api_key,
                title=improved_title,
                description=description,
                audience_personas=audience_result.personas,
                rag_filters=input.rag_filters or None,
            ),
            GenerateToneOptionsOutput,
            timeout=AI_SHORT_TIMEOUT,
        )

        return WizardResult(
            improved_title=improved_title,
            description=description,
            desired_outcomes=desired_outcomes,
            sme_personas=sme_result.personas,
            audience_personas=audience_result.personas,
            tone=tone_result.options[0],
            additional_context=input.additional_context or "",
            internal_data_only=input.internal_data_only,
        )

    async def _run_planning_phase(
        self,
        api_key: str,
        input: CourseCreationInput,
        improved_title: str,
        desired_outcomes: str,
    ) -> object | None:
        """Planning phase: analyze knowledge documents and build course plan."""
        has_knowledge = bool(
            input.selected_team_doc_ids or input.selected_global_doc_ids
        )
        if not has_knowledge:
            return None

        self._progress = 42
        self._progress_message = "Analyzing documents..."
        await self._update_job(input, "PROCESSING", 42, "Analyzing documents")

        all_source_ids = (
            input.selected_team_doc_ids + input.selected_global_doc_ids
        )
        analyses = []
        for source_id in all_source_ids:
            doc_content = await self._read_file_content(
                f"knowledge/{input.tenant_id}/{source_id}"
            )
            if not doc_content:
                continue

            analysis = await self._run_ai_activity(
                "analyze_document",
                AnalyzeDocumentInput(
                    api_key=api_key,
                    source_id=source_id,
                    source_name=source_id,
                    document_text=doc_content,
                    course_title=improved_title,
                    desired_outcome=desired_outcomes,
                ),
                AnalyzeDocumentOutput,
                timeout=timedelta(minutes=3),
            )
            analyses.append(analysis.analysis)

        if not analyses:
            return None

        from src.activities.planning import (
            GenerateCoursePlanInput,
            GenerateCoursePlanOutput,
        )

        plan_result = await self._run_ai_activity(
            "generate_course_plan",
            GenerateCoursePlanInput(
                api_key=api_key,
                course_title=improved_title,
                desired_outcome=desired_outcomes,
                document_analyses=analyses,
                internal_data_only=input.internal_data_only,
                additional_context=input.additional_context or "",
            ),
            GenerateCoursePlanOutput,
            timeout=AI_LONG_TIMEOUT,
        )

        return plan_result.plan

    async def _run_outline_phase(
        self,
        api_key: str,
        input: CourseCreationInput,
        wizard_result: WizardResult,
        course_plan_context: object | None,
    ) -> GenerateOutlineOutput:
        """Outline phase: generate outline and wait for human approval."""
        self._progress = 45
        self._progress_message = "Generating outline..."
        await self._update_job(input, "PROCESSING", 45, "Generating outline")

        outcome_lines = [
            line.strip().lstrip("•").strip()
            for line in wizard_result.desired_outcomes.split("\n")
            if line.strip()
        ]
        outcome_lines = [o for o in outcome_lines if o]

        additional_context = wizard_result.additional_context

        outline_input = GenerateOutlineInput(
            api_key=api_key,
            course_title=wizard_result.improved_title,
            desired_outcome=wizard_result.desired_outcomes,
            desired_outcomes=outcome_lines,
            sme_personas=wizard_result.sme_personas,
            audience_personas=wizard_result.audience_personas,
            additional_context=additional_context,
            internal_data_only=input.internal_data_only,
            course_plan_context=course_plan_context,
            rag_filters=input.rag_filters or None,
        )

        outline_result = await self._run_ai_activity(
            "generate_outline", outline_input, GenerateOutlineOutput,
            timeout=AI_LONG_TIMEOUT,
        )

        outline_approval = await self._publish_and_wait(
            input, "outline",
            json.dumps({
                "outline": outline_result.outline.model_dump(),
                "constraint_violations": outline_result.constraint_violations,
            }), 50,
        )

        if outline_approval and not outline_approval.approved and outline_approval.feedback:
            # Regenerate with feedback
            outline_input_with_feedback = GenerateOutlineInput(
                api_key=api_key,
                course_title=wizard_result.improved_title,
                desired_outcome=wizard_result.desired_outcomes,
                desired_outcomes=outcome_lines,
                sme_personas=wizard_result.sme_personas,
                audience_personas=wizard_result.audience_personas,
                additional_context=(
                    additional_context + "\n\n"
                    + f"FEEDBACK FROM REVIEWER:\n{outline_approval.feedback}"
                ),
                internal_data_only=input.internal_data_only,
                course_plan_context=course_plan_context,
                rag_filters=input.rag_filters or None,
            )
            outline_result = await self._run_ai_activity(
                "generate_outline", outline_input_with_feedback,
                GenerateOutlineOutput, timeout=AI_LONG_TIMEOUT,
            )
            await self._publish_and_wait(
                input, "outline",
                json.dumps({
                    "outline": outline_result.outline.model_dump(),
                    "constraint_violations": outline_result.constraint_violations,
                }), 50,
            )

        return outline_result

    async def _run_lesson_phase(
        self,
        api_key: str,
        input: CourseCreationInput,
        wizard_result: WizardResult,
        outline: CourseOutline,
        total_lessons: int,
    ) -> None:
        """Lesson phase: generate all lessons in parallel batches."""
        self._progress = 55
        self._progress_message = "Generating lessons..."
        await self._update_job(input, "PROCESSING", 55, "Generating lessons")

        course_context = self._build_course_context(outline.sections)
        concept_map_context = self._build_concept_map_context(outline)

        # Flatten all lessons with their metadata
        lesson_inputs: list[tuple[int, int, GenerateLessonInput]] = []
        flat_lessons: list[tuple[int, int]] = []
        for s_idx, section in enumerate(outline.sections):
            for l_idx in range(len(section.lessons)):
                flat_lessons.append((s_idx, l_idx))

        for flat_idx, (s_idx, l_idx) in enumerate(flat_lessons):
            section = outline.sections[s_idx]
            lesson = section.lessons[l_idx]

            is_section_first = l_idx == 0
            is_section_last = l_idx == len(section.lessons) - 1
            is_course_last = flat_idx == len(flat_lessons) - 1

            next_lesson_title = ""
            if not is_course_last:
                next_s_idx, next_l_idx = flat_lessons[flat_idx + 1]
                next_lesson_title = outline.sections[next_s_idx].lessons[next_l_idx].title

            lesson_input = GenerateLessonInput(
                api_key=api_key,
                lesson=lesson,
                course_title=wizard_result.improved_title,
                course_context=course_context,
                section_title=section.title,
                section_index=s_idx,
                lesson_index=l_idx,
                sme_personas=wizard_result.sme_personas,
                rag_filters=input.rag_filters or None,
                previous_lesson_summaries=[],
                concept_map_context=concept_map_context,
                is_section_first=is_section_first,
                is_section_last=is_section_last,
                is_course_last=is_course_last,
                next_lesson_title=next_lesson_title,
                web_context="",
            )
            lesson_inputs.append((s_idx, l_idx, lesson_input))

        # Generate lessons in parallel batches
        completed = 0
        for batch_start in range(0, len(lesson_inputs), LESSON_BATCH_SIZE):
            batch = lesson_inputs[batch_start:batch_start + LESSON_BATCH_SIZE]
            batch_label = f"batch {batch_start // LESSON_BATCH_SIZE + 1}"

            log.info(
                "lesson_batch_started",
                batch=batch_label,
                lessons=[outline.sections[s].lessons[l].title for s, l, _ in batch],
            )

            # Start all activities in this batch concurrently
            tasks = [
                self._run_ai_activity(
                    "generate_lesson", li, GenerateLessonOutput,
                    timeout=AI_LESSON_TIMEOUT,
                )
                for _, _, li in batch
            ]
            results = await asyncio.gather(*tasks)

            # Merge results back into outline
            for (s_idx, l_idx, _), result in zip(batch, results):
                outline.sections[s_idx].lessons[l_idx].content = result.lesson_content

            completed += len(batch)
            progress = 55 + int((completed / total_lessons) * 35)
            self._progress = progress
            self._progress_message = f"Generated {completed}/{total_lessons} lessons"
            await self._update_job(
                input, "PROCESSING", progress,
                f"Generated {completed}/{total_lessons} lessons",
            )

    # -------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------

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

    async def _read_file_content(self, file_path: str) -> str | None:
        try:
            result = await workflow.execute_activity(
                "ReadFileContent",
                {"file_path": file_path},
                task_queue=GO_TASKS,
                start_to_close_timeout=GO_TIMEOUT,
                retry_policy=RetryPolicy(**GO_RETRY),
            )
            return result.get("content", "")
        except Exception:
            return None

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

    @staticmethod
    def _build_course_context(sections: list[OutlineSection]) -> str:
        parts: list[str] = []
        for i, section in enumerate(sections):
            parts.append(f"Section {i + 1}: {section.title}")
            for j, lesson in enumerate(section.lessons):
                desc = lesson.description[:100]
                parts.append(f"  Lesson {j + 1}: {lesson.title} — {desc}")
        return "\n".join(parts)

    @staticmethod
    def _build_concept_map_context(outline) -> str:
        if not outline.concept_map or not outline.concept_map.concepts:
            return ""

        parts: list[str] = []
        for node in outline.concept_map.concepts:
            prereqs = (
                f" (requires: {', '.join(node.prerequisites)})"
                if node.prerequisites
                else ""
            )
            reinforced = (
                f", reinforced in: {', '.join(node.reinforced_in)}"
                if node.reinforced_in
                else ""
            )
            parts.append(
                f"- {node.concept}: first in {node.first_taught_in}"
                f"{reinforced}{prereqs}"
            )
        return "\n".join(parts)
