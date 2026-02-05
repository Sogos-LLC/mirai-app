"""Document analysis and course planning agents."""

import structlog
from pydantic_ai import Agent

from src.agents.model import make_model
from src.models.plan import CoursePlan, DocumentAnalysis

log = structlog.get_logger()

# ---------------------------------------------------------------------------
# Document Analysis Agent
# ---------------------------------------------------------------------------

ANALYZE_DOCUMENT_SYSTEM = """\
You are an expert instructional designer and content analyst.

Your task is to analyze a document that will be used as source material for a course.
Your analysis will guide the course structure, ensuring every section is grounded
in real content.

Produce a structured analysis with:

1. **summary**: A 2-3 paragraph summary of the document's content and purpose.
2. **key_topics**: The major topics/sections found in the document. Use the
   document's own headings and section names where possible.
3. **relevance_score**: Rate relevance to the course goals from 0.0 to 1.0.
4. **section_hints**: For each major topic that could become a course section,
   provide a descriptive name. These must be precise enough to guide course
   structure, not generic.

IMPORTANT: Use the document's exact terminology — product names, technical terms,
procedure names, specific concepts. This precision is critical for later retrieval.
"""

_analyze_document_agent = Agent(
    output_type=DocumentAnalysis,
    system_prompt=ANALYZE_DOCUMENT_SYSTEM,
    name="plan-analyze-doc",
)


async def run_document_analysis(
    *,
    api_key: str,
    source_id: str,
    source_name: str,
    document_text: str,
    course_title: str,
    desired_outcome: str,
) -> DocumentAnalysis:
    """Analyze a single document for course planning."""
    prompt = f"""\
## Course Context
- **Title:** {course_title}
- **Desired Outcome:** {desired_outcome}

## Document to Analyze
- **Name:** {source_name}
- **Source ID:** {source_id}

```
{document_text}
```

Analyze this document and produce a structured analysis as described."""

    result = await _analyze_document_agent.run(
        prompt,
        model=make_model(api_key),
    )

    # Ensure source metadata is set
    analysis = result.output
    analysis.source_id = source_id
    analysis.source_name = source_name

    log.info(
        "document_analyzed",
        source_id=source_id,
        topics=len(analysis.key_topics),
        relevance=analysis.relevance_score,
    )
    return analysis


# ---------------------------------------------------------------------------
# Course Plan Agent
# ---------------------------------------------------------------------------

COURSE_PLAN_SYSTEM = """\
You are an expert instructional designer creating a detailed course plan
from analyzed source documents.

Create a course plan with the following structure:

For each **section**:
- title: Clear section title reflecting the content
- description: What this section covers and why it matters
- source_ids: Which source documents this section draws from
- rationale: Why this section exists and how it connects to source material
- search_terms: 3-8 specific search phrases for retrieving relevant content
  via vector search. Use exact terminology from the document analyses.
- lessons: 2-5 lessons per section

For each **lesson**:
- title: Lesson title
- description: What the lesson covers
- learning_goals: 1-3 measurable goals

CRITICAL: The search_terms are the most important output. They will be used
to query a vector database to retrieve actual source content for each part
of the course. Poor search terms = poor content retrieval = poor course quality.
Use exact document terminology.

Ensure logical progression: introduce fundamentals first, then build complexity.
Group related topics together. Avoid redundancy across sections.
"""

INTERNAL_DATA_ONLY_CONSTRAINT = """\

## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE
**This course MUST be created using ONLY the analyzed source material.**
EVERY section and lesson MUST be directly traceable to the source documents.
Do NOT add topics, examples, or content not found in the sources.
If the material is limited, create a SMALLER course — quality over quantity.
"""

_course_plan_agent = Agent(
    output_type=CoursePlan,
    system_prompt=COURSE_PLAN_SYSTEM,
    name="plan-course-plan",
)


async def run_course_plan(
    *,
    api_key: str,
    course_title: str,
    desired_outcome: str,
    document_analyses: list[DocumentAnalysis],
    internal_data_only: bool = False,
    additional_context: str = "",
) -> CoursePlan:
    """Generate a course plan from document analyses."""
    analyses_text = ""
    for i, analysis in enumerate(document_analyses, 1):
        analyses_text += f"""
### Document {i}: {analysis.source_name}
- **Summary:** {analysis.summary}
- **Key Topics:** {', '.join(analysis.key_topics)}
- **Relevance:** {analysis.relevance_score}
- **Section Hints:** {', '.join(analysis.section_hints)}
"""

    constraint = INTERNAL_DATA_ONLY_CONSTRAINT if internal_data_only else ""

    prompt = f"""\
## Course Information
- **Title:** {course_title}
- **Desired Outcome:** {desired_outcome}
{constraint}

## Document Analyses
{analyses_text}

{f"## Additional Context{chr(10)}{additional_context}" if additional_context else ""}

Create a comprehensive course plan based on the analyzed documents."""

    result = await _course_plan_agent.run(
        prompt,
        model=make_model(api_key),
    )

    plan = result.output
    plan.course_title = course_title
    log.info("course_plan_generated", sections=len(plan.planned_sections))
    return plan
