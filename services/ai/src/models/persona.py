"""SME Persona model for course generation context."""

from pydantic import BaseModel


class SMEPersona(BaseModel):
    """Subject Matter Expert persona for guiding AI generation."""

    name: str
    expertise: str
    role: str
    perspective: str
