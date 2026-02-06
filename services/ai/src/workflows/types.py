"""Input, output, and signal types for the CourseCreationWorkflow."""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel

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


@dataclass
class CourseCreationInput:
    """Input to start a course creation workflow."""

    job_id: str
    tenant_id: str
    course_id: str
    user_id: str

    # Step 1 seed data (CourseIntent)
    topic: str
    audience: str = ""
    use_context: str = ""
    internal_data_only: bool = False

    # Knowledge source IDs (for RAG)
    selected_team_doc_ids: list[str] | None = field(default_factory=list)
    selected_global_doc_ids: list[str] | None = field(default_factory=list)

    # RAG filters (course_id, team_id, etc.)
    rag_filters: dict[str, str] | None = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Normalize None → empty for optional collection fields."""
        if self.selected_team_doc_ids is None:
            self.selected_team_doc_ids = []
        if self.selected_global_doc_ids is None:
            self.selected_global_doc_ids = []
        if self.rag_filters is None:
            self.rag_filters = {}


@dataclass
class CourseCreationOutput:
    """Output from the course creation workflow."""

    course_id: str
    total_lessons: int = 0
    total_sections: int = 0


@dataclass
class StepApproval:
    """Signal data for approving/rejecting a workflow step."""

    step: str  # matches WorkflowStepType name
    approved: bool = True
    feedback: str = ""

    # User selections forwarded back to workflow
    selected_ids: list[str] | None = field(default_factory=list)
    modifications: dict[str, str] | None = field(default_factory=dict)

    def __post_init__(self) -> None:
        """Normalize None → empty for optional collection fields."""
        if self.selected_ids is None:
            self.selected_ids = []
        if self.modifications is None:
            self.modifications = {}


class LockedArtifacts(BaseModel):
    """Accumulated approved artifacts. Immutable once set."""

    analysis: CourseAnalysis | None = None
    outcomes: CourseOutcomes | None = None
    structure: CourseStructure | None = None
    section_outcomes: SectionOutcomes | None = None
    sample_lesson: Lesson | None = None
    template: LessonTemplate | None = None
    expanded_lessons: list[ExpandedLesson] = []
    qa: CourseQA | None = None
