"""Course planning models - structured output from document analysis."""

from pydantic import BaseModel, Field


class DocumentSummary(BaseModel):
    """Summary of an analyzed knowledge source document."""

    source_id: str = Field(description="Knowledge source ID")
    source_name: str = Field(description="Document name")
    summary: str = Field(description="Brief document summary")
    key_topics: list[str] = Field(default_factory=list, description="Main topics")
    relevance_score: float = Field(
        default=0.0, description="Relevance to course goals (0-1)"
    )


class PlannedLesson(BaseModel):
    """A planned lesson within a section."""

    title: str = Field(description="Lesson title")
    description: str = Field(description="What this lesson covers")
    learning_goals: list[str] = Field(
        default_factory=list, description="Specific learning goals"
    )


class PlannedSection(BaseModel):
    """A planned course section with source attribution."""

    title: str = Field(description="Section title")
    description: str = Field(description="Section description and rationale")
    source_ids: list[str] = Field(
        default_factory=list, description="Knowledge source IDs used"
    )
    rationale: str = Field(default="", description="Why this section is included")
    lessons: list[PlannedLesson] = Field(
        default_factory=list, description="Planned lessons"
    )
    search_terms: list[str] = Field(
        default_factory=list,
        description="Targeted search terms for RAG during generation",
    )


class DocumentAnalysis(BaseModel):
    """Analysis of a single document for course planning."""

    source_id: str = Field(description="Knowledge source ID")
    source_name: str = Field(description="Document name")
    summary: str = Field(description="Document summary")
    key_topics: list[str] = Field(default_factory=list)
    section_hints: list[str] = Field(
        default_factory=list,
        description="Suggested section titles this document could support",
    )
    relevance_score: float = Field(default=0.0)


class CoursePlan(BaseModel):
    """Complete course plan generated from document analysis."""

    course_title: str = Field(description="Course title")
    course_description: str = Field(description="Course description")
    document_summaries: list[DocumentSummary] = Field(
        default_factory=list, description="Summaries of analyzed documents"
    )
    planned_sections: list[PlannedSection] = Field(
        description="Planned course structure"
    )
    status: str = Field(default="draft", description="Plan status: draft, approved")
