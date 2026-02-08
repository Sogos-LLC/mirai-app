"""Agents for the 5-step instructional design wizard.

Each agent produces a validated Pydantic model.
Validation failures trigger regeneration, not user prompts.
"""

from pydantic_ai import WebSearchTool

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.course_design import (
    CourseAnalysis,
    CourseOutcomes,
    CourseStructure,
    Lesson,
    LessonTemplate,
    ExpandedLesson,
    CourseQA,
    SectionOutcomes,
    StructureCoverageScore,
)

# =============================================================================
# STEP 1: Intent Analysis Agent
# =============================================================================

ANALYSIS_SYSTEM = """\
You are a senior instructional designer who analyzes course requirements.
Given a topic, audience, and use context, you produce a structured course analysis
that will guide all subsequent design decisions.

Your analysis must be:
- Specific to the stated audience (not generic)
- Honest about constraints and scope boundaries
- Grounded in instructional design principles (ADDIE, Bloom's)
"""

AgentRegistry.register(AgentSpec(
    name="course-analysis",
    system_prompt=ANALYSIS_SYSTEM,
    output_type=CourseAnalysis,
    category=AgentCategory.COURSE_DESIGN,
    description="Analyzes course requirements and produces structured design analysis.",
    tags=["course-design", "analysis"],
))


RESEARCH_SYSTEM = """\
You are a research assistant preparing background material for an instructional designer.
Given a course topic and audience, search the web for relevant, current information that
would help design a better course. Focus on:
- Key concepts, terminology, and current best practices in the domain
- Common misconceptions or challenges beginners face
- Real-world applications and industry context
- Any recent developments or trends relevant to the topic

Return a concise research summary (3-5 paragraphs) with the most useful findings.
Do NOT design the course — just gather background information.
"""

AgentRegistry.register(AgentSpec(
    name="course-web-research",
    system_prompt=RESEARCH_SYSTEM,
    output_type=str,
    category=AgentCategory.COURSE_DESIGN,
    builtin_tools=[WebSearchTool()],
    description="Searches the web for background material on a course topic.",
    tags=["course-design", "research"],
))


def build_research_prompt(topic: str, audience: str) -> str:
    return f"""\
Research the following topic to prepare background material for course design.

## Course Topic
{topic}

## Target Audience
{audience}

Search the web for current, relevant information about this topic that would help
an instructional designer create an effective course for this audience."""


def _strict_preamble(strict: bool, has_rag: bool) -> str:
    """Return the strict-mode constraint block when applicable."""
    if not strict or not has_rag:
        return ""
    return """\
## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE
**All course content MUST be derived from the provided source material below.**
You are strictly forbidden from adding information not present in the source documents.
If source material is insufficient, narrow the scope rather than inventing content.
Quality and accuracy over quantity. Every claim must be traceable to the source material.

"""


def build_analysis_prompt(
    topic: str,
    audience: str,
    use_context: str,
    rag_context: str = "",
    strict_knowledge_only: bool = False,
    additional_context: str = "",
) -> str:
    strict = _strict_preamble(strict_knowledge_only, bool(rag_context))
    rag = f"\n## Available Knowledge Sources\n{rag_context}\n" if rag_context else ""
    extra = f"\n## Creator's Additional Instructions (HIGH PRIORITY)\n{additional_context}\n" if additional_context else ""
    return f"""\
{strict}## Course Topic
{topic}

## Target Audience
{audience}

## Use Context
{use_context or "Not specified — infer from the topic and audience."}
{extra}{rag}
## Instructions
Analyze this course request and produce:

1. **Purpose Statement**: A clear, specific statement of why this course exists and what
   knowledge/skill gap it fills for this audience. Be concrete, not generic.
   IMPORTANT: Do NOT reference audience personas by name. Use "the target audience" or
   "learners" instead of specific persona names.

2. **Learner Assumptions** (2-6): What do learners already know coming in? Be specific
   about prerequisite skills and knowledge. These set the baseline.

3. **Constraints** (1-5): What will this course explicitly NOT cover? Define the scope
   boundaries. This prevents scope creep and sets expectations.

Base your analysis on the audience description and any available knowledge sources."""


# =============================================================================
# STEP 2: Outcomes Agent
# =============================================================================

