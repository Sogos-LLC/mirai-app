"""Import all agent modules to trigger AgentRegistry registration."""

import src.agents.reviewers  # noqa: F401
import src.agents.wizard_agents  # noqa: F401
import src.agents.course_design_agents  # noqa: F401
import src.agents.outline_agent  # noqa: F401
import src.agents.lesson_agent  # noqa: F401
import src.agents.component_generation_agent  # noqa: F401
import src.agents.section_qa_agent  # noqa: F401
import src.agents.component_agent  # noqa: F401
import src.agents.plan_agent  # noqa: F401
import src.agents.structural_agent  # noqa: F401
import src.agents.concept_agent  # noqa: F401
import src.agents.image_agent  # noqa: F401
import src.judges.lesson_judge  # noqa: F401
import src.judges.outline_judge  # noqa: F401
