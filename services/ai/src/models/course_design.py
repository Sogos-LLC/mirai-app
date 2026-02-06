"""Pydantic models for the 5-step instructional design wizard.

Every step produces a validated artifact. Artifacts are immutable once approved.
Each AI call returns a Pydantic model. Later steps receive only approved models as input.
Validation replaces prompt fragility.

Step 1: Define Intent → CourseAnalysis
Step 2: Define Success → CourseOutcomes
Step 3: Approve Structure → CourseStructure (hidden: SectionOutcomes)
Step 4: Approve Sample Lesson → Lesson (hidden: LessonTemplate)
Step 5: Final Review → ExportPackage (hidden: expansion pipeline)
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


# =============================================================================
# STEP 1: Define Intent
# =============================================================================


class CourseIntent(BaseModel):
    """User-provided seed data to start course creation."""

    topic: str = Field(description="What the course is about")
    audience: str = Field(description="Who the course is for")
    use_context: str = Field(default="", description="How learners will apply the knowledge")


class CourseAnalysis(BaseModel):
    """AI-generated analysis of the course intent. Locked after user approval."""

    purpose_statement: str = Field(
        description="A clear statement of why this course exists and what gap it fills"
    )
    learner_assumptions: list[str] = Field(
        description="Assumptions about what learners already know",
        min_length=2,
        max_length=6,
    )
    constraints: list[str] = Field(
        description="Scope boundaries — what this course will NOT cover",
        min_length=1,
        max_length=5,
    )


# =============================================================================
# STEP 2: Define Success
# =============================================================================


class BehaviorChange(BaseModel):
    """What observable behavior should change after the course."""

    description: str = Field(
        description="A concrete description of the behavior change learners will exhibit"
    )


class CourseGoal(BaseModel):
    """The single overarching goal of the course."""

    goal_statement: str = Field(
        description="A single sentence capturing the course's primary goal"
    )


class LearningOutcome(BaseModel):
    """A measurable learning outcome using Bloom's taxonomy verbs."""

    verb: str = Field(description="Action verb from Bloom's taxonomy (e.g., analyze, evaluate, create)")
    object: str = Field(description="What the learner acts on (e.g., 'financial statements')")
    condition: str = Field(description="Under what conditions (e.g., 'given a dataset')")
    measurability_check: str = Field(
        description="How this outcome can be measured or assessed"
    )

    @field_validator("verb")
    @classmethod
    def verb_is_action(cls, v: str) -> str:
        """Ensure the verb is a concrete action verb, not vague."""
        vague = {"understand", "know", "learn", "appreciate", "be aware of"}
        if v.lower().strip() in vague:
            raise ValueError(
                f"'{v}' is too vague. Use a measurable Bloom's verb like "
                "'analyze', 'evaluate', 'design', 'compare', 'construct'."
            )
        return v


class CourseOutcomes(BaseModel):
    """The set of learning outcomes for the course. Locked after user approval."""

    behavior_change: BehaviorChange
    goal: CourseGoal
    outcomes: list[LearningOutcome] = Field(
        description="3-7 measurable learning outcomes",
        min_length=3,
        max_length=7,
    )


# =============================================================================
# STEP 3: Approve Structure
# =============================================================================


class Section(BaseModel):
    """A course section grouping related outcomes."""

    title: str = Field(description="Section title")
    description: str = Field(default="", description="Brief section description")
    mapped_outcomes: list[str] = Field(
        description="Which learning outcome verbs+objects this section addresses"
    )


class CourseStructure(BaseModel):
    """The overall course structure. Locked after user approval."""

    sections: list[Section] = Field(
        description="Ordered list of course sections",
        min_length=2,
        max_length=10,
    )


class SectionOutcome(BaseModel):
    """Hidden: granular outcome for a section, derived from course-level outcomes."""

    description: str = Field(description="What learners achieve in this section")
    parent_course_outcome: str = Field(
        description="The course-level outcome this maps to"
    )


