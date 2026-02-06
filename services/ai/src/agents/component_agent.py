"""Component regeneration agent - modifies a single lesson component."""

import structlog
from pydantic_ai import Agent, NativeOutput

from src.agents.model import make_model
from src.models.lesson import LessonComponent

log = structlog.get_logger()

COMPONENT_REGEN_SYSTEM = """\
You are an expert instructional designer regenerating a single lesson component.

You will receive an existing component and a modification prompt describing
what changes to make. Generate a new version of the component that:

1. Applies the requested modifications
2. Preserves the component type and structural format
3. Maintains educational quality and engagement
4. Keeps content concise and focused

Component type rules:
- TEXT: Max 2-3 short paragraphs, use HTML formatting (<p>, <strong>, <em>)
- HEADING: Short, descriptive heading text
- QUIZ: 3-4 options, one correct, with explanation
- CODE: Include language, keep code focused and commented
- IMAGE: Descriptive image description and alt text
- CALLOUT: Brief important info (max 300 chars), specify type (info/warning/tip/note)
- LIST: Max 7 items, choose appropriate style (accordion/numbered/bulleted)
- STATEMENT: One memorable key takeaway (max 200 chars)
- TABLE: Structured data with clear headers
- DIVIDER: Visual separator (minimal content)
"""

_component_regen_agent = Agent(
    output_type=NativeOutput(LessonComponent),
    system_prompt=COMPONENT_REGEN_SYSTEM,
    name="component-regen",
    output_retries=3,
)


async def run_component_regeneration(
    *,
    api_key: str,
    component: LessonComponent,
    modification_prompt: str,
    lesson_context: str,
    course_title: str,
) -> LessonComponent:
    """Regenerate a single lesson component with modifications."""
    prompt = f"""\
## Course
{course_title}

## Lesson Context
{lesson_context}

## Existing Component
- **ID:** {component.id}
- **Type:** {component.type.value}
- **Content:** {component.content}
{f"- **Quiz Question:** {component.quiz_question}" if component.quiz_question else ""}
{f"- **Heading Level:** {component.heading_level}" if component.heading_level else ""}
{f"- **Code Language:** {component.code_language}" if component.code_language else ""}
{f"- **Callout Type:** {component.callout_type}" if component.callout_type else ""}

## Modification Request
{modification_prompt}

Regenerate this {component.type.value} component applying the requested changes.
Preserve the component ID: {component.id}
Preserve the component type: {component.type.value}
Preserve the order: {component.order}"""

    result = await _component_regen_agent.run(
        prompt,
        model=make_model(api_key),
    )

    regenerated = result.output
    # Preserve identity fields
    regenerated.id = component.id
    regenerated.type = component.type
    regenerated.order = component.order

    log.info(
        "component_regenerated",
        component_id=component.id,
        component_type=component.type.value,
    )
    return regenerated
