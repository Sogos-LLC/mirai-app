"""Temporal activity for graph visualization (mermaid diagrams)."""

from dataclasses import dataclass

import structlog
from temporalio import activity

from src.graphs.audience_graph import audience_graph
from src.graphs.lesson_graph import lesson_graph
from src.graphs.outcomes_graph import outcomes_graph
from src.graphs.outline_graph import outline_graph
from src.graphs.sme_graph import sme_graph
from src.graphs.title_graph import title_graph
from src.graphs.tone_graph import tone_graph

log = structlog.get_logger()

# Map of graph name -> pydantic-graph instance
GRAPH_MAP = {
    "outline": outline_graph,
    "lesson": lesson_graph,
    "title": title_graph,
    "outcomes": outcomes_graph,
    "sme": sme_graph,
    "audience": audience_graph,
    "tone": tone_graph,
}


@dataclass
class GraphVisualizationInput:
    """Input for graph visualization activity."""

    graph_name: str  # "outline" | "lesson" | "workflow" | "title" | "outcomes" | "sme" | "audience" | "tone"


@dataclass
class GraphVisualizationOutput:
    """Output containing mermaid diagram code."""

    mermaid_code: str
    current_node: str


# Static mermaid for the overall course creation workflow.
# This represents the Temporal workflow orchestration (not a pydantic-graph).
WORKFLOW_MERMAID = """graph TD
    A[GenerateTitle] --> B{AwaitTitleApproval}
    B -->|Approved| C[GenerateOutcomes]
    B -->|Rejected| A
    C --> D{AwaitOutcomesApproval}
    D -->|Approved| E[GenerateSMEPersonas]
    D -->|Rejected| C
    E --> F{AwaitSMEApproval}
    F -->|Approved| G[GenerateAudiencePersonas]
    F -->|Rejected| E
    G --> H{AwaitAudienceApproval}
    H -->|Approved| I[GenerateToneOptions]
    H -->|Rejected| G
    I --> J{AwaitToneApproval}
    J -->|Approved| K{HasKnowledgeSources?}
    J -->|Rejected| I
    K -->|Yes| L[AnalyzeDocuments]
    K -->|No| N[GenerateOutline]
    L --> M{AwaitPlanApproval}
    M -->|Approved| N
    M -->|Rejected| L
    N --> O{AwaitOutlineApproval}
    O -->|Approved| P[GenerateLessons]
    O -->|Rejected| N
    P --> Q[FinalizeContent]
    Q --> R((End))"""


@activity.defn
async def get_graph_visualization(
    input: GraphVisualizationInput,
) -> GraphVisualizationOutput:
    """Return mermaid diagram for a specified graph."""
    log.info("generating graph visualization", graph_name=input.graph_name)

    graph = GRAPH_MAP.get(input.graph_name)
    if graph is not None:
        mermaid = graph.mermaid_code()
    else:
        mermaid = WORKFLOW_MERMAID

    return GraphVisualizationOutput(
        mermaid_code=mermaid,
        current_node="",
    )
