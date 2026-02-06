"""Wizard agents for course creation — title, outcomes, SME, audience, tone.

Ported from Go backend (gemini/prompts_wizard.go + schemas_wizard.go).
Each agent uses pydantic-ai with per-tenant Gemini API keys.
Orchestration is handled by pydantic-graph (see src/graphs/); this module
only exposes agents and prompt builders.
"""

from pydantic_ai import Agent, NativeOutput

from src.graphs.wizard_utils import build_rag_section
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import (
    AudiencePersona,
    AudiencePersonasOutput,
    ImprovedTitleOutput,
    CourseOutcomesOutput,
    SMEPersona,
    SMEPersonasOutput,
    ToneOptionsOutput,
)

# ---------------------------------------------------------------------------
# Title Agent
# ---------------------------------------------------------------------------

TITLE_SYSTEM = """\
You are an expert course designer who creates compelling course titles and descriptions.
"""

title_agent = Agent(
    output_type=NativeOutput(ImprovedTitleOutput),
    system_prompt=TITLE_SYSTEM,
    name="wizard-title",
)


def build_title_prompt(
    course_name: str,
    rag_chunks: list[KnowledgeChunk] | None = None,
) -> str:
    rag = build_rag_section(rag_chunks)
    return f"""\
## Original Course Name
{course_name}
{rag}
## Instructions
Based on the course name provided, create:

1. **Improved Title**: A polished, professional course title that:
   - Is clear and specific about what learners will learn
   - Is engaging and motivating
   - Uses proper capitalization (Title Case)
   - Is concise (typically 3-12 words)
   - Avoids jargon unless the topic requires it
   - Does NOT start with generic filler like "Introduction to", "A Course About", "Learn About"

2. **Description**: A compelling 2-4 sentence course description that:
   - Clearly states what the course covers
   - Highlights the key benefits for learners
   - Sets appropriate expectations for the content
   - Uses active, engaging language

Keep the improved title close to the original intent, but make it more professional and marketable."""


# ---------------------------------------------------------------------------
# Outcomes Agent
# ---------------------------------------------------------------------------

OUTCOMES_SYSTEM = """\
You are an expert instructional designer who creates measurable learning outcomes \
for professional courses.
"""

outcomes_agent = Agent(
    output_type=NativeOutput(CourseOutcomesOutput),
    system_prompt=OUTCOMES_SYSTEM,
    name="wizard-outcomes",
)


def build_outcomes_prompt(
    course_name: str,
    rag_chunks: list[KnowledgeChunk] | None = None,
) -> str:
    parts: list[str] = []

    parts.append(f"## Course Topic\n{course_name}\n")

    if rag_chunks:
        parts.append(build_rag_section(rag_chunks))

    parts.append("""\
## Instructions
Generate 3-5 clear, measurable learning outcomes for this course. Each outcome should:

1. Start with an action verb from Bloom's Taxonomy (e.g., Understand, Apply, Analyze, Create, Evaluate)
2. Be specific and measurable
3. Describe what the learner will be able to DO after completing the course
4. Be achievable within a typical course duration
5. Be 8-25 words long
6. Use a DIFFERENT starting verb for each outcome""")

    if rag_chunks:
        parts.append(
            "7. Be informed by the reference materials provided above\n"
            "8. Reflect the specific topics, concepts, and skills covered in the source materials"
        )

    parts.append("""\

Format your response as bullet points, with each outcome on a new line starting with "• ".

Example format:
• Understand the fundamental concepts of [topic] and their applications
• Apply [skill] techniques to solve real-world problems
• Analyze [subject] scenarios and identify key patterns
• Create effective [deliverable] using industry best practices
• Evaluate [outcomes] and make data-driven decisions

Generate outcomes that are relevant, practical, and aligned with professional development goals.""")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# SME Personas Agent
# ---------------------------------------------------------------------------

SME_SYSTEM = """\
You are an expert instructional designer creating subject matter expert (SME) \
personas for a course.
"""

sme_agent = Agent(
    output_type=NativeOutput(SMEPersonasOutput),
    system_prompt=SME_SYSTEM,
    name="wizard-sme",
)


