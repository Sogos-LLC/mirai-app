"""Integration tests for agent migration to AgentRegistry.

Verifies that importing src.agents triggers all registrations
and that every expected agent can be retrieved.
"""

import pytest
from pydantic_ai import Agent

from src.agents.registry import AgentCategory, AgentRegistry

# Expected agents by category after full registration
EXPECTED_AGENTS = {
    # Wizard agents (5)
    "wizard-title",
    "wizard-outcomes",
    "wizard-sme",
    "wizard-audience",
    "wizard-tone",
    # Course design agents (10)
    "course-analysis",
    "course-web-research",
    "course-outcomes",
    "course-structure",
    "course-structure-coverage-judge",
    "course-section-outcomes",
    "course-lesson",
    "course-template",
    "course-expansion",
    "course-qa",
    # Outline agents (3)
    "outline-sections-gen",
    "outline-sections-internal",
    "outline-lesson-detail",
    # Lesson agents (5)
    "lesson-component-plan",
    "lesson-gap-analysis",
    "lesson-targeted-research",
    "lesson-component-gen",
    "lesson-segue",
    # Reviewers (3)
    "reviewer-component",
    "reviewer-outline",
    "reviewer-quiz",
    # Component generation (1)
    "component-generator",
    # Section QA (1)
    "section-qa-judge",
    # Component regen (1)
    "component-regen",
    # Planning (2)
    "plan-analyze-doc",
    "plan-course-plan",
    # Structural (1)
    "structural-elements",
    # Concept map (1)
    "concept-map",
    # Image description (1)
    "image-description",
    # Judges (2)
    "outline-judge",
    "lesson-judge",
}


@pytest.fixture(autouse=True)
def _ensure_agents_registered():
    """Import all agent modules to trigger registration."""
    # This triggers all AgentRegistry.register() calls at module import time
    import src.agents  # noqa: F401


class TestAllAgentsRegistered:
    def test_expected_count(self):
        specs = AgentRegistry.list_specs()
        registered_names = {s.name for s in specs}
        assert len(registered_names) >= len(EXPECTED_AGENTS), (
            f"Expected at least {len(EXPECTED_AGENTS)} agents, "
            f"got {len(registered_names)}"
        )

    def test_all_expected_agents_present(self):
        specs = AgentRegistry.list_specs()
        registered_names = {s.name for s in specs}
        missing = EXPECTED_AGENTS - registered_names
        assert not missing, f"Missing agents: {missing}"

    def test_all_agents_buildable(self):
        """Every registered agent can be built without errors."""
        for spec in AgentRegistry.list_specs():
            agent = AgentRegistry.get(spec.name)
            assert isinstance(agent, Agent), f"Agent '{spec.name}' did not build"

    def test_wizard_agents_have_validators(self):
        """Wizard agents should have output validators attached."""
        wizard_names = [
            "wizard-title",
            "wizard-outcomes",
            "wizard-sme",
            "wizard-audience",
            "wizard-tone",
        ]
        for name in wizard_names:
            agent = AgentRegistry.get(name)
            # pydantic-ai stores output validators in _output_validators
            assert len(agent._output_validators) > 0, (
                f"Wizard agent '{name}' has no output validators"
            )

    def test_reviewer_tool_creation(self):
        """AgentRegistry.create_reviewer_tool() returns a callable."""
        for domain in ("component", "outline", "quiz"):
            tool_fn = AgentRegistry.create_reviewer_tool(domain)
            assert callable(tool_fn)

    def test_a2a_exposed_agents(self):
        """Agents marked expose_a2a=True are discoverable."""
        exposed = AgentRegistry.list_specs(expose_a2a=True)
        exposed_names = {s.name for s in exposed}
        expected_a2a = {
            "reviewer-component",
            "reviewer-outline",
            "reviewer-quiz",
            "concept-map",
            "image-description",
        }
        assert expected_a2a.issubset(exposed_names), (
            f"Missing A2A agents: {expected_a2a - exposed_names}"
        )

    def test_category_filtering(self):
        """Category filtering returns correct subsets."""
        wizards = AgentRegistry.list_specs(category=AgentCategory.WIZARD)
        assert len(wizards) == 5
        for s in wizards:
            assert s.category == AgentCategory.WIZARD

        judges = AgentRegistry.list_specs(category=AgentCategory.JUDGE)
        assert len(judges) >= 2  # outline-judge, lesson-judge, section-qa-judge, structure-coverage

        reviewers = AgentRegistry.list_specs(category=AgentCategory.REVIEWER)
        assert len(reviewers) == 3