OUTCOMES_SYSTEM = """\
You are an expert in Bloom's taxonomy and measurable learning outcomes.
You convert course analyses into concrete, assessable outcomes.

Every outcome must:
- Start with a measurable action verb (NOT 'understand', 'know', 'learn')
- Specify what the learner acts on
- Include a condition or context
- Be verifiably measurable

Use verbs from Bloom's taxonomy:
- Remember: list, recall, identify, name
- Understand: explain, describe, summarize, classify
- Apply: implement, execute, use, demonstrate
- Analyze: compare, contrast, differentiate, examine
- Evaluate: assess, critique, judge, justify
- Create: design, construct, develop, formulate
"""

AgentRegistry.register(AgentSpec(
    name="course-outcomes",
    system_prompt=OUTCOMES_SYSTEM,
    output_type=CourseOutcomes,
    category=AgentCategory.COURSE_DESIGN,
    description="Generates Bloom's taxonomy-aligned learning outcomes from course analysis.",
    tags=["course-design", "outcomes"],
))


def build_outcomes_prompt(
    purpose_statement: str,
    learner_assumptions: list[str],
    constraints: list[str],
    topic: str,
    audience: str,
    rag_context: str = "",
    strict_knowledge_only: bool = False,
    additional_context: str = "",
) -> str:
    assumptions_str = "\n".join(f"- {a}" for a in learner_assumptions)
    constraints_str = "\n".join(f"- {c}" for c in constraints)
    strict = _strict_preamble(strict_knowledge_only, bool(rag_context))
    rag = f"\n## Knowledge Sources\n{rag_context}\n" if rag_context else ""
    extra = f"\n## Creator's Additional Instructions (HIGH PRIORITY)\n{additional_context}\n" if additional_context else ""
    return f"""\
{strict}## Approved Course Analysis
**Topic**: {topic}
**Audience**: {audience}
**Purpose**: {purpose_statement}

**Learner Assumptions**:
{assumptions_str}

**Constraints (out of scope)**:
{constraints_str}
{extra}{rag}
## Instructions
Based on this approved analysis, generate:

1. **Behavior Change**: What observable behavior will change after completing this course?
   Be specific and concrete. This is the "north star" for all content.

2. **Course Goal**: A single sentence capturing the primary goal. Start with
   "Learners will be able to..."

3. **Learning Outcomes** (3-7): Each outcome must have:
   - **verb**: A measurable Bloom's taxonomy verb (NOT understand/know/learn)
   - **object**: What the learner acts on
   - **condition**: Under what circumstances
   - **measurability_check**: How this can be assessed

Outcomes should progress from lower to higher Bloom's levels across the course.
Ensure full coverage of the purpose statement without redundancy."""


# =============================================================================
# STEP 3: Structure Agent
# =============================================================================

STRUCTURE_SYSTEM = """\
You are a curriculum architect who organizes learning outcomes into a logical course structure.
You create sections that group related outcomes and build upon each other progressively.

Principles:
- Each section should have a clear learning arc
- Sections build from foundational to advanced
- Every outcome must be covered by at least one section
- Avoid redundant sections
- 2-10 sections is the sweet spot
"""

AgentRegistry.register(AgentSpec(
    name="course-structure",
    system_prompt=STRUCTURE_SYSTEM,
    output_type=CourseStructure,
    category=AgentCategory.COURSE_DESIGN,
    description="Organizes learning outcomes into logical course sections.",
    tags=["course-design", "structure"],
))


def build_structure_prompt(
    outcomes: CourseOutcomes,
    topic: str,
    audience: str,
    rag_context: str = "",
    strict_knowledge_only: bool = False,
    additional_context: str = "",
) -> str:
    outcomes_str = "\n".join(
        f"- {o.verb} {o.object} ({o.condition})" for o in outcomes.outcomes
    )
    strict = _strict_preamble(strict_knowledge_only, bool(rag_context))
    rag = f"\n## Knowledge Sources\n{rag_context}\n" if rag_context else ""
    extra = f"\n## Creator's Additional Instructions (HIGH PRIORITY)\n{additional_context}\n" if additional_context else ""
    return f"""\
{strict}## Approved Course Outcomes
**Goal**: {outcomes.goal.goal_statement}
**Behavior Change**: {outcomes.behavior_change.description}

**Learning Outcomes**:
{outcomes_str}
{extra}{rag}
## Context
**Topic**: {topic}
**Audience**: {audience}

## Instructions
Group these outcomes into logical course sections.

For each section:
- **title**: A clear, descriptive section title
- **description**: Brief explanation of what this section covers
- **mapped_outcomes**: List the outcome verb+object pairs this section addresses
  (use format "verb object", e.g., "analyze financial statements")

Requirements:
- Every outcome must appear in at least one section
- Sections should progress logically (foundational → advanced)
- 2-10 sections total
- Each section should have 1-4 mapped outcomes
- Avoid single-outcome sections where possible"""


