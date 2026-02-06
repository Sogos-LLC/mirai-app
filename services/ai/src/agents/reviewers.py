"""Reviewer agents for writer/reviewer delegation.

Each reviewer has a critique-optimized prompt and returns structured feedback.
Writer agents call reviewers as tools via ReviewerRegistry.create_tool().
Usage is capped via UsageLimits(tool_calls_limit=2) on writer agents.

Registry pattern allows clean wiring without circular imports.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic_ai import Agent, NativeOutput, RunContext

from src.models.reviews import ComponentReview, OutlineReview, QuizReview

# ---------------------------------------------------------------------------
# Reviewer agents
# ---------------------------------------------------------------------------

COMPONENT_REVIEWER_SYSTEM = """\
You are a senior instructional designer reviewing a single lesson component.

Evaluate the component against these criteria:
1. **Type Appropriateness**: Is the component type the best choice for this content?
   - TEXT: Brief context (2-3 sentences), not long paragraphs
   - STATEMENT: Key takeaways, definitions — memorable, quotable
   - LIST: Structured information, comparisons, sequential steps
   - CALLOUT: Important tips, warnings, notes — not filler
   - QUIZ: Tests actual learning objectives with plausible distractors
   - HEADING: Clear structure without over-segmenting
   - IMAGE: Visual concepts with descriptive context

2. **Content Depth**: Is it at the right level?
   - Not too shallow (restating the obvious)
   - Not too deep (overwhelming for position in lesson)
   - Appropriate for the stated Bloom's level

3. **Pedagogical Value**: Does this component advance learning?
   - Clear connection to a learning objective
   - Adds value beyond what previous components covered
   - Appropriate cognitive load

Be constructive and specific. Max 3 suggestions, each actionable.
"""

component_reviewer = Agent(
    output_type=NativeOutput(ComponentReview),
    system_prompt=COMPONENT_REVIEWER_SYSTEM,
    name="reviewer-component",
)


OUTLINE_REVIEWER_SYSTEM = """\
You are a senior instructional designer reviewing a course outline.

Evaluate the outline against these criteria:
1. **Logical Flow**: Do sections build on each other?
   - Foundational concepts before applied ones
   - Increasing complexity across sections
   - No jarring topic jumps

2. **Prerequisite Ordering**: Are prerequisites taught first?
   - Concepts used in later sections introduced earlier
   - No forward-dependency problems

3. **Right-Sizing**: Is the course appropriately sized?
   - No padding sections that repeat earlier material
   - No sections so thin they should be merged
   - Topic fully covered without over-engineering

Be constructive and specific. Max 3 suggestions, each actionable.
"""

outline_reviewer = Agent(
    output_type=NativeOutput(OutlineReview),
    system_prompt=OUTLINE_REVIEWER_SYSTEM,
    name="reviewer-outline",
)


QUIZ_REVIEWER_SYSTEM = """\
You are a senior instructional designer reviewing a quiz question.

Evaluate the quiz against these criteria:
1. **Objective Alignment**: Does the quiz test a stated learning objective?
   - Directly assesses knowledge/skill from the lesson
   - Not trivial recall; tests understanding or application

2. **Distractor Quality**: Are wrong answers plausible?
   - Common misconceptions, not obviously wrong
   - Similar structure and length to the correct answer
   - No trick questions or ambiguous wording

3. **Question Clarity**: Is the question well-phrased?
   - Unambiguous — only one correct interpretation
   - Appropriate difficulty for the lesson level
   - No negatives or double negatives

Be constructive and specific. Max 3 suggestions, each actionable.
"""

quiz_reviewer = Agent(
    output_type=NativeOutput(QuizReview),
    system_prompt=QUIZ_REVIEWER_SYSTEM,
    name="reviewer-quiz",
)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------


class ReviewerRegistry:
    """Registry of reviewer agents. Writers look up reviewers by domain.

    Usage:
        # Get a tool function for a writer agent
        review_tool = ReviewerRegistry.create_tool("component")

        # Wire into writer agent
        @writer_agent.tool
        async def review_component(ctx: RunContext[None], content: str) -> str:
            return await review_tool(ctx, content)
    """

    _registry: dict[str, Agent] = {}

    @classmethod
    def register(cls, domain: str, agent: Agent) -> None:
        """Register a reviewer agent for a domain."""
        cls._registry[domain] = agent

    @classmethod
    def get(cls, domain: str) -> Agent:
        """Get the reviewer agent for a domain."""
        if domain not in cls._registry:
            raise KeyError(f"No reviewer registered for domain '{domain}'")
        return cls._registry[domain]

    @classmethod
    def create_tool(cls, domain: str) -> Callable:
        """Create a tool function that delegates to the domain's reviewer.

        Returns a coroutine that accepts (ctx: RunContext, content_to_review: str)
        and returns the reviewer's structured output as a string summary.
        """
        reviewer_agent = cls.get(domain)

        async def _review(ctx: RunContext[Any], content_to_review: str) -> str:
            from src.agents.model import make_model

            # Use same model as parent agent for consistency
            model = make_model(ctx.deps) if isinstance(ctx.deps, str) else None
            result = await reviewer_agent.run(
                content_to_review,
                model=model,
                usage=ctx.usage,
            )
            # Return summary for the writer to incorporate
            output = result.output
            parts = [output.summary]
            if output.suggestions:
                parts.append("Suggestions:")
                for s in output.suggestions:
                    parts.append(f"- {s}")
            return "\n".join(parts)

        return _review


# ---------------------------------------------------------------------------
# Registration
# ---------------------------------------------------------------------------

ReviewerRegistry.register("component", component_reviewer)
ReviewerRegistry.register("outline", outline_reviewer)
ReviewerRegistry.register("quiz", quiz_reviewer)
