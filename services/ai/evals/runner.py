"""Eval runner — turnkey evaluation of outline and lesson generation pipelines.

Usage:
    # Run all evaluations (requires GEMINI_API_KEY)
    cd services/ai && python -m evals.runner

    # Run only structural evals (no API key needed)
    cd services/ai && python -m evals.runner --structural-only

    # Run with captured outputs (offline, no generation)
    cd services/ai && python -m evals.runner --from-captures

    # Capture real outputs for offline eval
    cd services/ai && python -m evals.runner --capture
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pydantic_evals import Case, Dataset

from evals.evaluators.structural import (
    BloomVerbCheck,
    ComponentDiversityCheck,
    OutcomeCoverageCheck,
    SectionCountCheck,
)

EVALS_DIR = Path(__file__).parent
DATASETS_DIR = EVALS_DIR / "datasets"
CAPTURES_DIR = EVALS_DIR / "captures"


# ---------------------------------------------------------------------------
# Dataset loaders — build typed Datasets from YAML case definitions
# ---------------------------------------------------------------------------


def _load_yaml(path: Path) -> dict:
    """Load a YAML file as a dict. Uses pydantic-evals' built-in YAML support."""
    import yaml

    with open(path) as f:
        return yaml.safe_load(f)


def load_outline_dataset() -> Dataset[dict, Any, dict]:
    """Load outline evaluation dataset with structural evaluators."""
    raw = _load_yaml(DATASETS_DIR / "outline_eval.yaml")
    cases: list[Case[dict, Any, dict]] = []
    for c in raw["cases"]:
        cases.append(
            Case(
                name=c["name"],
                inputs=c["inputs"],
                metadata=c.get("metadata"),
            )
        )
    return Dataset(
        name="outline_structural",
        cases=cases,
        evaluators=(
            SectionCountCheck(),
            BloomVerbCheck(),
            OutcomeCoverageCheck(),
        ),
    )


def load_lesson_dataset() -> Dataset[dict, Any, dict]:
    """Load lesson evaluation dataset with structural evaluators."""
    raw = _load_yaml(DATASETS_DIR / "lesson_eval.yaml")
    cases: list[Case[dict, Any, dict]] = []
    for c in raw["cases"]:
        cases.append(
            Case(
                name=c["name"],
                inputs=c["inputs"],
                metadata=c.get("metadata"),
            )
        )
    return Dataset(
        name="lesson_structural",
        cases=cases,
        evaluators=(ComponentDiversityCheck(),),
    )


def load_outline_quality_dataset() -> Dataset[dict, Any, dict]:
    """Load outline dataset with LLM quality judges."""
    from evals.evaluators.quality import audience_judge, pedagogy_judge

    raw = _load_yaml(DATASETS_DIR / "outline_eval.yaml")
    cases: list[Case[dict, Any, dict]] = []
    for c in raw["cases"]:
        cases.append(
            Case(
                name=c["name"],
                inputs=c["inputs"],
                metadata=c.get("metadata"),
            )
        )
    return Dataset(
        name="outline_quality",
        cases=cases,
        evaluators=(
            SectionCountCheck(),
            BloomVerbCheck(),
            OutcomeCoverageCheck(),
            pedagogy_judge,
            audience_judge,
        ),
    )


def load_lesson_quality_dataset() -> Dataset[dict, Any, dict]:
    """Load lesson dataset with LLM quality judges."""
    from evals.evaluators.quality import (
        component_alignment_judge,
        lesson_quality_judge,
    )

    raw = _load_yaml(DATASETS_DIR / "lesson_eval.yaml")
    cases: list[Case[dict, Any, dict]] = []
    for c in raw["cases"]:
        cases.append(
            Case(
                name=c["name"],
                inputs=c["inputs"],
                metadata=c.get("metadata"),
            )
        )
    return Dataset(
        name="lesson_quality",
        cases=cases,
        evaluators=(
            ComponentDiversityCheck(),
            lesson_quality_judge,
            component_alignment_judge,
        ),
    )


# ---------------------------------------------------------------------------
# Task functions — generate outputs from AI pipeline
# ---------------------------------------------------------------------------


async def generate_outline(inputs: dict) -> Any:
    """Generate a course outline using the full pipeline.

    This calls the actual outline generation graph with real Gemini API calls.
    """
    import os

    from src.agents.outline_agent import (
        SectionsOnlyOutput,
        assemble_outline,
        generate_lesson_details,
        generate_sections,
    )

    api_key = os.environ["GEMINI_API_KEY"]

    sections_output: SectionsOnlyOutput = await generate_sections(
        api_key=api_key,
        course_title=inputs["course_title"],
        desired_outcome=inputs["desired_outcome"],
        desired_outcomes=inputs["desired_outcomes"],
        personas=[],
        target_audience=[],
    )

    lesson_details = {}
    for i, section in enumerate(sections_output.sections):
        lessons = await generate_lesson_details(
            api_key=api_key,
            course_title=inputs["course_title"],
            desired_outcome=inputs["desired_outcome"],
            section=section,
            section_index=i,
            target_audience=[],
            personas=[],
        )
        lesson_details[i] = lessons

    return assemble_outline(sections_output, lesson_details)


