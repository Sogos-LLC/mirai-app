"""Centralized component schema reference for AI agent prompts.

Provides structured documentation of all 12 component types with usage guidance,
constraints, and variety enforcement rules. Used by component generation and
planning agents to produce rich, varied lesson content.
"""

from __future__ import annotations

# =============================================================================
# Component Type Definitions
# =============================================================================

COMPONENT_TYPES = [
    {
        "type": "text",
        "name": "Text",
        "when_to_use": "Prose paragraphs that flow as narrative explanation or storytelling",
        "when_not_to_use": "Content with labels+descriptions, sequential steps, or short key points",
        "required_fields": ["paragraphs (list of {html, source_refs})"],
        "constraints": [
            "HTML tags: <p>, <strong>, <em>, <ul>, <ol>, <li>, <code>, <a href>",
            "Each paragraph should be substantial (2+ sentences)",
            "Never use text for list-like content — use the list component instead",
        ],
    },
    {
        "type": "heading",
        "name": "Heading",
        "when_to_use": "Section headers to organize content flow",
        "when_not_to_use": "Never level 1 (reserved for page title). Never consecutive headings.",
        "required_fields": ["headingLevel (2-4)", "headingText"],
        "constraints": ["Level 2 for major sections, 3 for subsections, 4 for minor points"],
    },
    {
        "type": "quiz",
        "name": "Quiz",
        "when_to_use": "Testing comprehension at application/analysis level (Bloom's)",
        "when_not_to_use": "Simple recall questions — aim higher on Bloom's taxonomy",
        "required_fields": [
            "quizQuestion",
            "quizOptions (3-4 items with id: a/b/c/d and text)",
            "quizCorrectAnswerId",
            "quizExplanation",
        ],
        "constraints": [
            "Every lesson MUST have at least one quiz",
            "Exactly one correct answer",
            "Explanation should teach, not just confirm",
        ],
    },
    {
        "type": "code",
        "name": "Code",
        "when_to_use": "Code examples, terminal commands, configuration snippets",
        "when_not_to_use": "Inline code mentions (use <code> in text instead)",
        "required_fields": ["code", "language"],
        "constraints": ["Language must be a valid syntax highlighting identifier"],
    },
    {
        "type": "callout",
        "name": "Callout",
        "when_to_use": "Warnings, tips, important notes, best practices, gotchas",
        "when_not_to_use": "General content — reserve for truly noteworthy points",
        "required_fields": ["style (info/warning/success/error/tip)", "content"],
        "sub_styles": ["info", "warning", "success", "error", "tip"],
        "constraints": ["Optional title field for context"],
    },
    {
        "type": "statement",
        "name": "Statement",
        "when_to_use": "Key takeaways, bold memorable insights, rules (1-2 sentences)",
        "when_not_to_use": "Content with code/HTML — use callout instead",
        "required_fields": ["statementText"],
        "constraints": [
            "NO inline code or HTML tags",
            "Keep to 1-2 punchy sentences",
            "Optional statementSubtext for supporting context",
        ],
    },
    {
        "type": "quote",
        "name": "Quote",
        "when_to_use": "Expert opinions, notable insights with attribution",
        "when_not_to_use": "Generic statements without a real author",
        "required_fields": ["text", "author"],
        "constraints": ["Optional title (author role) and source fields"],
    },
    {
        "type": "list",
        "name": "List",
        "when_to_use": "Structured items — steps, definitions, comparisons, features",
        "when_not_to_use": "Narrative prose that flows as paragraphs",
        "required_fields": ["style", "items (list of {text, optional icon, optional description})"],
        "sub_styles": [
            "bulleted — simple bullet points",
            "numbered — ordered/sequential items",
            "icon — items with emoji/icon identifiers",
            "process — step-by-step workflows with clear sequence",
            "accordion — expandable term/definition pairs (concepts, tools, comparisons)",
        ],
        "constraints": [
            "Use accordion for 'Term: explanation' patterns",
            "Use process for sequential steps",
            "Optional title field",
        ],
    },
    {
        "type": "image",
        "name": "Image",
        "when_to_use": "Visual explanations, diagrams, conceptual illustrations",
        "when_not_to_use": "Decorative images with no educational value",
        "required_fields": ["imageDescription", "imageAltText", "imageStyle"],
        "image_styles": [
            "diagram — labeled boxes, arrows, clean lines, flat design (architecture, flows, relationships)",
            "chart — axis labels, legend, clear data points (comparisons, trends, distributions)",
            "infographic — icons, short text, data visualization, visual hierarchy (summaries, overviews)",
            "photograph — realistic scene, setting, people (real-world examples, case studies)",
            "illustration — conceptual art, metaphors, stylized (abstract concepts, analogies)",
            "screenshot — UI elements, annotations, highlights (software tutorials, walkthroughs)",
        ],
        "constraints": [
            "Description must be detailed enough for AI image generation (< 200 words)",
            "Alt text must be accessible (< 125 chars)",
            "imageStyle must match the content context",
            "Optional imageCaption",
        ],
    },
    {
        "type": "divider",
        "name": "Divider",
        "when_to_use": "Visual separation between major content sections",
        "when_not_to_use": "Between every component — use sparingly",
        "required_fields": ["style (line/dots/space)"],
        "constraints": ["Max 2-3 per lesson"],
    },
    {
        "type": "task_list",
        "name": "Task List",
        "when_to_use": "Hands-on practice, try-it-yourself exercises, guided activities",
        "when_not_to_use": "Simple lists of information (use list component instead)",
        "required_fields": [
            "title",
            "items (list of {id: a/b/c, contentHtml})",
        ],
        "constraints": [
            "Rich HTML content per item (<code>, <strong>, <em>, <p>, <ol>, <li>)",
            "Optional emoji prefix for the title",
        ],
    },
    {
        "type": "multimedia",
        "name": "Multimedia",
        "when_to_use": "Embedding video, audio, or interactive media when a URL is provided",
        "when_not_to_use": "NEVER without an explicit URL from Available Resources",
        "required_fields": ["mediaType (video/audio/interactive)", "url", "title"],
        "constraints": [
            "NEVER invent URLs — only use URLs from Available Resources",
            "Optional description and provider (youtube/vimeo/soundcloud)",
        ],
    },
]


