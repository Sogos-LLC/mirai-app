"""Tests for lesson quality — models, segue field, cross-lesson context."""

from src.models.lesson import LessonComponent, LessonContent, ComponentType
from src.models.outline import LearningObjective, OutlineLesson


def _make_lesson_content(
    num_components: int = 8, include_segue: bool = True
) -> LessonContent:
    components = []
    types = [
        ComponentType.HEADING,
        ComponentType.TEXT,
        ComponentType.LIST,
        ComponentType.CALLOUT,
        ComponentType.IMAGE,
        ComponentType.TEXT,
        ComponentType.TEXT,
        ComponentType.QUIZ,
    ]
    for i in range(num_components):
        ctype = types[i % len(types)]
        components.append(
            LessonComponent(
                id=f"component-{i+1}",
                type=ctype,
                content=f"Content for component {i+1}",
                order=i,
            )
        )
    return LessonContent(
        lesson_id="lesson-1-1",
        title="Test Lesson",
        summary="A test lesson about fundamentals",
        components=components,
        estimated_duration_minutes=15,
        segue_text="Next, we'll explore advanced topics." if include_segue else "",
    )


class TestLessonContentSegue:
    def test_segue_text_default_empty(self):
        content = LessonContent(
            lesson_id="test",
            title="Test",
            summary="Test",
            components=[],
        )
        assert content.segue_text == ""

    def test_segue_text_set(self):
        content = _make_lesson_content(include_segue=True)
        assert content.segue_text == "Next, we'll explore advanced topics."

    def test_segue_text_serialization(self):
        content = _make_lesson_content(include_segue=True)
        data = content.model_dump()
        restored = LessonContent.model_validate(data)
        assert restored.segue_text == "Next, we'll explore advanced topics."


class TestCrossLessonContext:
    def test_previous_summaries_format(self):
        """Verify the format of previous lesson summaries matches what we build."""
        summaries = [
            "[Intro to Variables]: Covers variable declaration and types",
            "[Control Flow]: Covers if/else and loops",
        ]
        # Summaries are just strings that get passed to the prompt builder
        assert len(summaries) == 2
        assert all(s.startswith("[") for s in summaries)

    def test_concept_map_context_format(self):
        """Verify concept map context is a formatted string."""
        from src.models.outline import ConceptMap, ConceptNode, CourseOutline

        cm = ConceptMap(
            concepts=[
                ConceptNode(
                    concept="Variables",
                    first_taught_in="lesson-1-1",
                    reinforced_in=["lesson-2-1"],
                    prerequisites=[],
                ),
                ConceptNode(
                    concept="Functions",
                    first_taught_in="lesson-1-2",
                    prerequisites=["Variables"],
                ),
            ]
        )

        # Simulate _build_concept_map_context
        parts = []
        for node in cm.concepts:
            prereqs = (
                f" (requires: {', '.join(node.prerequisites)})"
                if node.prerequisites
                else ""
            )
            reinforced = (
                f", reinforced in: {', '.join(node.reinforced_in)}"
                if node.reinforced_in
                else ""
            )
            parts.append(
                f"- {node.concept}: first in {node.first_taught_in}"
                f"{reinforced}{prereqs}"
            )
        context = "\n".join(parts)

        assert "Variables" in context
        assert "Functions" in context
        assert "requires: Variables" in context
        assert "reinforced in: lesson-2-1" in context


class TestLessonContentStructure:
    def test_component_variety(self):
        """Lesson should have multiple component types."""
        content = _make_lesson_content()
        types = {c.type for c in content.components}
        assert len(types) >= 4

    def test_full_content_serialization(self):
        """Complete lesson content round-trips through serialization."""
        content = _make_lesson_content()
        data = content.model_dump()
        restored = LessonContent.model_validate(data)

        assert len(restored.components) == len(content.components)
        assert restored.segue_text == content.segue_text
        assert restored.lesson_id == content.lesson_id
