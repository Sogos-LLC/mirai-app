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
class WizardSMEPersona:
    """SME persona from wizard (matches Go entity.WizardSMEPersona)."""

    id: str = ""
    job_title: str = ""
    description: str = ""
    skills: list[str] = field(default_factory=list)
    voice: str = ""


@dataclass
class WizardAudiencePersona:
    """Audience persona from wizard (matches Go entity.WizardAudiencePersona)."""

    id: str = ""
    name: str = ""
    role: str = ""
    description: str = ""
    goals: list[str] = field(default_factory=list)


@dataclass
class WizardToneOption:
    """Tone option from wizard (matches Go entity.WizardToneOption)."""

    id: str = ""
    name: str = ""
    description: str = ""
    level_of_detail: str = "moderate"


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
    enable_internal_knowledge: bool = False
    enable_web_research: bool = False
    strict_knowledge_only: bool = False

    # Knowledge source IDs (for RAG)
    selected_team_doc_ids: list[str] | None = field(default_factory=list)
    selected_global_doc_ids: list[str] | None = field(default_factory=list)

    # Wizard-generated data (present when multi-step wizard was used)
    desired_outcomes: str = ""
    improved_title: str = ""
    description: str = ""
    sme_personas: list[WizardSMEPersona] | None = field(default_factory=list)
    selected_sme_ids: list[str] | None = field(default_factory=list)
    audience_personas: list[WizardAudiencePersona] | None = field(default_factory=list)
    selected_audience_ids: list[str] | None = field(default_factory=list)
    selected_tone: WizardToneOption | None = None
    additional_context: str = ""
    context_file_url: str = ""
    skip_qa: bool = True

    def __post_init__(self) -> None:
        """Normalize None → empty for optional collection fields."""
        if self.selected_team_doc_ids is None:
            self.selected_team_doc_ids = []
        if self.selected_global_doc_ids is None:
            self.selected_global_doc_ids = []
        if self.sme_personas is None:
            self.sme_personas = []
        if self.selected_sme_ids is None:
            self.selected_sme_ids = []
        if self.audience_personas is None:
            self.audience_personas = []
        if self.selected_audience_ids is None:
            self.selected_audience_ids = []


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
