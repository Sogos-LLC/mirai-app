"""Input, output, and signal types for the CourseCreationWorkflow."""

from dataclasses import dataclass, field


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
    selected_team_doc_ids: list[str] = field(default_factory=list)
    selected_global_doc_ids: list[str] = field(default_factory=list)

    # RAG filters (course_id, team_id, etc.)
    rag_filters: dict[str, str] = field(default_factory=dict)


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
    selected_ids: list[str] = field(default_factory=list)
    modifications: dict[str, str] = field(default_factory=dict)
