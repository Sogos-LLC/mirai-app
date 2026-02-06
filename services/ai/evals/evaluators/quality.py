"""LLM-based quality evaluators (judges) for AI service outputs.

These evaluators use an LLM to assess subjective quality dimensions that
can't be checked deterministically — pedagogical soundness, audience fit,
content accuracy, etc.

All judges use pydantic-evals LLMJudge with rubrics tuned to our domain.
"""

from pydantic_evals.evaluators import LLMJudge

# ---------------------------------------------------------------------------
# Outline judges
# ---------------------------------------------------------------------------

pedagogy_judge = LLMJudge(
    rubric="""\
Evaluate whether this course outline follows sound instructional design principles:

1. **Logical Progression**: Do sections build on each other? Are prerequisites taught before dependent topics?
2. **Right-Sizing**: Is the course appropriately sized — not padded with filler, not missing key topics?
3. **Bloom's Progression**: Do learning objectives progress from lower-order (remember/understand) in early lessons to higher-order (apply/analyze/evaluate) in later lessons?
4. **Redundancy**: Are there any sections/lessons that substantially overlap in content?
5. **Completeness**: Does the course cover the topic at a depth appropriate for the stated audience?

A passing outline has clear logical flow, appropriate size, and no redundancy.""",
    include_input=True,
    include_expected_output=False,
    model="google-gla:gemini-2.5-flash",
)

audience_judge = LLMJudge(
    rubric="""\
Evaluate whether this course outline is well-suited for its stated target audience:

1. **Appropriate Level**: Is the content pitched at the right level — not too basic, not too advanced?
2. **Relevant Examples**: Would the lesson topics and descriptions resonate with the target audience's experience?
3. **Practical Value**: Would the target audience gain actionable skills from completing this course?
4. **Engagement**: Would the course hold the audience's attention given their background and goals?
5. **Prerequisites**: Are assumed prerequisites reasonable for the audience?

A passing outline is clearly designed with the stated audience in mind.""",
    include_input=True,
    include_expected_output=False,
    model="google-gla:gemini-2.5-flash",
)


# ---------------------------------------------------------------------------
# Lesson judges
# ---------------------------------------------------------------------------

lesson_quality_judge = LLMJudge(
    rubric="""\
Evaluate the quality of this lesson's generated content:

1. **Objective Coverage**: Does the lesson content actually teach each stated learning objective?
2. **Component Variety**: Is there good variety of component types (not just walls of text)?
3. **Depth**: Is content at appropriate depth — not too shallow, not overwhelmingly detailed?
4. **Engagement**: Are interactive elements (quizzes, callouts, statements) used effectively?
5. **Coherence**: Does content flow logically from component to component?

A passing lesson covers its objectives with varied, well-paced content.""",
    include_input=True,
    include_expected_output=False,
    model="google-gla:gemini-2.5-flash",
)

component_alignment_judge = LLMJudge(
    rubric="""\
Evaluate whether each component type is used appropriately in this lesson:

1. **TEXT**: Used for brief context (2-3 sentences), not long paragraphs
2. **STATEMENT**: Used for key takeaways and definitions, not generic text
3. **LIST**: Used for structured information, comparisons, or sequential steps
4. **CALLOUT**: Used for important tips, warnings, or notes — not filler
5. **QUIZ**: Tests the lesson's actual learning objectives with plausible distractors
6. **HEADING**: Provides clear structure without over-segmenting
7. **IMAGE**: Used for visual concepts with descriptive alt text

A passing lesson uses each component type for its intended pedagogical purpose.""",
    include_input=True,
    include_expected_output=False,
    model="google-gla:gemini-2.5-flash",
)
