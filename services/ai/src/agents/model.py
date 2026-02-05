"""Shared model creation for per-tenant Gemini API keys."""

from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.providers.google_gla import GoogleGLAProvider

DEFAULT_MODEL_NAME = "gemini-2.5-flash"


def make_model(api_key: str, model_name: str = DEFAULT_MODEL_NAME) -> GeminiModel:
    """Create a Gemini model instance with a per-tenant API key.

    Each tenant has their own Gemini API key (decrypted by the Go backend).
    The Python AI service receives the key per-activity and creates a
    model instance for that specific call.
    """
    return GeminiModel(model_name, provider=GoogleGLAProvider(api_key=api_key))