def build_sme_prompt(
    title: str,
    description: str,
    rag_chunks: list[KnowledgeChunk] | None = None,
) -> str:
    rag = build_rag_section(rag_chunks)
    return f"""\
## Course Information
**Title:** {title}
**Description:** {description}
{rag}
## Instructions
Generate 3 diverse SME personas who could teach this course. Each persona should:

1. Have a unique professional background and expertise angle
2. Bring different perspectives to the subject matter
3. Have distinct teaching styles that would appeal to different learners
4. Have a unique job title (no duplicates)
5. Have 3-5 key skills
6. Have a 2+ sentence description of their background

Make the personas realistic and specific to the course topic. Consider:
- Different career paths that lead to expertise in this area
- Varying years of experience and specializations
- Different industries or contexts where this knowledge applies

The personas should complement each other, covering different aspects of the course material from different angles."""


# ---------------------------------------------------------------------------
# Audience Personas Agent
# ---------------------------------------------------------------------------

AUDIENCE_SYSTEM = """\
You are an expert instructional designer creating target audience personas for a course.
"""

audience_agent = Agent(
    output_type=NativeOutput(AudiencePersonasOutput),
    system_prompt=AUDIENCE_SYSTEM,
    name="wizard-audience",
)


def build_audience_prompt(
    title: str,
    description: str,
    sme_personas: list[SMEPersona],
    rag_chunks: list[KnowledgeChunk] | None = None,
) -> str:
    parts: list[str] = []

    parts.append(f"## Course Information\n**Title:** {title}\n**Description:** {description}\n")

    if rag_chunks:
        parts.append(build_rag_section(rag_chunks))

    if sme_personas:
        parts.append("## Subject Matter Experts Teaching This Course")
        for sme in sme_personas:
            parts.append(f"- **{sme.job_title}**: {sme.description}")
        parts.append("")

    parts.append("""\
## Instructions
Generate 3 diverse audience personas who would benefit from this course. Each persona should:

1. Have a distinct background and current role (all roles must be unique)
2. Have different motivations for taking the course
3. Represent different experience levels (e.g., beginner, intermediate, career-changer)
4. Have a unique name
5. Have 2-4 learning goals

Make the personas realistic and relatable. Consider:
- Different career stages (early career, mid-career, transitioning)
- Different industries or contexts
- Different learning goals and motivations
- What challenges they face that this course would address

Each persona should feel like a real person with specific goals and challenges.""")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Tone Options Agent
# ---------------------------------------------------------------------------

TONE_SYSTEM = """\
You are an expert instructional designer creating tone and style options for a course.
"""

tone_agent = Agent(
    output_type=NativeOutput(ToneOptionsOutput),
    system_prompt=TONE_SYSTEM,
    name="wizard-tone",
)


def build_tone_prompt(
    title: str,
    description: str,
    audience_personas: list[AudiencePersona],
    rag_chunks: list[KnowledgeChunk] | None = None,
) -> str:
    parts: list[str] = []

    parts.append(f"## Course Information\n**Title:** {title}\n**Description:** {description}\n")

    if rag_chunks:
        parts.append(build_rag_section(rag_chunks))

    if audience_personas:
        parts.append("## Target Audience")
        for p in audience_personas:
            parts.append(f"- **{p.name}** ({p.role}): {p.description}")
        parts.append("")

    parts.append("""\
## Instructions
Generate 3 distinct tone/style options for this course. Each option should:

1. Have a clear, descriptive name (e.g., "Quick Start Guide", "Deep Dive", "Hands-on Workshop")
2. Define a specific teaching approach and content depth
3. Each option MUST have a different level_of_detail value. Use exactly one of each:
   - "brief": Concise, focused on essentials, quick to complete
   - "moderate": Balanced coverage, includes examples and practice
   - "comprehensive": In-depth, thorough explanations, extensive practice

The options should offer meaningful variety:
- One focused on practical, quick application (brief)
- One balanced for general learning (moderate)
- One thorough for deep understanding (comprehensive)

Consider what tone would best serve the target audience's goals.""")

    return "\n".join(parts)
