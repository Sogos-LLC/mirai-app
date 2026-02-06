"""Outcome tracking across sections during course generation.

Tracks which learning outcomes have been introduced, practiced, and reinforced
across sections. Provides context to the component agent so it can introduce
pending outcomes, reinforce old ones, and avoid redundancy.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from src.models.course_design import CourseOutcomes, CourseStructure


class OutcomeCoverage(BaseModel):
    """Tracks the coverage status of a single learning outcome."""

    key: str = Field(description="Outcome identifier: 'verb object'")
    full_description: str = Field(description="Full outcome: 'verb object (condition)'")
    status: Literal["pending", "introduced", "practiced", "reinforced"] = "pending"
    introduced_in_lesson: str | None = None
    introduced_in_section_idx: int | None = None
    reinforced_in: list[str] = Field(default_factory=list)
    times_covered: int = 0


class OutcomeTracker(BaseModel):
    """Tracks outcome coverage across all sections during generation."""

    outcomes: list[OutcomeCoverage]

    @classmethod
    def from_course(
        cls, outcomes: CourseOutcomes, structure: CourseStructure,
    ) -> OutcomeTracker:
        """Initialize tracker with all outcomes as pending."""
        coverage = []
        for o in outcomes.outcomes:
            coverage.append(OutcomeCoverage(
                key=f"{o.verb} {o.object}",
                full_description=f"{o.verb} {o.object} ({o.condition})",
            ))
        return cls(outcomes=coverage)

    def pending_for_section(
        self, section_idx: int, mapped_outcomes: list[str],
    ) -> list[OutcomeCoverage]:
        """Outcomes that are pending AND mapped to this section."""
        mapped_lower = {m.lower() for m in mapped_outcomes}
        return [
            o for o in self.outcomes
            if o.status == "pending" and o.key.lower() in mapped_lower
        ]

    def reinforcement_candidates(self, current_section_idx: int) -> list[OutcomeCoverage]:
        """Outcomes introduced 2+ sections ago — candidates for spiral reinforcement."""
        return [
            o for o in self.outcomes
            if o.status in ("introduced", "practiced")
            and o.introduced_in_section_idx is not None
            and current_section_idx - o.introduced_in_section_idx >= 2
        ]

    def recently_covered(self) -> list[str]:
        """Outcome keys covered in the most recent section — avoid repeating."""
        if not self.outcomes:
            return []
        # Find the max section idx among covered outcomes
        max_idx = max(
            (o.introduced_in_section_idx for o in self.outcomes if o.introduced_in_section_idx is not None),
            default=-1,
        )
        if max_idx < 0:
            return []
        return [
            o.key for o in self.outcomes
            if o.introduced_in_section_idx == max_idx and o.times_covered > 0
        ]

    def mark_covered(
        self,
        outcome_keys: list[str],
        section_idx: int,
        lesson_title: str,
    ) -> None:
        """Update tracker after lesson generation."""
        keys_lower = {k.lower() for k in outcome_keys}
        for o in self.outcomes:
            if o.key.lower() in keys_lower:
                o.times_covered += 1
                if o.status == "pending":
                    o.status = "introduced"
                    o.introduced_in_lesson = lesson_title
                    o.introduced_in_section_idx = section_idx
                elif o.status == "introduced":
                    o.status = "practiced"
                    o.reinforced_in.append(lesson_title)
                elif o.status in ("practiced", "reinforced"):
                    o.status = "reinforced"
                    o.reinforced_in.append(lesson_title)

    def summary(self) -> dict[str, list[str]]:
        """Summary of outcome coverage by status."""
        result: dict[str, list[str]] = {
            "pending": [],
            "introduced": [],
            "practiced": [],
            "reinforced": [],
        }
        for o in self.outcomes:
            result[o.status].append(o.key)
        return result