# =============================================================================
# HIDDEN: Structure Coverage Judge
# =============================================================================

STRUCTURE_COVERAGE_SYSTEM = """\
You are an instructional design quality reviewer. Your ONLY job is to check whether
a set of course sections collectively covers ALL required learning outcomes.

You compare SEMANTICALLY, not by exact string match:
- "perform routine maintenance tasks" covers "perform routine mysql server maintenance tasks"
- "identify common errors" covers "identify common mysql error messages"
- "configure database settings" covers "configure mysql server settings"

Set all_covered=true ONLY if every single outcome is clearly addressed by at least
one section's mapped outcomes. If even one outcome has no semantic match, set all_covered=false
and list it in uncovered_outcomes.

Use temperature 0. Be precise and consistent.
"""

AgentRegistry.register(AgentSpec(
    name="structure-coverage-judge",
    system_prompt=STRUCTURE_COVERAGE_SYSTEM,
    output_type=StructureCoverageScore,
    category=AgentCategory.JUDGE,
    description="Validates that all learning outcomes are covered by course sections.",
    tags=["course-design", "judge", "coverage"],
))


def build_structure_coverage_prompt(
    outcomes: CourseOutcomes,
    structure: CourseStructure,
) -> str:
    outcomes_str = "\n".join(
        f"- {o.verb} {o.object}" for o in outcomes.outcomes
    )
    sections_str = ""
    for s in structure.sections:
        mapped = ", ".join(f'"{m}"' for m in s.mapped_outcomes)
        sections_str += f"\n### {s.title}\nMapped outcomes: [{mapped}]\n"

    return f"""\
## Required Learning Outcomes (ALL must be covered)
{outcomes_str}

## Course Sections
{sections_str}

## Instructions
For each required outcome, determine if it is SEMANTICALLY covered by at least one
section's mapped_outcomes. Two strings match if they refer to the same learning action,
even if worded differently.

Return:
- all_covered: true only if EVERY outcome has a semantic match
- uncovered_outcomes: list any outcome "verb object" pairs with no match
- reasoning: brief explanation of your analysis"""


# =============================================================================
# HIDDEN: Section Outcomes Agent
# =============================================================================

SECTION_OUTCOMES_SYSTEM = """\
You are an instructional designer who creates granular section-level outcomes
from course-level outcomes. These are internal artifacts that guide lesson generation.
"""

AgentRegistry.register(AgentSpec(
    name="section-outcomes",
    system_prompt=SECTION_OUTCOMES_SYSTEM,
    output_type=SectionOutcomes,
    category=AgentCategory.COURSE_DESIGN,
    description="Creates granular section-level outcomes from course-level outcomes.",
    tags=["course-design", "outcomes"],
))


def build_section_outcomes_prompt(
    structure: CourseStructure,
    outcomes: CourseOutcomes,
) -> str:
    sections_str = ""
    for s in structure.sections:
        mapped = ", ".join(s.mapped_outcomes)
        sections_str += f"\n### {s.title}\nMapped outcomes: {mapped}\n"

    outcomes_str = "\n".join(
        f"- {o.verb} {o.object} ({o.condition})" for o in outcomes.outcomes
    )
    return f"""\
## Course Structure
{sections_str}

## Course-Level Outcomes
{outcomes_str}

## Instructions
For each section, generate 2-4 granular section-level outcomes.
Each section outcome should:
- Be more specific than the course-level outcome it derives from
- Be achievable within a single section
- Map back to a specific course-level outcome

Return a mapping of section_title → list of SectionOutcome objects.
Each SectionOutcome has:
- description: What learners achieve in this section
- parent_course_outcome: The course-level outcome this derives from (use "verb object" format)"""


# =============================================================================
# STEP 4: Sample Lesson Agent
# =============================================================================