async def generate_lesson(inputs: dict) -> Any:
    """Generate lesson content using the full pipeline."""
    import os

    from src.graphs.lesson_graph import run_lesson_graph
    from src.models.outline import LearningObjective, OutlineLesson

    api_key = os.environ["GEMINI_API_KEY"]

    objectives = [
        LearningObjective(
            description=obj["description"],
            bloom_level=obj.get("bloom_level", "understand"),
        )
        for obj in inputs["learning_objectives"]
    ]

    lesson_meta = OutlineLesson(
        id="eval-lesson-1",
        title=inputs["lesson_title"],
        description=inputs["lesson_description"],
        learning_objectives=objectives,
        estimated_duration_minutes=15,
        key_topics=inputs.get("key_topics", []),
    )

    content, _chunks = await run_lesson_graph(
        api_key=api_key,
        lesson=lesson_meta,
        course_title=inputs["course_title"],
        course_context="",
        section_title=inputs["section_title"],
        section_index=inputs.get("section_index", 0),
        lesson_index=inputs.get("lesson_index", 0),
        personas=[],
    )

    return content


# ---------------------------------------------------------------------------
# Capture / load captures
# ---------------------------------------------------------------------------


def capture_output(name: str, inputs: dict, output: Any) -> None:
    """Save a real pipeline output for offline evaluation."""
    CAPTURES_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = CAPTURES_DIR / f"{name}_{timestamp}.json"

    data = {
        "name": name,
        "inputs": inputs,
        "output": output.model_dump() if hasattr(output, "model_dump") else output,
        "captured_at": timestamp,
    }

    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)

    print(f"Captured: {path}")


def load_captures(prefix: str) -> list[dict]:
    """Load captured outputs matching a prefix."""
    captures = []
    for path in sorted(CAPTURES_DIR.glob(f"{prefix}_*.json")):
        with open(path) as f:
            captures.append(json.load(f))
    return captures


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------


class EvalRunner:
    """Turnkey eval runner. Hides dataset loading, evaluator composition, reporting."""

    def __init__(self, *, structural_only: bool = False):
        self.structural_only = structural_only

    async def evaluate_outlines(
        self, task=None
    ) -> Any:
        """Run outline evaluations."""
        if self.structural_only:
            dataset = load_outline_dataset()
        else:
            dataset = load_outline_quality_dataset()

        task_fn = task or generate_outline
        report = await dataset.evaluate(task_fn, name="outline_eval")
        return report

    async def evaluate_lessons(
        self, task=None
    ) -> Any:
        """Run lesson evaluations."""
        if self.structural_only:
            dataset = load_lesson_dataset()
        else:
            dataset = load_lesson_quality_dataset()

        task_fn = task or generate_lesson
        report = await dataset.evaluate(task_fn, name="lesson_eval")
        return report

    async def evaluate_all(self) -> dict[str, Any]:
        """Run all evaluations and return reports."""
        reports = {}

        print("\n=== Outline Evaluation ===\n")
        outline_report = await self.evaluate_outlines()
        outline_report.print(include_input=False, include_output=False)
        reports["outline"] = outline_report

        print("\n=== Lesson Evaluation ===\n")
        lesson_report = await self.evaluate_lessons()
        lesson_report.print(include_input=False, include_output=False)
        reports["lesson"] = lesson_report

        return reports

    async def capture_all(self) -> None:
        """Generate real outputs and capture them for offline eval."""
        dataset_raw = _load_yaml(DATASETS_DIR / "outline_eval.yaml")
        for case in dataset_raw["cases"]:
            print(f"Generating outline: {case['name']}...")
            output = await generate_outline(case["inputs"])
            capture_output(f"outline_{case['name']}", case["inputs"], output)

        dataset_raw = _load_yaml(DATASETS_DIR / "lesson_eval.yaml")
        for case in dataset_raw["cases"]:
            print(f"Generating lesson: {case['name']}...")
            output = await generate_lesson(case["inputs"])
            capture_output(f"lesson_{case['name']}", case["inputs"], output)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run AI service evaluations",
        prog="python -m evals.runner",
    )
    parser.add_argument(
        "--structural-only",
        action="store_true",
        help="Run only deterministic structural checks (no API key needed for evaluators, still needed for generation)",
    )
    parser.add_argument(
        "--capture",
        action="store_true",
        help="Generate real outputs and save to captures/ for offline eval",
    )
    parser.add_argument(
        "--from-captures",
        action="store_true",
        help="Run evaluations using captured outputs (no generation)",
    )
    args = parser.parse_args()

    if args.from_captures:
        print("Running from captures is not yet implemented.")
        print("Use --capture first to generate outputs, then evaluate them.")
        sys.exit(1)

    runner = EvalRunner(structural_only=args.structural_only)

    if args.capture:
        asyncio.run(runner.capture_all())
    else:
        asyncio.run(runner.evaluate_all())


if __name__ == "__main__":
    main()
