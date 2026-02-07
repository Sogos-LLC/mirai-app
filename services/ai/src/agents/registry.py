"""AgentSpec + AgentRegistry: declarative agent architecture.

AgentSpec is a frozen dataclass holding all agent configuration.
AgentRegistry is a class-level singleton that catalogs all agents.

Usage:
    # Register in agent module (at import time)
    AgentRegistry.register(AgentSpec(
        name="wizard-title",
        system_prompt=TITLE_SYSTEM,
        output_type=ImprovedTitleOutput,
        category=AgentCategory.WIZARD,
        description="Generates improved course titles and descriptions.",
    ))

    # Consume in activities/graphs
    agent = AgentRegistry.get("wizard-title")
    result = await agent.run(prompt, model=model)
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from pydantic_ai import Agent, NativeOutput, RunContext


class AgentCategory(str, Enum):
    """Broad grouping for agent classification."""

    WIZARD = "wizard"
    COURSE_DESIGN = "course_design"
    OUTLINE = "outline"
    LESSON = "lesson"
    REVIEWER = "reviewer"
    PLANNING = "planning"
    STRUCTURAL = "structural"
    JUDGE = "judge"
    UTILITY = "utility"


@dataclass(frozen=True)
class AgentSpec:
    """Declarative configuration for a pydantic-ai Agent.

    All fields needed to build an Agent are captured here.
    The registry calls build() lazily on first get().
    """

    # Required
    name: str
    system_prompt: str
    output_type: type
    category: AgentCategory

    # Agent behaviour
    output_retries: int = 0
    deps_type: type | None = None
    builtin_tools: list = field(default_factory=list)

    # Metadata (for A2A / marketplace - Phase 2)
    description: str = ""
    skills: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    expose_a2a: bool = False
    input_modes: list[str] = field(default_factory=lambda: ["text"])
    output_modes: list[str] = field(default_factory=lambda: ["text"])

    def build(self) -> Agent:
        """Build a pydantic-ai Agent from this spec.

        Wraps output_type in NativeOutput unless it's str.
        """
        output = self.output_type if self.output_type is str else NativeOutput(self.output_type)

        kwargs: dict[str, Any] = {
            "output_type": output,
            "system_prompt": self.system_prompt,
            "name": self.name,
        }
        if self.output_retries:
            kwargs["output_retries"] = self.output_retries
        if self.deps_type is not None:
            kwargs["deps_type"] = self.deps_type
        if self.builtin_tools:
            kwargs["builtin_tools"] = list(self.builtin_tools)

        return Agent(**kwargs)


PostBuildHook = Callable[[Agent], None]


class AgentRegistry:
    """Central catalog of all agents. Class-level singleton.

    Agents are registered as AgentSpec objects at import time.
    Built Agent instances are cached after first get().
    Post-build hooks (output validators, tools) run once on first build.
    """

    _specs: dict[str, AgentSpec] = {}
    _agents: dict[str, Agent] = {}
    _hooks: dict[str, list[PostBuildHook]] = {}

    @classmethod
    def register(
        cls,
        spec: AgentSpec,
        *,
        post_build: list[PostBuildHook] | None = None,
    ) -> AgentSpec:
        """Register an agent spec. Returns the spec for assignment convenience.

        Raises ValueError if a spec with the same name is already registered.
        """
        if spec.name in cls._specs:
            raise ValueError(f"Agent '{spec.name}' is already registered")
        cls._specs[spec.name] = spec
        if post_build:
            cls._hooks[spec.name] = list(post_build)
        return spec

    @classmethod
    def get(cls, name: str) -> Agent:
        """Get or build an agent by name. Cached after first build."""
        if name in cls._agents:
            return cls._agents[name]

        if name not in cls._specs:
            raise KeyError(f"No agent registered with name '{name}'")

        agent = cls._specs[name].build()

        # Apply post-build hooks (validators, tools) exactly once
        for hook in cls._hooks.get(name, []):
            hook(agent)

        cls._agents[name] = agent
        return agent

    @classmethod
    def get_spec(cls, name: str) -> AgentSpec:
        """Get the spec without building the agent."""
        if name not in cls._specs:
            raise KeyError(f"No agent registered with name '{name}'")
        return cls._specs[name]

    @classmethod
    def list_specs(
        cls,
        *,
        category: AgentCategory | None = None,
        tag: str | None = None,
        expose_a2a: bool | None = None,
    ) -> list[AgentSpec]:
        """List specs with optional filtering."""
        specs = list(cls._specs.values())
        if category is not None:
            specs = [s for s in specs if s.category == category]
        if tag is not None:
            specs = [s for s in specs if tag in s.tags]
        if expose_a2a is not None:
            specs = [s for s in specs if s.expose_a2a == expose_a2a]
        return specs

    @classmethod
    def create_reviewer_tool(cls, domain: str) -> Callable:
        """Create a tool function that delegates to a reviewer agent.

        Replaces ReviewerRegistry.create_tool(). Naming convention:
        domain "component" → agent name "reviewer-component".
        """
        agent_name = f"reviewer-{domain}"

        async def _review(ctx: RunContext[Any], content_to_review: str) -> str:
            from src.agents.model import make_model

            reviewer = cls.get(agent_name)
            model = make_model(ctx.deps) if isinstance(ctx.deps, str) else None
            result = await reviewer.run(
                content_to_review,
                model=model,
                usage=ctx.usage,
            )
            output = result.output
            parts = [output.summary]
            if output.suggestions:
                parts.append("Suggestions:")
                for s in output.suggestions:
                    parts.append(f"- {s}")
            return "\n".join(parts)

        return _review

    @classmethod
    def clear(cls) -> None:
        """Reset all state. For testing only."""
        cls._specs.clear()
        cls._agents.clear()
        cls._hooks.clear()
