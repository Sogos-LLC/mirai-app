"""Tests for outline quality — models, concept map, and structural validators."""

from src.models.outline import (
    ConceptMap,
    ConceptNode,
    CourseOutline,
    LearningObjective,
    OutlineLesson,
    OutlineSection,
)


def _make_lesson(lesson_id: str, title: str) -> OutlineLesson:
    return OutlineLesson(
        id=lesson_id,
        title=title,
        description=f"Description for {title}",
        learning_objectives=[
            LearningObjective(description="Objective 1", bloom_level="understand"),
        ],
        estimated_duration_minutes=10,
        key_topics=["topic-a"],
    )


def _make_outline(
    num_sections: int = 3, lessons_per_section: int = 2
) -> CourseOutline:
    sections = []
    for s in range(num_sections):
        lessons = [
            _make_lesson(f"lesson-{s+1}-{l+1}", f"Lesson {s+1}.{l+1}")
            for l in range(lessons_per_section)
        ]
        sections.append(
            OutlineSection(
                id=f"section-{s+1}",
                title=f"Section {s+1}",
                description=f"Description for section {s+1}",
                lessons=lessons,
                order=s + 1,
            )
        )
    return CourseOutline(
        title="Test Course",
        description="A test course",
        target_audience="Beginners",
        sections=sections,
        estimated_total_duration_minutes=num_sections * lessons_per_section * 10,
    )


class TestConceptMap:
    def test_concept_map_creation(self):
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
                    reinforced_in=["lesson-3-1"],
                    prerequisites=["Variables"],
                ),
            ]
        )
        assert len(cm.concepts) == 2
        assert cm.concepts[1].prerequisites == ["Variables"]

    def test_concept_map_on_outline(self):
        outline = _make_outline()
        assert outline.concept_map is None

        outline.concept_map = ConceptMap(
            concepts=[
                ConceptNode(
                    concept="Basics",
                    first_taught_in="lesson-1-1",
                ),
            ]
        )
        assert outline.concept_map is not None
        assert len(outline.concept_map.concepts) == 1

    def test_concept_map_serialization(self):
        cm = ConceptMap(
            concepts=[
                ConceptNode(
                    concept="Test",
                    first_taught_in="lesson-1-1",
                    reinforced_in=["lesson-2-1"],
                    prerequisites=["Other"],
                ),
            ]
        )
        data = cm.model_dump()
        restored = ConceptMap.model_validate(data)
        assert restored.concepts[0].concept == "Test"
        assert restored.concepts[0].prerequisites == ["Other"]


class TestOutlineStructuralFields:
    def test_section_introduction_and_summary(self):
        outline = _make_outline()
        section = outline.sections[0]
        assert section.introduction == ""
        assert section.summary == ""

        section.introduction = "Welcome to section 1"
        section.summary = "We covered the basics"
        assert section.introduction == "Welcome to section 1"
        assert section.summary == "We covered the basics"

    def test_course_conclusion(self):
        outline = _make_outline()
        assert outline.conclusion == ""

        outline.conclusion = "Congratulations on completing the course!"
        assert outline.conclusion == "Congratulations on completing the course!"

    def test_full_outline_serialization(self):
        outline = _make_outline()
        outline.concept_map = ConceptMap(concepts=[
            ConceptNode(concept="X", first_taught_in="lesson-1-1"),
        ])
        outline.conclusion = "Done!"
        outline.sections[0].introduction = "Intro"
        outline.sections[0].summary = "Summary"

        data = outline.model_dump()
        restored = CourseOutline.model_validate(data)

        assert restored.concept_map is not None
        assert len(restored.concept_map.concepts) == 1
        assert restored.conclusion == "Done!"
        assert restored.sections[0].introduction == "Intro"
        assert restored.sections[0].summary == "Summary"


class TestRightSizing:
    def test_small_course_is_valid(self):
        """A 2-section, 3-lesson course should be a valid outline."""
        outline = _make_outline(num_sections=2, lessons_per_section=1)
        assert len(outline.sections) == 2
        total = sum(len(s.lessons) for s in outline.sections)
        assert total == 2

    def test_large_course_within_bounds(self):
        """6 sections with 5 lessons each is the upper bound."""
        outline = _make_outline(num_sections=6, lessons_per_section=5)
        assert len(outline.sections) == 6
        for s in outline.sections:
            assert len(s.lessons) <= 5