class SectionOutcomes(BaseModel):
    """Hidden: all section-level outcomes generated behind the scenes."""

    section_outcomes: dict[str, list[SectionOutcome]] = Field(
        description="Map of section title → list of section outcomes"
    )


# =============================================================================
# STEP 4: Approve Sample Lesson
# =============================================================================


class LessonObjective(BaseModel):
    """What a specific lesson aims to achieve."""

    description: str = Field(description="Lesson-level learning objective")
    mapped_section_outcome: str = Field(
        description="Which section outcome this maps to"
    )


class InstructionalStrategy(BaseModel):
    """How the lesson will be taught."""

    modality: str = Field(description="Primary delivery mode: reading, video, interactive, etc.")
    interaction_types: list[str] = Field(
        description="Types of learner interaction: quiz, discussion, exercise, etc."
    )
    practice_type: str = Field(
        description="How learners practice: guided, independent, collaborative, etc."
    )


class LessonOutline(BaseModel):
    """The structural outline of a lesson."""

    chunks: list[str] = Field(
        description="Ordered list of content chunks/topics in the lesson",
        min_length=3,
        max_length=12,
    )
    objective_mapping: dict[str, str] = Field(
        description="Map of chunk → which objective it serves"
    )


class LessonBlock(BaseModel):
    """A content block within a lesson."""

    type: str = Field(description="Block type: text, heading, quiz, activity, callout, code, image, list")
    content: str = Field(description="The actual content of the block")
    heading: str = Field(default="", description="Optional heading for this block")


class Lesson(BaseModel):
    """A complete lesson. The sample lesson is locked after user approval."""

    title: str = Field(description="Lesson title")
    section_title: str = Field(description="Which section this lesson belongs to")
    objective: LessonObjective
    strategy: InstructionalStrategy
    outline: LessonOutline
    sample_blocks: list[LessonBlock] = Field(
        description="The actual content blocks of the lesson",
        min_length=3,
    )


# =============================================================================
# STEP 5: Final Review and Export
# =============================================================================


class CourseQA(BaseModel):
    """Quality assurance results from automated validators."""

    outcome_coverage: dict[str, bool] = Field(
        description="Map of outcome verb+object → whether it's covered by lessons"
    )
    redundancy_flags: list[str] = Field(
        default_factory=list,
        description="Sections or lessons with redundant content"
    )
    cognitive_load_flags: list[str] = Field(
        default_factory=list,
        description="Lessons that may exceed cognitive load thresholds"
    )
    accessibility_flags: list[str] = Field(
        default_factory=list,
        description="Accessibility issues found"
    )

    @property
    def all_outcomes_covered(self) -> bool:
        return all(self.outcome_coverage.values())

    @property
    def has_issues(self) -> bool:
        return bool(self.redundancy_flags or self.cognitive_load_flags or self.accessibility_flags)


class ExportPackage(BaseModel):
    """The final export-ready course package."""

    course_title: str
    structure_map: dict[str, Any] = Field(
        description="Complete course structure with all sections and lessons"
    )
    import_notes: list[str] = Field(
        default_factory=list,
        description="Notes for importing into an LMS"
    )
    total_lessons: int = 0
    total_sections: int = 0


# =============================================================================
# HIDDEN: Expansion Pipeline (between Steps 4 and 5)
# =============================================================================


class LessonTemplate(BaseModel):
    """Extracted pattern from the approved sample lesson."""

    block_sequence: list[str] = Field(
        description="Ordered list of block types from the sample lesson"
    )
    interaction_rules: list[str] = Field(
        description="Rules about how to structure interactions"
    )
    variation_parameters: dict[str, str] = Field(
        description="What can vary between lessons (e.g., practice_type, quiz_count)"
    )


class ExpandedLesson(BaseModel):
    """A lesson generated by the expansion pipeline using the approved template."""

    title: str
    section_title: str
    objective: LessonObjective
    content_blocks: list[LessonBlock]
    assessments: list[dict[str, Any]] = Field(default_factory=list)
    accessibility_tags: list[str] = Field(default_factory=list)
