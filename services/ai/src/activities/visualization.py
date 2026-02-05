"""Temporal activity for graph visualization (mermaid diagrams)."""

from dataclasses import dataclass

import structlog
from temporalio import activity

from src.graphs.outline_graph import outline_graph
from src.graphs.lesson_graph import lesson_graph

log = structlog.get_logger()


@dataclass
class GraphVisualizationInput:
    """Input for graph visualization activity."""

    graph_name: str  # "outline" | "lesson" | "workflow"


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

    if input.graph_name == "outline":
        mermaid = outline_graph.mermaid_code()
    elif input.graph_name == "lesson":
        mermaid = lesson_graph.mermaid_code()
    else:
        mermaid = WORKFLOW_MERMAID

    return GraphVisualizationOutput(
        mermaid_code=mermaid,
        current_node="",
    )
