"""SME personas generation graph using pydantic-graph.

Flow:
  SearchKnowledgeNode -> GenerateSMENode -> ValidateSMENode -> End (valid)
                                                 |-> RefineSMENode -> GenerateSMENode (max 2 retries)
"""

from dataclasses import dataclass, field

import structlog
from pydantic_graph import BaseNode, End, Graph, GraphRunContext

from src.adapters.embedding import EmbeddingClient
from src.adapters.qdrant import QdrantAdapter
from src.agents.model import make_model
from src.agents.wizard_agents import build_sme_prompt, sme_agent
from src.graphs.wizard_utils import (
    MAX_WIZARD_RETRIES,
    build_refinement_feedback,
    check_exact_count,
    check_sentence_count,
    check_unique_values,
    search_wizard_knowledge,
)
from src.models.knowledge import KnowledgeChunk
from src.models.wizard import WizardSMEPersona

log = structlog.get_logger()


# ---------------------------------------------------------------------------
# State, Deps, Result
# ---------------------------------------------------------------------------


@dataclass
class SMEState:
    rag_chunks: list[KnowledgeChunk] = field(default_factory=list)
    personas: list[WizardSMEPersona] | None = None
    constraint_violations: list[str] = field(default_factory=list)
    retry_count: int = 0
    chunks_used: int = 0
    refinement_feedback: str = ""


@dataclass
class SMEDeps:
    api_key: str
    title: str
    description: str
    qdrant: QdrantAdapter
    embedding_client: EmbeddingClient
    rag_filters: dict[str, str] | None


@dataclass
class SMEResult:
    personas: list[dict]
    violations: list[str]
    chunks_used: int


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------


@dataclass
class SearchKnowledgeNode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> "GenerateSMENode":
        deps = ctx.deps
        chunks, count = await search_wizard_knowledge(
            queries=[deps.title, deps.description],
            qdrant=deps.qdrant,
            embedding_client=deps.embedding_client,
            rag_filters=deps.rag_filters,
        )
        ctx.state.rag_chunks = chunks
        ctx.state.chunks_used = count
        return GenerateSMENode()


@dataclass
class GenerateSMENode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> "ValidateSMENode":
        deps = ctx.deps
        state = ctx.state

        prompt = build_sme_prompt(deps.title, deps.description, rag_chunks=state.rag_chunks)
        if state.refinement_feedback:
            prompt += f"\n\n{state.refinement_feedback}"

        result = await sme_agent.run(prompt, model=make_model(deps.api_key))
        state.personas = result.output.personas

        log.info("sme_generated", count=len(state.personas), retry=state.retry_count)
        return ValidateSMENode()


@dataclass
class ValidateSMENode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> "RefineSMENode | End[SMEResult]":
        state = ctx.state
        violations: list[str] = []
        assert state.personas is not None

        # Exactly 3 personas
        v = check_exact_count(state.personas, 3, "SME personas")
        if v:
            violations.append(v)

        # Unique IDs
        ids = [p.id for p in state.personas]
        v = check_unique_values(ids, "SME persona IDs")
        if v:
            violations.append(v)

        # Unique job titles
        titles = [p.job_title for p in state.personas]
        v = check_unique_values(titles, "SME job titles")
        if v:
            violations.append(v)

        # Each has 3-5 skills
        for p in state.personas:
            if len(p.skills) < 3:
                violations.append(
                    f"SME '{p.id}' has {len(p.skills)} skills; minimum is 3"
                )
            elif len(p.skills) > 5:
                violations.append(
                    f"SME '{p.id}' has {len(p.skills)} skills; maximum is 5"
                )

        # Descriptions are 2+ sentences
        for p in state.personas:
            v = check_sentence_count(p.description, 2, 10, f"SME '{p.id}' description")
            if v:
                violations.append(v)

        state.constraint_violations = violations

        if violations and state.retry_count < MAX_WIZARD_RETRIES:
            log.warn("sme_violations", violations=violations, retry=state.retry_count)
            return RefineSMENode()

        if violations:
            log.warn("sme_proceeding_with_violations", violations=violations)

        return End(SMEResult(
            personas=[p.model_dump() for p in state.personas],
            violations=violations,
            chunks_used=state.chunks_used,
        ))


@dataclass
class RefineSMENode(BaseNode[SMEState, SMEDeps]):
    async def run(
        self, ctx: GraphRunContext[SMEState, SMEDeps],
    ) -> GenerateSMENode:
        state = ctx.state
        state.retry_count += 1
        state.refinement_feedback = build_refinement_feedback(
            state.constraint_violations,
        )
        log.info("refining_sme", retry=state.retry_count)
        return GenerateSMENode()


# ---------------------------------------------------------------------------
# Graph definition & entry point
# ---------------------------------------------------------------------------

sme_graph = Graph(
    nodes=[
        SearchKnowledgeNode,
        GenerateSMENode,
        ValidateSMENode,
        RefineSMENode,
    ],
)


async def run_sme_graph(
    *,
    api_key: str,
    title: str,
    description: str,
    rag_filters: dict[str, str] | None = None,
) -> SMEResult:
    """Run the SME persona generation graph."""
    qdrant = QdrantAdapter()
    embedding_client = EmbeddingClient()

    deps = SMEDeps(
        api_key=api_key,
        title=title,
        description=description,
        qdrant=qdrant,
        embedding_client=embedding_client,
        rag_filters=rag_filters,
    )

    result = await sme_graph.run(
        SearchKnowledgeNode(),
        state=SMEState(),
        deps=deps,
    )

    return result.output
