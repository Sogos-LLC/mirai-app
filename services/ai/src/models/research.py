"""Research models for knowledge synthesis and source provider outputs."""

from pydantic import BaseModel, Field


class KnowledgeResearchResult(BaseModel):
    """Structured output from the knowledge research agent."""

    research_text: str = Field(
        description="Synthesized research text (3-5 paragraphs) with [Source N] references."
    )
    key_findings: list[str] = Field(
        default_factory=list,
        description="Bullet points of key facts extracted from the sources.",
    )
    gaps: list[str] = Field(
        default_factory=list,
        description="Areas where the source material lacks sufficient information.",
    )
