"""Image description generation agent."""

import structlog
from pydantic import BaseModel, Field

from src.agents.model import make_model
from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec

log = structlog.get_logger()


class ImageDescriptionOutput(BaseModel):
    """Structured output for image description generation."""

    description: str = Field(
        description="Detailed description for AI image generation"
    )
    alt_text: str = Field(description="Accessible alt text for the image")


IMAGE_STYLE_GUIDES = {
    "diagram": "Create a clean technical diagram with labeled boxes, connecting arrows, "
    "clear hierarchy, flat design, muted professional colors. No decorative elements.",
    "chart": "Create a data visualization with clearly labeled axes, a legend, distinct "
    "data points or bars, clean gridlines, and a professional color palette.",
    "infographic": "Create an infographic layout with icons, short text labels, data "
    "callouts, visual hierarchy using size and color, organized into clear sections.",
    "photograph": "Describe a realistic photograph: specific setting, lighting, people "
    "or objects, mood, and composition. Professional quality, well-lit.",
    "illustration": "Create a conceptual illustration with stylized elements, metaphors, "
    "vibrant but professional colors, and artistic composition conveying the concept.",
    "screenshot": "Describe a software UI screenshot with specific elements visible, "
    "annotations highlighting key areas, clean interface, and readable text.",
}

IMAGE_DESCRIPTION_SYSTEM = """\
You are an expert at creating descriptions for educational images.

Given the context of where an image appears in a lesson and the requested image style, generate:

1. **description**: A detailed description suitable for AI image generation.
   - Be specific about visual elements, composition, and style
   - Match the requested image style precisely
   - Include relevant objects, people, or diagrams
   - Describe the scene, colors, and mood
   - Keep it under 200 words

2. **alt_text**: Accessible alt text for screen readers.
   - Concise description of what the image shows
   - Focus on the educational content conveyed
   - Keep it under 125 characters
   - Do not start with "Image of" or "Picture of"
"""

AgentRegistry.register(AgentSpec(
    name="image-description",
    system_prompt=IMAGE_DESCRIPTION_SYSTEM,
    output_type=ImageDescriptionOutput,
    category=AgentCategory.UTILITY,
    description="Generates image descriptions and alt text for educational content.",
    tags=["utility", "image"],
    expose_a2a=True,
))


async def run_image_description(
    *,
    api_key: str,
    image_context: str,
    lesson_context: str,
    course_title: str,
    image_style: str = "illustration",
) -> tuple[str, str]:
    """Generate an image description and alt text.

    Args:
        api_key: Gemini API key.
        image_context: Description of the image placement context.
        lesson_context: Context of the lesson this image appears in.
        course_title: Title of the course.
        image_style: One of: diagram, chart, infographic, photograph, illustration, screenshot.

    Returns:
        Tuple of (description, alt_text)
    """
    style_guide = IMAGE_STYLE_GUIDES.get(image_style, IMAGE_STYLE_GUIDES["illustration"])

    prompt = f"""\
## Course
{course_title}

## Lesson Context
{lesson_context}

## Image Placement Context
{image_context}

## Image Style: {image_style}
{style_guide}

Generate a detailed image description and accessible alt text for an
educational image in the **{image_style}** style that fits this context."""

    agent = AgentRegistry.get("image-description")
    result = await agent.run(
        prompt,
        model=make_model(api_key),
    )

    output = result.output
    log.info("image_description_generated", alt_text_len=len(output.alt_text), style=image_style)
    return output.description, output.alt_text
