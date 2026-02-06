"""Input, output, and signal types for the CourseCreationWorkflow."""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel

from src.models.wizard import SMEPersona, AudiencePersona, ToneOption


@dataclass
class CourseCreationInput:
    """Input to start a course creation workflow."""

    job_id: str
    tenant_id: str
    course_id: str
    user_id: str

    # Wizard seed data
    course_name: str
    desired_outcomes: str = ""
    additional_context: str = ""
    internal_data_only: bool = False

    # Knowledge source IDs (for RAG + planning)
    # Optional to tolerate Go nil slices (serialized as JSON null)
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
    completed_lessons: int = 0


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


class WizardResult(BaseModel):
    """Typed accumulator for wizard phase outputs."""

    improved_title: str
    description: str
    desired_outcomes: str
    sme_personas: list[SMEPersona]
    audience_personas: list[AudiencePersona]
    tone: ToneOption
    additional_context: str
    internal_data_only: bool