# =============================================================================
# Variety Enforcement Rules
# =============================================================================

VARIETY_RULES = [
    "Use at least 5 different component types per lesson (e.g., text, heading, list, image, quiz, statement)",
    "Never place more than 2 consecutive components of the same type",
    "Every lesson MUST include at least 1 image component with an appropriate imageStyle",
    "Every lesson MUST include at least 1 interactive element (quiz, task_list, or code)",
    "Use statement components for key takeaways instead of burying them in text paragraphs",
    "Use list (accordion) for term/definition patterns instead of bold labels in text",
    "Use list (process) for sequential steps instead of numbered paragraphs in text",
    "When web source URLs are available, include them as <a href> hyperlinks in text components",
]


# =============================================================================
# Formatting Functions
# =============================================================================


def format_component_reference() -> str:
    """Format all component types as markdown for agent system prompts."""
    lines = ["## Component Types Available\n"]

    for ct in COMPONENT_TYPES:
        lines.append(f"### {ct['type']} — {ct['name']}")
        lines.append(f"**Use when**: {ct['when_to_use']}")
        lines.append(f"**Avoid when**: {ct['when_not_to_use']}")
        lines.append(f"**Required**: {', '.join(ct['required_fields'])}")

        if "sub_styles" in ct:
            lines.append("**Styles**:")
            for style in ct["sub_styles"]:
                lines.append(f"  - {style}")

        if "image_styles" in ct:
            lines.append("**Image styles** (pick the one matching the content):")
            for style in ct["image_styles"]:
                lines.append(f"  - {style}")

        constraints = ct.get("constraints", [])
        if constraints:
            lines.append("**Rules**: " + "; ".join(constraints))

        lines.append("")

    return "\n".join(lines)


def format_variety_rules() -> str:
    """Format variety enforcement rules as markdown for agent prompts."""
    lines = ["## Component Variety Rules (CRITICAL)\n"]
    for rule in VARIETY_RULES:
        lines.append(f"- {rule}")
    return "\n".join(lines)


def format_component_selection_table() -> str:
    """Format the content pattern → component type selection table."""
    return """\
## Component Selection Rules (CRITICAL — choose the right type)
Use a **text** component ONLY for prose paragraphs that flow as narrative. If the content
has any of these structures, use the matching component instead:

| Content Pattern | Correct Component | Style |
|----------------|-------------------|-------|
| "Term: explanation" pairs (tools, categories, definitions) | list | accordion |
| Sequential steps ("Step 1… Step 2…", "First… Then… Finally…") | list | process |
| Bulleted or numbered items | list | bulleted / numbered |
| Items with icons or labels | list | icon |
| A key takeaway, insight, or rule (1-2 sentences) | statement | — |
| Important warning, tip, or note | callout | info/warning/tip |
| A notable quote with attribution | quote | — |
| Code example or command | code | — |
| Hands-on exercise, practice prompt, "try it yourself" | task_list | — |
| External video, audio, or interactive embed (URL provided) | multimedia | — |
| Visual explanation, diagram, conceptual illustration | image | (pick imageStyle) |

A **text** block containing bold labels followed by descriptions is WRONG — convert it
to the appropriate list type. Text components should read like paragraphs, not lists."""
