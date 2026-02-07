"""Wizard agents for course creation — title, outcomes, SME, audience, tone.

Ported from Go backend (gemini/prompts_wizard.go + schemas_wizard.go).
Each agent uses pydantic-ai with per-tenant Gemini API keys.
Orchestration is handled by pydantic-graph (see src/graphs/); this module
only exposes specs, prompt builders, and output validators.

Output validators enforce per-agent structural rules via ModelRetry.
Graph validation nodes handle cross-artifact checks (retry count gating, etc.).
"""

from pydantic_ai import Agent, ModelRetry, RunContext

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.graphs.wizard_utils import (
    BLOOMS_VERBS,
    GENERIC_TITLE_PREFIXES,
    TITLE_CASE_MINOR_WORDS,
    build_rag_section,
    check_exact_count,
    check_in_set,
    check_sentence_count,
    check_unique_values,
    check_word_count,
)
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

VALID_DETAIL_LEVELS: set[str] = {"brief", "moderate", "comprehensive"}

# ---------------------------------------------------------------------------
# Title Agent
# ---------------------------------------------------------------------------

TITLE_SYSTEM = """\
You are an expert course designer who creates compelling course titles and descriptions.
"""


def _attach_title_validator(agent: Agent) -> None:
    @agent.output_validator
    def validate_title(ctx: RunContext[None], output: ImprovedTitleOutput) -> ImprovedTitleOutput:
        """Validate title word count, casing, description length, and generic prefixes."""
        violations: list[str] = []

        v = check_word_count(output.improved_title, 3, 12, "Title")
        if v:
            violations.append(v)

        words = output.improved_title.split()
        for i, word in enumerate(words):
            if i == 0 or i == len(words) - 1:
                if word[0].islower():
                    violations.append(f"Title word '{word}' at position {i} should be capitalized")
            elif word.lower() not in TITLE_CASE_MINOR_WORDS and word[0].islower():
                violations.append(f"Title word '{word}' should be capitalized (Title Case)")

        v = check_sentence_count(output.description, 2, 4, "Description")
        if v:
            violations.append(v)

        title_lower = output.improved_title.lower()
        for prefix in GENERIC_TITLE_PREFIXES:
            if title_lower.startswith(prefix):
                violations.append(f"Title starts with generic filler '{prefix}'")

        if violations:
            raise ModelRetry("Fix these issues:\n" + "\n".join(f"- {v}" for v in violations))

        return output