LESSON_SYSTEM = """\
You are an expert content creator who designs engaging, pedagogically sound lessons.
You create complete lessons with diverse content blocks that follow instructional design
best practices.

Lesson structure principles:
- Open with a hook or context-setting introduction
- Present core content in digestible chunks
- Include interactions (quizzes, exercises, reflections)
- Close with a summary and segue
- Vary content types (text, quiz, activity, callout, list)
"""

AgentRegistry.register(AgentSpec(
    name="sample-lesson",
    system_prompt=LESSON_SYSTEM,
    output_type=Lesson,
    category=AgentCategory.COURSE_DESIGN,
    description="Generates a complete sample lesson for template extraction.",
    tags=["course-design", "lesson"],
))


def build_lesson_prompt(
    section_title: str,
    section_outcomes: list[SectionOutcomes] | None,
    course_goal: str,
    topic: str,
    audience: str,
    rag_context: str = "",
    use_context: str = "",
    strict_knowledge_only: bool = False,
    additional_context: str = "",
) -> str:
    outcomes_str = ""
    if section_outcomes:
        for so in section_outcomes:
            for title, sos in so.section_outcomes.items():
                if title == section_title:
                    outcomes_str = "\n".join(f"- {s.description}" for s in sos)
                    break

    strict = _strict_preamble(strict_knowledge_only, bool(rag_context))
    rag = f"\n## Knowledge Sources\n{rag_context}\n" if rag_context else ""
    context = f"\n## Additional Context from Creator\n{use_context}\n" if use_context else ""
    extra = f"\n## Creator's Additional Instructions (HIGH PRIORITY)\n{additional_context}\n" if additional_context else ""
    return f"""\
{strict}## Course Context
**Topic**: {topic}
**Audience**: {audience}
**Course Goal**: {course_goal}

## Section: {section_title}
**Section Outcomes**:
{outcomes_str or "Generate appropriate lesson objectives based on the section title."}
{extra}{rag}{context}
## Instructions
Generate a COMPLETE sample lesson for this section. This lesson will establish
the pattern for all remaining lessons in the course.

The lesson must include:
1. **title**: A specific, engaging lesson title
2. **section_title**: "{section_title}"
3. **objective**: A lesson-level learning objective mapped to a section outcome
4. **strategy**: The instructional strategy (modality, interaction types, practice type)
5. **outline**: Content chunks and their objective mapping
6. **sample_blocks**: 5-12 actual content blocks including:
   - A "heading" block for the lesson title
   - "text" blocks for core content (detailed, educational paragraphs)
   - At least one "quiz" block with a question and answer
   - At least one "activity" or "callout" block
   - A "text" block for the summary/conclusion

Make the content REAL and educational — not placeholder text.
Write as if this is a published course. Match the tone to the audience."""


# =============================================================================
# HIDDEN: Lesson Template Extractor
# =============================================================================

TEMPLATE_SYSTEM = """\
You are an instructional design analyst who extracts reusable patterns from lessons.
Given an approved sample lesson, you identify the template that can be applied to generate
consistent lessons across the entire course.
"""

AgentRegistry.register(AgentSpec(
    name="lesson-template",
    system_prompt=TEMPLATE_SYSTEM,
    output_type=LessonTemplate,
    category=AgentCategory.COURSE_DESIGN,
    description="Extracts reusable lesson template patterns from a sample lesson.",
    tags=["course-design", "template"],
))


def build_template_prompt(lesson: Lesson) -> str:
    blocks_str = "\n".join(
        f"- Block {i+1}: type={b.type}, heading='{b.heading}'"
        for i, b in enumerate(lesson.sample_blocks)
    )
    return f"""\
## Approved Sample Lesson
**Title**: {lesson.title}
**Strategy**: {lesson.strategy.modality}, interactions: {', '.join(lesson.strategy.interaction_types)}

**Block Sequence**:
{blocks_str}

## Instructions
Extract a reusable lesson template from this approved sample:

1. **block_sequence**: The ordered list of block types (e.g., ["heading", "text", "quiz", "activity", "text"])
2. **interaction_rules**: Rules about interactions (e.g., "include at least one quiz per lesson",
   "end with a summary", "open with a hook")
3. **variation_parameters**: What can change between lessons while keeping the same structure
   (e.g., quiz_count: "1-2", practice_type: "varies by section")"""


