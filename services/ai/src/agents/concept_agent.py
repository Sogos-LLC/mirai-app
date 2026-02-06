"""Concept map agent — generates cross-lesson concept progression from outline."""

from pydantic_ai import Agent, NativeOutput

from src.agents.model import make_model
from src.models.outline import ConceptMap, CourseOutline


CONCEPT_MAP_SYSTEM = """\
You are an instructional designer creating a concept progression map for a course.

For each key concept in the course, identify:
- **concept**: A concise name for the concept
- **first_taught_in**: The lesson ID where this concept is first introduced
- **reinforced_in**: Lesson IDs where this concept is revisited or applied
- **prerequisites**: Names of other concepts that must be learned before this one

Guidelines:
- Extract 5-15 key concepts (not every minor topic, just the important ones)
- Prerequisites must reference other concepts in your list
- Early lessons should have few/no prerequisites
- Later lessons should build on earlier concepts
- A concept can be reinforced in multiple later lessons
"""

concept_map_agent = Agent(
    output_type=NativeOutput(ConceptMap),
    system_prompt=CONCEPT_MAP_SYSTEM,
    name="concept-map",
)


def _build_concept_map_prompt(outline: CourseOutline) -> str:
    """Build the prompt for concept map generation."""
    parts: list[str] = []

    parts.append(f"## Course: {outline.title}")
    parts.append(f"**Description:** {outline.description}")

    parts.append(f"\n## Course Structure ({len(outline.sections)} sections)")
    for section in outline.sections:
        parts.append(f"\n### Section {section.order}: {section.title}")
        parts.append(f"  {section.description}")
        for lesson in section.lessons:
            parts.append(f"  - **{lesson.id}** — {lesson.title}")
            parts.append(f"    {lesson.description}")
            if lesson.key_topics:
                parts.append(f"    Topics: {', '.join(lesson.key_topics)}")
            for obj in lesson.learning_objectives:
                parts.append(
                    f"    Objective: {obj.description} [{obj.bloom_level}]"
                )

    parts.append(
        "\nGenerate a concept map identifying the key concepts and their "
        "progression through these lessons."
    )
    return "\n".join(parts)


async def generate_concept_map(
    *, api_key: str, outline: CourseOutline
) -> ConceptMap:
    """Generate a concept progression map from a course outline."""
    prompt = _build_concept_map_prompt(outline)
    result = await concept_map_agent.run(prompt, model=make_model(api_key))
    return result.output
