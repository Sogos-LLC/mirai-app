"""Temporal activities for course planning (document analysis + course plan)."""

from pydantic import BaseModel, Field

import structlog
from temporalio import activity

from src.models.plan import CoursePlan, DocumentAnalysis

log = structlog.get_logger()


class AnalyzeDocumentInput(BaseModel):
    """Input for document analysis activity."""

    api_key: str
    source_id: str
    source_name: str
    document_text: str
    course_title: str
    desired_outcome: str


class AnalyzeDocumentOutput(BaseModel):
    """Output from document analysis activity."""

    analysis: DocumentAnalysis


@activity.defn
async def analyze_document(input: AnalyzeDocumentInput) -> AnalyzeDocumentOutput:
    """Analyze a document for course planning."""
    from src.agents.plan_agent import run_document_analysis

    activity.heartbeat(f"analyzing {input.source_name}")

    analysis = await run_document_analysis(
        api_key=input.api_key,
        source_id=input.source_id,
        source_name=input.source_name,
        document_text=input.document_text,
        course_title=input.course_title,
        desired_outcome=input.desired_outcome,
    )

    return AnalyzeDocumentOutput(analysis=analysis)


class GenerateCoursePlanInput(BaseModel):
    """Input for course plan generation activity."""

    api_key: str
    course_title: str
    desired_outcome: str
    document_analyses: list[DocumentAnalysis] = Field(default_factory=list)
    internal_data_only: bool = False
    additional_context: str = ""


class GenerateCoursePlanOutput(BaseModel):
    """Output from course plan generation activity."""

    plan: CoursePlan


@activity.defn
async def generate_course_plan(
    input: GenerateCoursePlanInput,
) -> GenerateCoursePlanOutput:
    """Generate a course plan from document analyses."""
    from src.agents.plan_agent import run_course_plan

    activity.heartbeat("generating course plan")

    plan = await run_course_plan(
        api_key=input.api_key,
        course_title=input.course_title,
        desired_outcome=input.desired_outcome,
        document_analyses=input.document_analyses,
        internal_data_only=input.internal_data_only,
        additional_context=input.additional_context,
    )

    return GenerateCoursePlanOutput(plan=plan)
