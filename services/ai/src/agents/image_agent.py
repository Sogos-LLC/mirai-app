"""Image description generation agent."""

import structlog
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from src.agents.model import make_model

log = structlog.get_logger()


class ImageDescriptionOutput(BaseModel):
    """Structured output for image description generation."""

    description: str = Field(
        description="Detailed description for AI image generation"
    )
    alt_text: str = Field(description="Accessible alt text for the image")


IMAGE_DESCRIPTION_SYSTEM = """\
You are an expert at creating descriptions for educational images.

Given the context of where an image appears in a lesson, generate:

1. **description**: A detailed description suitable for AI image generation.
   - Be specific about visual elements, composition, and style
   - Use educational/professional visual style
   - Include relevant objects, people, or diagrams
   - Describe the scene, colors, and mood
   - Keep it under 200 words

2. **alt_text**: Accessible alt text for screen readers.
   - Concise description of what the image shows
   - Focus on the educational content conveyed
   - Keep it under 125 characters
   - Do not start with "Image of" or "Picture of"
"""

_image_description_agent = Agent(
    "google-gla:gemini-2.5-flash",
    output_type=ImageDescriptionOutput,
    system_prompt=IMAGE_DESCRIPTION_SYSTEM,
    name="image-description",
)


async def run_image_description(
    *,
    api_key: str,
    image_context: str,
    lesson_context: str,
    course_title: str,
) -> tuple[str, str]:
    """Generate an image description and alt text.

    Returns:
        Tuple of (description, alt_text)
    """
    prompt = f"""\
## Course
{course_title}

## Lesson Context
{lesson_context}

## Image Placement Context
{image_context}

Generate a detailed image description and accessible alt text for an
educational image that fits this context."""

    result = await _image_description_agent.run(
        prompt,
        model=make_model(api_key),
    )

    output = result.output
    log.info("image_description_generated", alt_text_len=len(output.alt_text))
    return output.description, output.alt_text
