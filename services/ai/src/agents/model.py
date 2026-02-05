"""Shared model creation for per-tenant Gemini API keys."""

from pydantic_ai.models.google import GoogleModel
from pydantic_ai.providers.google import GoogleProvider

DEFAULT_MODEL_NAME = "gemini-2.5-flash"


def make_model(api_key: str, model_name: str = DEFAULT_MODEL_NAME) -> GoogleModel:
    """Create a Google model instance with a per-tenant API key.

    Each tenant has their own Gemini API key (decrypted by the Go backend).
    The Python AI service receives the key per-activity and creates a
    model instance for that specific call.
    """
    return GoogleModel(model_name, provider=GoogleProvider(api_key=api_key))
