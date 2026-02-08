"""Unified research module: source providers + orchestrator.

Public API:
    ResearchContext - input context for a research query
    ResearchResult  - unified output from any source provider
    ResearchOrchestrator - coordinates active providers in a Temporal workflow
"""

from src.research.types import ResearchContext, ResearchResult
from src.research.orchestrator import ResearchOrchestrator

__all__ = ["ResearchContext", "ResearchResult", "ResearchOrchestrator"]
