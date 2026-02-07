"""Unit tests for AgentSpec + AgentRegistry."""

import pytest
from pydantic import BaseModel
from pydantic_ai import Agent, NativeOutput

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec


@pytest.fixture(autouse=True)
def _clean_registry():
    """Reset registry before and after each test."""
    AgentRegistry.clear()
    yield
    AgentRegistry.clear()


class DummyOutput(BaseModel):
    text: str


DUMMY_SPEC = AgentSpec(
    name="test-agent",
    system_prompt="You are a test agent.",
    output_type=DummyOutput,
    category=AgentCategory.UTILITY,
    description="A test agent.",
    tags=["test"],
)


class TestAgentSpec:
    def test_build_wraps_output_in_native_output(self):
        agent = DUMMY_SPEC.build()
        assert isinstance(agent, Agent)
        assert agent.name == "test-agent"

    def test_build_str_output_not_wrapped(self):
        spec = AgentSpec(
            name="str-agent",
            system_prompt="test",
            output_type=str,
            category=AgentCategory.UTILITY,
        )
        agent = spec.build()
        assert isinstance(agent, Agent)

    def test_build_with_retries(self):
        spec = AgentSpec(
            name="retry-agent",
            system_prompt="test",
            output_type=DummyOutput,
            category=AgentCategory.WIZARD,
            output_retries=3,
        )
        agent = spec.build()
        assert isinstance(agent, Agent)

    def test_build_with_deps_type(self):
        spec = AgentSpec(
            name="deps-agent",
            system_prompt="test",
            output_type=DummyOutput,
            category=AgentCategory.LESSON,
            deps_type=str,
        )
        agent = spec.build()
        assert isinstance(agent, Agent)

    def test_frozen(self):
        with pytest.raises(AttributeError):
            DUMMY_SPEC.name = "changed"  # type: ignore[misc]


class TestAgentRegistry:
    def test_register_and_get(self):
        AgentRegistry.register(DUMMY_SPEC)
        agent = AgentRegistry.get("test-agent")
        assert isinstance(agent, Agent)

    def test_get_returns_cached_instance(self):
        AgentRegistry.register(DUMMY_SPEC)
        a1 = AgentRegistry.get("test-agent")
        a2 = AgentRegistry.get("test-agent")
        assert a1 is a2

    def test_duplicate_registration_raises(self):
        AgentRegistry.register(DUMMY_SPEC)
        with pytest.raises(ValueError, match="already registered"):
            AgentRegistry.register(DUMMY_SPEC)

    def test_get_unknown_raises(self):
        with pytest.raises(KeyError, match="No agent registered"):
            AgentRegistry.get("nonexistent")

    def test_get_spec(self):
        AgentRegistry.register(DUMMY_SPEC)
        spec = AgentRegistry.get_spec("test-agent")
        assert spec is DUMMY_SPEC

    def test_get_spec_unknown_raises(self):
        with pytest.raises(KeyError, match="No agent registered"):
            AgentRegistry.get_spec("nonexistent")

    def test_post_build_hooks_called_once(self):
        call_count = 0

        def hook(agent: Agent) -> None:
            nonlocal call_count
            call_count += 1

        AgentRegistry.register(DUMMY_SPEC, post_build=[hook])
        AgentRegistry.get("test-agent")
        AgentRegistry.get("test-agent")  # second call should not re-run hook
        assert call_count == 1

    def test_list_specs_all(self):
        AgentRegistry.register(DUMMY_SPEC)
        spec2 = AgentSpec(
            name="other-agent",
            system_prompt="test",
            output_type=DummyOutput,
            category=AgentCategory.WIZARD,
            tags=["wizard"],
        )
        AgentRegistry.register(spec2)
        assert len(AgentRegistry.list_specs()) == 2

    def test_list_specs_by_category(self):
        AgentRegistry.register(DUMMY_SPEC)
        spec2 = AgentSpec(
            name="wizard-agent",
            system_prompt="test",
            output_type=DummyOutput,
            category=AgentCategory.WIZARD,
        )
        AgentRegistry.register(spec2)
        wizards = AgentRegistry.list_specs(category=AgentCategory.WIZARD)
        assert len(wizards) == 1
        assert wizards[0].name == "wizard-agent"

    def test_list_specs_by_tag(self):
        AgentRegistry.register(DUMMY_SPEC)
        tagged = AgentRegistry.list_specs(tag="test")
        assert len(tagged) == 1

    def test_list_specs_by_expose_a2a(self):
        AgentRegistry.register(DUMMY_SPEC)
        spec2 = AgentSpec(
            name="a2a-agent",
            system_prompt="test",
            output_type=DummyOutput,
            category=AgentCategory.UTILITY,
            expose_a2a=True,
        )
        AgentRegistry.register(spec2)
        exposed = AgentRegistry.list_specs(expose_a2a=True)
        assert len(exposed) == 1
        assert exposed[0].name == "a2a-agent"

    def test_clear_resets_all(self):
        AgentRegistry.register(DUMMY_SPEC)
        AgentRegistry.get("test-agent")
        AgentRegistry.clear()
        assert len(AgentRegistry.list_specs()) == 0
        with pytest.raises(KeyError):
            AgentRegistry.get("test-agent")
