"""Unified course creation workflow — wizard through lessons in one Temporal workflow.

Flow:
  Wizard Phase → (optional) Planning Phase → Outline Phase → Lesson Phase → Complete

At each approval point, publishes SSE via Go activity and waits for a Temporal signal.
AI work is done in Python activities on ai-tasks queue.
Infrastructure (DB, MinIO, SSE) is done via Go activities on go-tasks queue.
"""

import json
from datetime import timedelta

import structlog
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    from src.activities.generation import (
        GenerateLessonInput,
        GenerateLessonOutput,
        GenerateOutlineInput,
        GenerateOutlineOutput,
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
    from src.workflows.types import CourseCreationInput, CourseCreationOutput, StepApproval

log = structlog.get_logger()

# Task queues
GO_TASKS = "go-tasks"
AI_TASKS = "ai-tasks"

# Timeout configs
GO_TIMEOUT = timedelta(seconds=30)
AI_SHORT_TIMEOUT = timedelta(minutes=2)
AI_LONG_TIMEOUT = timedelta(minutes=5)
AI_LESSON_TIMEOUT = timedelta(minutes=10)
AI_HEARTBEAT = timedelta(seconds=90)

# Retry policies
GO_RETRY = {"maximum_attempts": 3}
AI_RETRY = {"maximum_attempts": 2}


@workflow.defn
class CourseCreationWorkflow:
    """Unified course creation workflow with signal-based human-in-the-loop."""

    def __init__(self) -> None:
        self._approval: StepApproval | None = None
        self._current_step: str = ""

    @workflow.signal
    async def approve_step(self, data: StepApproval) -> None:
        """Signal: user approved a step. Store the approval data."""
        self._approval = data

    @workflow.signal
    async def reject_step(self, data: StepApproval) -> None:
        """Signal: user rejected a step. Store with approved=False."""
        data.approved = False
        self._approval = data

    @workflow.run
    async def run(self, input: CourseCreationInput) -> CourseCreationOutput:
        """Execute the full course creation pipeline."""
        log.info(
            "course_creation_started",
            job_id=input.job_id,
            course_name=input.course_name,
        )

        # Update job status to processing
        await self._update_job(input, "PROCESSING", 0, "Starting course creation")

        # 1. Decrypt API key (Go activity)
        api_key = await self._decrypt_api_key(input.tenant_id)

        # ---------------------------------------------------------------
        # WIZARD PHASE
        # ---------------------------------------------------------------

        # Step 1: Generate title
        title_result = await self._run_ai_activity(
            "generate_title_activity",
            GenerateTitleInput(api_key=api_key, course_name=input.course_name),
            GenerateTitleOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        title_approval = await self._publish_and_wait(
            input, "title", json.dumps({
                "improved_title": title_result.improved_title,
                "description": title_result.description,
            }), 5,
        )
        improved_title = title_result.improved_title
        description = title_result.description
        if not title_approval.approved:
            # Regenerate on rejection
            title_result = await self._run_ai_activity(
                "generate_title_activity",
                GenerateTitleInput(api_key=api_key, course_name=input.course_name),
                GenerateTitleOutput,
                timeout=AI_SHORT_TIMEOUT,
            )
            improved_title = title_result.improved_title
            description = title_result.description
            await self._publish_and_wait(
                input, "title", json.dumps({
                    "improved_title": improved_title,
                    "description": description,
                }), 5,
            )

        # Step 2: Generate outcomes
        outcomes_result = await self._run_ai_activity(
            "generate_outcomes_activity",
            GenerateOutcomesInput(
                api_key=api_key,
                course_name=improved_title,
            ),
            GenerateOutcomesOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        outcomes_approval = await self._publish_and_wait(
            input, "outcomes", json.dumps({
                "outcomes": outcomes_result.outcomes,
            }), 10,
        )
        desired_outcomes = outcomes_result.outcomes
        if not outcomes_approval.approved:
            outcomes_result = await self._run_ai_activity(
                "generate_outcomes_activity",
                GenerateOutcomesInput(api_key=api_key, course_name=improved_title),
                GenerateOutcomesOutput,
                timeout=AI_SHORT_TIMEOUT,
            )
            desired_outcomes = outcomes_result.outcomes
            await self._publish_and_wait(
                input, "outcomes", json.dumps({"outcomes": desired_outcomes}), 10,
            )

        # Step 3: Generate SME personas
        sme_result = await self._run_ai_activity(
            "generate_sme_personas_activity",
            GenerateSMEPersonasInput(
                api_key=api_key, title=improved_title, description=description,
            ),
            GenerateSMEPersonasOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        sme_approval = await self._publish_and_wait(
            input, "sme_personas", json.dumps({"personas": sme_result.personas}), 15,
        )
        selected_sme_ids = sme_approval.selected_ids or [
            p["id"] for p in sme_result.personas
        ]
        selected_smes = [
            p for p in sme_result.personas if p["id"] in selected_sme_ids
        ]

        # Step 4: Generate audience personas
        audience_result = await self._run_ai_activity(
            "generate_audience_personas_activity",
            GenerateAudiencePersonasInput(
                api_key=api_key,
                title=improved_title,
                description=description,
                sme_personas=selected_smes,
            ),
            GenerateAudiencePersonasOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        audience_approval = await self._publish_and_wait(
            input, "audience_personas",
            json.dumps({"personas": audience_result.personas}), 20,
        )
        selected_audience_ids = audience_approval.selected_ids or [
            p["id"] for p in audience_result.personas
        ]
        selected_audiences = [
            p for p in audience_result.personas if p["id"] in selected_audience_ids
        ]

        # Step 5: Generate tone options
        tone_result = await self._run_ai_activity(
            "generate_tone_options_activity",
            GenerateToneOptionsInput(
                api_key=api_key,
                title=improved_title,
                description=description,
                audience_personas=selected_audiences,
            ),
            GenerateToneOptionsOutput,
            timeout=AI_SHORT_TIMEOUT,
        )
        tone_approval = await self._publish_and_wait(
            input, "tone_options",
            json.dumps({"options": tone_result.options}), 25,
        )
        selected_tone_id = (
            tone_approval.selected_ids[0]
            if tone_approval.selected_ids
            else tone_result.options[0]["id"]
        )
        selected_tone = next(
            (o for o in tone_result.options if o["id"] == selected_tone_id),
            tone_result.options[0],
        )

        # Build wizard context for later phases
        wizard_context = {
            "improved_title": improved_title,
            "description": description,
            "desired_outcomes": desired_outcomes,
            "sme_personas": selected_smes,
            "audience_personas": selected_audiences,
            "tone": selected_tone,
            "additional_context": input.additional_context,
            "internal_data_only": input.internal_data_only,
        }

        # Save wizard data to course content (Go activity)
        await self._write_course_content(
            input.tenant_id, input.course_id, {"wizard": wizard_context},
        )

        # ---------------------------------------------------------------
        # PLANNING PHASE (conditional: if knowledge sources selected)
        # ---------------------------------------------------------------

        course_plan_context = None
        has_knowledge = bool(
            input.selected_team_doc_ids or input.selected_global_doc_ids
        )

        if has_knowledge:
            await self._update_job(input, "PROCESSING", 30, "Analyzing documents")

            # Analyze each document
            all_source_ids = (
                input.selected_team_doc_ids + input.selected_global_doc_ids
            )
            analyses = []
            for source_id in all_source_ids:
                # Read document content from MinIO (Go activity)
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

            if analyses:
                # Generate course plan
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
                        document_analyses=[a for a in analyses],
                        internal_data_only=input.internal_data_only,
                        additional_context=input.additional_context,
                    ),
                    GenerateCoursePlanOutput,
                    timeout=AI_LONG_TIMEOUT,
                )

                course_plan_context = plan_result.plan
                await self._publish_and_wait(
                    input, "course_plan",
                    json.dumps({"plan": course_plan_context}), 35,
                )

        # ---------------------------------------------------------------
        # OUTLINE PHASE
        # ---------------------------------------------------------------

        await self._update_job(input, "PROCESSING", 40, "Generating outline")

        # Parse desired outcomes into a list
        outcome_lines = [
            line.strip().lstrip("•").strip()
            for line in desired_outcomes.split("\n")
            if line.strip().startswith("•") or line.strip()
        ]
        outcome_lines = [o for o in outcome_lines if o]

        outline_result = await self._run_ai_activity(
            "generate_outline",
            GenerateOutlineInput(
                api_key=api_key,
                course_title=improved_title,
                desired_outcome=desired_outcomes,
                desired_outcomes=outcome_lines,
                sme_knowledge=selected_smes,
                target_audience=selected_audiences,
                additional_context=input.additional_context,
                internal_data_only=input.internal_data_only,
                course_plan_context=course_plan_context,
                rag_filters=input.rag_filters or None,
            ),
            GenerateOutlineOutput,
            timeout=AI_LONG_TIMEOUT,
        )

        outline_approval = await self._publish_and_wait(
            input, "outline",
            json.dumps({
                "outline": outline_result.outline,
                "constraint_violations": outline_result.constraint_violations,
            }), 50,
        )

        if not outline_approval.approved and outline_approval.feedback:
            # Regenerate with feedback
            outline_result = await self._run_ai_activity(
                "generate_outline",
                GenerateOutlineInput(
                    api_key=api_key,
                    course_title=improved_title,
                    desired_outcome=desired_outcomes,
                    desired_outcomes=outcome_lines,
                    sme_knowledge=selected_smes,
                    target_audience=selected_audiences,
                    additional_context=(
                        input.additional_context + "\n\n"
                        + f"FEEDBACK FROM REVIEWER:\n{outline_approval.feedback}"
                    ),
                    internal_data_only=input.internal_data_only,
                    course_plan_context=course_plan_context,
                    rag_filters=input.rag_filters or None,
                ),
                GenerateOutlineOutput,
                timeout=AI_LONG_TIMEOUT,
            )
            await self._publish_and_wait(
                input, "outline",
                json.dumps({
                    "outline": outline_result.outline,
                    "constraint_violations": outline_result.constraint_violations,
                }), 50,
            )

        # Write outline to course content
        course_content = {"wizard": wizard_context, "outline": outline_result.outline}
        await self._write_course_content(
            input.tenant_id, input.course_id, course_content,
        )

        # ---------------------------------------------------------------
        # LESSON PHASE
        # ---------------------------------------------------------------

        await self._update_job(input, "PROCESSING", 55, "Generating lessons")

        outline = outline_result.outline
        sections = outline.get("sections", [])

        # Count total lessons
        total_lessons = sum(len(s.get("lessons", [])) for s in sections)
        completed_lessons = 0

        # Build course context for deduplication
        course_context = self._build_course_context(sections)

        for s_idx, section in enumerate(sections):
            section_lessons = section.get("lessons", [])
            section_title = section.get("title", f"Section {s_idx + 1}")

            for l_idx, lesson in enumerate(section_lessons):
                lesson_result = await self._run_ai_activity(
                    "generate_lesson",
                    GenerateLessonInput(
                        api_key=api_key,
                        lesson=lesson,
                        course_title=improved_title,
                        course_context=course_context,
                        section_title=section_title,
                        section_index=s_idx,
                        lesson_index=l_idx,
                        sme_knowledge=selected_smes,
                        rag_filters=input.rag_filters or None,
                    ),
                    GenerateLessonOutput,
                    timeout=AI_LESSON_TIMEOUT,
                )

                # Merge lesson content into outline
                if "lessons" not in sections[s_idx]:
                    sections[s_idx]["lessons"] = section_lessons
                sections[s_idx]["lessons"][l_idx]["content"] = (
                    lesson_result.lesson_content
                )

                completed_lessons += 1
                progress = 55 + int((completed_lessons / total_lessons) * 40)

                await self._update_job(
                    input, "PROCESSING", progress,
                    f"Generated lesson {completed_lessons}/{total_lessons}",
                )

                # Publish progress event
                await self._publish_event(input, "updated")

        # ---------------------------------------------------------------
        # FINALIZE
        # ---------------------------------------------------------------

        # Write final course content
        course_content["outline"] = outline
        await self._write_course_content(
            input.tenant_id, input.course_id, course_content,
        )

        await self._update_job(input, "COMPLETED", 100, "Course creation complete")
        await self._publish_event(input, "completed")

        return CourseCreationOutput(
            course_id=input.course_id,
            total_lessons=total_lessons,
            completed_lessons=completed_lessons,
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
        """Publish step result via SSE, then wait for user approval signal."""
        self._current_step = step
        self._approval = None

        # Update job with step data
        await self._update_job(
            input, "AWAITING_APPROVAL", progress,
            f"Waiting for approval: {step}",
        )

        # Publish SSE event with step data
        await self._publish_step_event(input, step, data_json)

        # Wait for signal (durable — survives restarts)
        await workflow.wait_condition(lambda: self._approval is not None)

        approval = self._approval
        assert approval is not None
        self._approval = None
        return approval

    async def _decrypt_api_key(self, tenant_id: str) -> str:
        """Decrypt API key via Go activity."""
        result = await workflow.execute_activity(
            "DecryptAPIKey",
            {"tenant_id": tenant_id},
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=workflow.RetryPolicy(**GO_RETRY),
        )
        return result["api_key"]

    async def _update_job(
        self,
        input: CourseCreationInput,
        status: str,
        progress: int,
        message: str,
    ) -> None:
        """Update job status via Go activity."""
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
            retry_policy=workflow.RetryPolicy(**GO_RETRY),
        )

    async def _publish_event(
        self, input: CourseCreationInput, event_type: str,
    ) -> None:
        """Publish SSE event via Go activity."""
        await workflow.execute_activity(
            "PublishJobEvent",
            {
                "user_id": input.user_id,
                "event_type": event_type,
                "job_id": input.job_id,
            },
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=workflow.RetryPolicy(**GO_RETRY),
        )

    async def _publish_step_event(
        self,
        input: CourseCreationInput,
        step: str,
        data_json: str,
    ) -> None:
        """Publish awaiting-approval SSE event with step data."""
        await workflow.execute_activity(
            "PublishJobStepEvent",
            {
                "user_id": input.user_id,
                "job_id": input.job_id,
                "step": step,
                "data_json": data_json,
            },
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=workflow.RetryPolicy(**GO_RETRY),
        )

    async def _write_course_content(
        self, tenant_id: str, course_id: str, content: dict,
    ) -> None:
        """Write course content to MinIO via Go activity."""
        await workflow.execute_activity(
            "WriteCourseContent",
            {
                "tenant_id": tenant_id,
                "course_id": course_id,
                "content": content,
            },
            task_queue=GO_TASKS,
            start_to_close_timeout=GO_TIMEOUT,
            retry_policy=workflow.RetryPolicy(**GO_RETRY),
        )

    async def _read_file_content(self, file_path: str) -> str | None:
        """Read file content from MinIO via Go activity."""
        try:
            result = await workflow.execute_activity(
                "ReadFileContent",
                {"file_path": file_path},
                task_queue=GO_TASKS,
                start_to_close_timeout=GO_TIMEOUT,
                retry_policy=workflow.RetryPolicy(**GO_RETRY),
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
        """Execute an AI activity on the ai-tasks queue."""
        return await workflow.execute_activity(
            activity_name,
            input_data,
            task_queue=AI_TASKS,
            start_to_close_timeout=timeout,
            heartbeat_timeout=AI_HEARTBEAT,
            retry_policy=workflow.RetryPolicy(**AI_RETRY),
        )

    @staticmethod
    def _build_course_context(sections: list[dict]) -> str:
        """Build a text summary of the course structure for deduplication."""
        parts: list[str] = []
        for i, section in enumerate(sections):
            parts.append(f"Section {i + 1}: {section.get('title', '')}")
            for j, lesson in enumerate(section.get("lessons", [])):
                title = lesson.get("title", "")
                desc = lesson.get("description", "")[:100]
                parts.append(f"  Lesson {j + 1}: {title} — {desc}")
        return "\n".join(parts)