AgentRegistry.register(
    AgentSpec(
        name="wizard-title",
        system_prompt=TITLE_SYSTEM,
        output_type=ImprovedTitleOutput,
        category=AgentCategory.WIZARD,
        output_retries=2,
        description="Generates improved course titles and descriptions.",
        tags=["wizard", "title"],
    ),
    post_build=[_attach_title_validator],
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


def _parse_outcomes(text: str) -> list[str]:
    """Parse bullet-point outcomes from text."""
    lines = []
    for line in text.strip().split("\n"):
        stripped = line.strip()
        if stripped.startswith("•"):
            stripped = stripped[1:].strip()
        elif stripped.startswith("-"):
            stripped = stripped[1:].strip()
        if stripped:
            lines.append(stripped)
    return lines


def _attach_outcomes_validator(agent: Agent) -> None:
    @agent.output_validator
    def validate_outcomes(ctx: RunContext[None], output: CourseOutcomesOutput) -> CourseOutcomesOutput:
        """Validate outcome count, word length, Bloom's verbs, and uniqueness."""
        violations: list[str] = []
        outcomes = _parse_outcomes(output.outcomes)

        if len(outcomes) < 3:
            violations.append(f"Expected 3-5 outcomes, got {len(outcomes)}")
        elif len(outcomes) > 5:
            violations.append(f"Expected 3-5 outcomes, got {len(outcomes)}")

        starting_verbs: list[str] = []
        for i, outcome in enumerate(outcomes):
            first_word = outcome.split()[0].lower().rstrip(",.:;") if outcome.split() else ""
            if first_word not in BLOOMS_VERBS:
                violations.append(
                    f"Outcome {i + 1} starts with '{first_word}', not a Bloom's taxonomy verb"
                )
            starting_verbs.append(first_word)

        v = check_unique_values(starting_verbs, "Starting verbs")
        if v:
            violations.append(v)

        for i, outcome in enumerate(outcomes):
            v = check_word_count(outcome, 8, 25, f"Outcome {i + 1}")
            if v:
                violations.append(v)

        if violations:
            raise ModelRetry("Fix these issues:\n" + "\n".join(f"- {v}" for v in violations))

        return output


AgentRegistry.register(
    AgentSpec(
        name="wizard-outcomes",
        system_prompt=OUTCOMES_SYSTEM,
        output_type=CourseOutcomesOutput,
        category=AgentCategory.WIZARD,
        output_retries=2,
        description="Generates 3-5 measurable learning outcomes using Bloom's taxonomy verbs.",
        tags=["wizard", "outcomes"],
    ),
    post_build=[_attach_outcomes_validator],
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


def _attach_sme_validator(agent: Agent) -> None:
    @agent.output_validator
    def validate_sme(ctx: RunContext[None], output: SMEPersonasOutput) -> SMEPersonasOutput:
        """Validate SME persona count, uniqueness, skills, and descriptions."""
        violations: list[str] = []

        v = check_exact_count(output.personas, 3, "SME personas")
        if v:
            violations.append(v)

        ids = [p.id for p in output.personas]
        v = check_unique_values(ids, "SME persona IDs")
        if v:
            violations.append(v)

        titles = [p.job_title for p in output.personas]
        v = check_unique_values(titles, "SME job titles")
        if v:
            violations.append(v)

        for p in output.personas:
            if len(p.skills) < 3:
                violations.append(f"SME '{p.id}' has {len(p.skills)} skills; minimum is 3")
            elif len(p.skills) > 5:
                violations.append(f"SME '{p.id}' has {len(p.skills)} skills; maximum is 5")

        for p in output.personas:
            v = check_sentence_count(p.description, 2, 10, f"SME '{p.id}' description")
            if v:
                violations.append(v)

        if violations:
            raise ModelRetry("Fix these issues:\n" + "\n".join(f"- {v}" for v in violations))

        return output


AgentRegistry.register(
    AgentSpec(
        name="wizard-sme",
        system_prompt=SME_SYSTEM,
        output_type=SMEPersonasOutput,
        category=AgentCategory.WIZARD,
        output_retries=2,
        description="Creates 3 diverse SME personas with unique backgrounds and teaching styles.",
        tags=["wizard", "sme"],
    ),
    post_build=[_attach_sme_validator],
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


def _attach_audience_validator(agent: Agent) -> None:
    @agent.output_validator
    def validate_audience(ctx: RunContext[None], output: AudiencePersonasOutput) -> AudiencePersonasOutput:
        """Validate audience persona count, uniqueness, and goals."""
        violations: list[str] = []

        v = check_exact_count(output.personas, 3, "Audience personas")
        if v:
            violations.append(v)

        ids = [p.id for p in output.personas]
        v = check_unique_values(ids, "Audience persona IDs")
        if v:
            violations.append(v)

        roles = [p.role for p in output.personas]
        v = check_unique_values(roles, "Audience persona roles")
        if v:
            violations.append(v)

        names = [p.name for p in output.personas]
        v = check_unique_values(names, "Audience persona names")
        if v:
            violations.append(v)

        for p in output.personas:
            if len(p.goals) < 2:
                violations.append(f"Audience '{p.id}' has {len(p.goals)} goals; minimum is 2")
            elif len(p.goals) > 4:
                violations.append(f"Audience '{p.id}' has {len(p.goals)} goals; maximum is 4")

        if violations:
            raise ModelRetry("Fix these issues:\n" + "\n".join(f"- {v}" for v in violations))

        return output


AgentRegistry.register(
    AgentSpec(
        name="wizard-audience",
        system_prompt=AUDIENCE_SYSTEM,
        output_type=AudiencePersonasOutput,
        category=AgentCategory.WIZARD,
        output_retries=2,
        description="Generates 3 diverse audience personas with learning goals.",
        tags=["wizard", "audience"],
    ),
    post_build=[_attach_audience_validator],
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


def _attach_tone_validator(agent: Agent) -> None:
    @agent.output_validator
    def validate_tone(ctx: RunContext[None], output: ToneOptionsOutput) -> ToneOptionsOutput:
        """Validate tone option count, uniqueness, and detail level coverage."""
        violations: list[str] = []

        v = check_exact_count(output.options, 3, "Tone options")
        if v:
            violations.append(v)

        ids = [o.id for o in output.options]
        v = check_unique_values(ids, "Tone option IDs")
        if v:
            violations.append(v)

        names = [o.name for o in output.options]
        v = check_unique_values(names, "Tone option names")
        if v:
            violations.append(v)

        detail_levels: list[str] = []
        for o in output.options:
            v = check_in_set(o.level_of_detail, VALID_DETAIL_LEVELS, f"Tone '{o.id}' level_of_detail")
            if v:
                violations.append(v)
            detail_levels.append(o.level_of_detail.lower().strip())

        v = check_unique_values(detail_levels, "Tone detail levels")
        if v:
            violations.append(v)

        if violations:
            raise ModelRetry("Fix these issues:\n" + "\n".join(f"- {v}" for v in violations))

        return output


AgentRegistry.register(
    AgentSpec(
        name="wizard-tone",
        system_prompt=TONE_SYSTEM,
        output_type=ToneOptionsOutput,
        category=AgentCategory.WIZARD,
        output_retries=2,
        description="Creates 3 tone/style options with distinct detail levels.",
        tags=["wizard", "tone"],
    ),
    post_build=[_attach_tone_validator],
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
