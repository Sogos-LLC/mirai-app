"""Deterministic structural evaluators for AI service outputs.

These evaluators check hard constraints that must always hold — section counts,
Bloom's verb usage, component diversity, and outcome coverage. They run without
any LLM calls and are fast + reproducible.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from pydantic_evals.evaluators import Evaluator, EvaluatorContext

from src.graphs.wizard_utils import BLOOMS_VERBS
from src.models.lesson import ComponentType, LessonContent
from src.models.outline import CourseOutline


# ---------------------------------------------------------------------------
# Outline evaluators
# ---------------------------------------------------------------------------


@dataclass
class SectionCountCheck(Evaluator[Any, CourseOutline, Any]):
    """Check that an outline has a reasonable number of sections and lessons.

    Default bounds: 2-6 sections, 2-5 lessons per section.
    """

    min_sections: int = 2
    max_sections: int = 6
    min_lessons_per_section: int = 2
    max_lessons_per_section: int = 5

    def evaluate(
        self, ctx: EvaluatorContext[Any, CourseOutline, Any]
    ) -> dict[str, bool | str]:
        outline = ctx.output
        n = len(outline.sections)

        section_ok = self.min_sections <= n <= self.max_sections
        lesson_issues: list[str] = []
        for section in outline.sections:
            lc = len(section.lessons)
            if lc < self.min_lessons_per_section:
                lesson_issues.append(
                    f"Section '{section.title}' has {lc} lessons (min {self.min_lessons_per_section})"
                )
            elif lc > self.max_lessons_per_section:
                lesson_issues.append(
                    f"Section '{section.title}' has {lc} lessons (max {self.max_lessons_per_section})"
                )

        lessons_ok = len(lesson_issues) == 0
        return {
            "section_count_ok": section_ok,
            "lesson_counts_ok": lessons_ok,
            "issues": "; ".join(lesson_issues) if lesson_issues else "",
        }


@dataclass
class BloomVerbCheck(Evaluator[Any, CourseOutline, Any]):
    """Check that every learning objective starts with a Bloom's taxonomy verb."""

    def evaluate(
        self, ctx: EvaluatorContext[Any, CourseOutline, Any]
    ) -> dict[str, bool | float | str]:
        outline = ctx.output
        total = 0
        valid = 0
        bad_verbs: list[str] = []

        for section in outline.sections:
            for lesson in section.lessons:
                for obj in lesson.learning_objectives:
                    total += 1
                    first_word = obj.description.split()[0].lower().rstrip(",.:;")
                    if first_word in BLOOMS_VERBS:
                        valid += 1
                    else:
                        bad_verbs.append(
                            f"'{first_word}' in lesson '{lesson.title}'"
                        )

        ratio = valid / total if total > 0 else 0.0
        return {
            "bloom_verb_ratio": ratio,
            "all_blooms": ratio == 1.0,
            "bad_verbs": "; ".join(bad_verbs[:5]) if bad_verbs else "",
        }


@dataclass
class OutcomeCoverageCheck(Evaluator[Any, CourseOutline, dict]):
    """Check that every desired outcome is addressed by at least one lesson.

    Expects metadata to contain `desired_outcomes: list[str]`.
    Uses simple keyword overlap as a proxy for coverage.
    """

    min_keyword_overlap: int = 2

    def evaluate(
        self, ctx: EvaluatorContext[Any, CourseOutline, dict]
    ) -> dict[str, bool | float | str]:
        outline = ctx.output
        metadata = ctx.metadata or {}
        desired_outcomes: list[str] = metadata.get("desired_outcomes", [])

        if not desired_outcomes:
            return {
                "outcome_coverage": 1.0,
                "all_outcomes_covered": True,
                "uncovered": "",
            }

        # Collect all lesson-level text for keyword matching
        lesson_texts: list[str] = []
        for section in outline.sections:
            for lesson in section.lessons:
                parts = [lesson.title.lower(), lesson.description.lower()]
                for obj in lesson.learning_objectives:
                    parts.append(obj.description.lower())
                for topic in lesson.key_topics:
                    parts.append(topic.lower())
                lesson_texts.append(" ".join(parts))

        all_lesson_text = " ".join(lesson_texts)

        covered = 0
        uncovered: list[str] = []
        for outcome in desired_outcomes:
            outcome_words = {
                w.lower().rstrip(",.:;")
                for w in outcome.split()
                if len(w) > 3  # skip short words
            }
            matching = sum(1 for w in outcome_words if w in all_lesson_text)
            if matching >= self.min_keyword_overlap:
                covered += 1
            else:
                uncovered.append(outcome[:60])

        ratio = covered / len(desired_outcomes)
        return {
            "outcome_coverage": ratio,
            "all_outcomes_covered": ratio == 1.0,
            "uncovered": "; ".join(uncovered) if uncovered else "",
        }


# ---------------------------------------------------------------------------
# Lesson evaluators
# ---------------------------------------------------------------------------


@dataclass
class ComponentDiversityCheck(Evaluator[Any, LessonContent, Any]):
    """Check that a lesson uses enough component types and follows structural rules.

    Checks:
    - Minimum unique component types (default 4)
    - QUIZ is last component
    - No consecutive HEADINGs or IMAGEs
    - First component is HEADING
    - At least one STATEMENT or CALLOUT
    - Maximum IMAGE count
    """

    min_types: int = 4
    max_images: int = 3

    def evaluate(
        self, ctx: EvaluatorContext[Any, LessonContent, Any]
    ) -> dict[str, bool | int | str]:
        content = ctx.output
        components = content.components
        issues: list[str] = []

        # Type diversity
        types = {c.type for c in components}
        type_count = len(types)
        if type_count < self.min_types:
            issues.append(f"Only {type_count} types (need {self.min_types}+)")

        # QUIZ last
        quiz_indices = [
            i for i, c in enumerate(components) if c.type == ComponentType.QUIZ
        ]
        if quiz_indices and quiz_indices[-1] != len(components) - 1:
            issues.append("QUIZ is not the last component")
        if len(quiz_indices) > 1:
            issues.append(f"Multiple QUIZs ({len(quiz_indices)})")

        # Consecutive check
        for i in range(len(components) - 1):
            if (
                components[i].type == ComponentType.HEADING
                and components[i + 1].type == ComponentType.HEADING
            ):
                issues.append(f"Consecutive HEADINGs at {i},{i + 1}")
            if (
                components[i].type == ComponentType.IMAGE
                and components[i + 1].type == ComponentType.IMAGE
            ):
                issues.append(f"Consecutive IMAGEs at {i},{i + 1}")

        # First is HEADING
        if components and components[0].type != ComponentType.HEADING:
            issues.append(
                f"First component is {components[0].type.value}, not HEADING"
            )

        # Emphasis
        has_emphasis = any(
            c.type in (ComponentType.STATEMENT, ComponentType.CALLOUT)
            for c in components
        )
        if not has_emphasis:
            issues.append("No STATEMENT or CALLOUT for emphasis")

        # Image count
        image_count = sum(
            1 for c in components if c.type == ComponentType.IMAGE
        )
        if image_count > self.max_images:
            issues.append(f"{image_count} IMAGEs (max {self.max_images})")

        return {
            "type_diversity_ok": type_count >= self.min_types,
            "unique_types": type_count,
            "structural_ok": len(issues) == 0,
            "issues": "; ".join(issues) if issues else "",
        }
