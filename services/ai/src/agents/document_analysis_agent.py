"""Document analysis agent for knowledge ingestion.

Analyzes uploaded documents to extract structured metadata:
title, summary, main topics, key concepts, content depth, and estimated lesson count.
"""

from pydantic import BaseModel, Field
from pydantic_ai import Agent

from src.agents.model import make_model

MAX_ANALYSIS_CHARS = 8000


class DocumentAnalysis(BaseModel):
    """Structured analysis of an uploaded document."""

    title: str = Field(description="Document title (extracted or inferred)")
    summary: str = Field(
        description="2-3 sentence summary of the document's content and purpose"
    )
    main_topics: list[str] = Field(
        description="3-8 main topics or sections found in the document"
    )
    key_concepts: list[str] = Field(
        description="5-15 key concepts, terms, or entities in the document"
    )
    estimated_lesson_count: int = Field(
        description="Estimated number of course lessons this content could support (1-20)"
    )
    content_depth: str = Field(
        description='Content depth: "basic", "intermediate", or "advanced"'
    )


def create_document_analysis_agent(api_key: str) -> Agent[None, DocumentAnalysis]:
    """Create a document analysis agent with a per-tenant API key."""
    return Agent(
        model=make_model(api_key),
        output_type=DocumentAnalysis,
        system_prompt=(
            "You are a document analyst. Analyze the provided document text and extract "
            "structured metadata. Be concise and accurate.\n\n"
            "For content_depth, use:\n"
            '- "basic": introductory material, high-level overviews\n'
            '- "intermediate": moderate detail, some prerequisite knowledge assumed\n'
            '- "advanced": deep technical detail, expert-level content\n\n'
            "For estimated_lesson_count, consider that each lesson covers one focused topic "
            "and takes 10-20 minutes to complete."
        ),
    )


async def analyze_document(text: str, api_key: str) -> DocumentAnalysis:
    """Analyze a document and return structured metadata.

    Uses the first ~8000 chars to stay within context limits.
    """
    truncated = text[:MAX_ANALYSIS_CHARS]
    agent = create_document_analysis_agent(api_key)
    result = await agent.run(
        f"Analyze this document:\n\n{truncated}",
    )
    return result.output