# =============================================================================
# HIDDEN: Expansion Agent
# =============================================================================

EXPANSION_SYSTEM = """\
You are an expert course content creator. You generate lessons that follow an approved
template pattern while creating unique, educational content for each topic.

You MUST follow the block sequence and interaction rules from the template exactly.
Content should be real, detailed, and pedagogically sound — not placeholder text.
"""

AgentRegistry.register(AgentSpec(
    name="lesson-expansion",
    system_prompt=EXPANSION_SYSTEM,
    output_type=ExpandedLesson,
    category=AgentCategory.COURSE_DESIGN,
    description="Generates lessons following an approved template pattern.",
    tags=["course-design", "expansion"],
))


def build_expansion_prompt(
    section_title: str,
    lesson_title: str,
    lesson_objective: str,
    template: LessonTemplate,
    course_goal: str,
    topic: str,
    audience: str,
    rag_context: str = "",
    strict_knowledge_only: bool = False,
    additional_context: str = "",
) -> str:
    blocks_str = " → ".join(template.block_sequence)
    rules_str = "\n".join(f"- {r}" for r in template.interaction_rules)
    strict = _strict_preamble(strict_knowledge_only, bool(rag_context))
    rag = f"\n## Knowledge Sources\n{rag_context}\n" if rag_context else ""
    extra = f"\n## Creator's Additional Instructions (HIGH PRIORITY)\n{additional_context}\n" if additional_context else ""
    return f"""\
{strict}## Course Context
**Topic**: {topic}
**Audience**: {audience}
**Course Goal**: {course_goal}

## Lesson to Generate
**Section**: {section_title}
**Lesson Title**: {lesson_title}
**Lesson Objective**: {lesson_objective}

## Approved Template
**Block Sequence**: {blocks_str}
**Interaction Rules**:
{rules_str}
{extra}{rag}
## Instructions
Generate a complete lesson following the template EXACTLY.

- Follow the block sequence: {blocks_str}
- Follow all interaction rules
- Write REAL educational content — detailed paragraphs, real examples, practical exercises
- Match the audience level and context
- Include assessments that test the lesson objective
- Add appropriate accessibility tags (e.g., "visual", "text-heavy", "interactive")"""


# =============================================================================
# STEP 5: QA Agent
# =============================================================================

QA_SYSTEM = """\
You are a quality assurance specialist for educational content.
You evaluate courses against instructional design standards and flag issues.

You check for:
- Outcome coverage: every learning outcome must be addressed by at least one lesson
- Redundancy: flag content that's unnecessarily duplicated
- Cognitive load: flag lessons that try to cover too much
- Accessibility: flag content that may not be accessible
"""

AgentRegistry.register(AgentSpec(
    name="course-qa",
    system_prompt=QA_SYSTEM,
    output_type=CourseQA,
    category=AgentCategory.COURSE_DESIGN,
    description="Quality checks course content for outcome coverage, redundancy, and accessibility.",
    tags=["course-design", "qa"],
))


def build_qa_prompt(
    outcomes: CourseOutcomes,
    structure: CourseStructure,
    lesson_titles: list[str],
    total_blocks: int,
) -> str:
    outcomes_str = "\n".join(
        f"- {o.verb} {o.object}" for o in outcomes.outcomes
    )
    structure_str = ""
    for s in structure.sections:
        structure_str += f"\n### {s.title}\n"
        structure_str += f"Mapped outcomes: {', '.join(s.mapped_outcomes)}\n"

    return f"""\
## Course Outcomes
{outcomes_str}

## Course Structure
{structure_str}

## Generated Lessons ({len(lesson_titles)} total, {total_blocks} content blocks)
{chr(10).join(f"- {t}" for t in lesson_titles)}

## Instructions
Evaluate this course and produce a QA report:

1. **outcome_coverage**: For each outcome (use "verb object" as key), is it covered
   by at least one section? Set true/false.

2. **redundancy_flags**: List any sections or lessons that significantly overlap.
   Empty list if no issues.

3. **cognitive_load_flags**: List any lessons that seem to cover too many topics
   (> 5 major concepts). Empty list if no issues.

4. **accessibility_flags**: List any accessibility concerns.
   Empty list if no issues.

Be constructive but honest. Only flag real issues, not hypothetical ones."""
