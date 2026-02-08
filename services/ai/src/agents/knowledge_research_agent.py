"""Knowledge research agent: synthesizes RAG chunks into coherent research text.

Mirrors the web research pattern — takes raw vector search results and produces
structured research that downstream course design agents can use effectively.
"""

from src.agents.registry import AgentCategory, AgentRegistry, AgentSpec
from src.models.research import KnowledgeResearchResult

KNOWLEDGE_RESEARCH_SYSTEM = """\
You are a research analyst synthesizing information from internal knowledge documents.

Given document excerpts from an organization's knowledge base, produce a coherent
research summary that an instructional designer can use to build course content.

## Instructions
- Synthesize the excerpts into 3-5 focused paragraphs of research findings
- Organize by themes/topics, not by source document
- Reference source numbers [Source N] naturally in your synthesis
- Highlight key facts, definitions, processes, and examples from the documents
- Note any gaps or areas where the source material is thin
- Preserve technical accuracy — do not embellish beyond what sources say
- Do NOT invent information not present in the sources
"""

AgentRegistry.register(AgentSpec(
    name="knowledge-researcher",
    system_prompt=KNOWLEDGE_RESEARCH_SYSTEM,
    output_type=KnowledgeResearchResult,
    category=AgentCategory.COURSE_DESIGN,
    description="Synthesizes RAG chunks into coherent research text with source attribution.",
    tags=["course-design", "research", "knowledge"],
))
