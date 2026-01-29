package gemini

// ComponentCategory represents a category of component types.
type ComponentCategory string

const (
	CategoryContent    ComponentCategory = "content"
	CategoryAssessment ComponentCategory = "assessment"
	CategoryMedia      ComponentCategory = "media"
	CategoryEmphasis   ComponentCategory = "emphasis"
	CategoryFormatting ComponentCategory = "formatting"
)

// ComponentSchemaDefinition contains a compact schema description for prompts.
type ComponentSchemaDefinition struct {
	Type        string
	Description string
	Schema      string
	Categories  []ComponentCategory
}

// componentSchemas defines all available component types with their schemas.
var componentSchemas = map[string]ComponentSchemaDefinition{
	"text": {
		Type:        "text",
		Description: "SHORT text (2-3 sentences MAX). For brief context only - NOT for definitions (use STATEMENT) or comparisons (use LIST). Avoid long paragraphs.",
		Schema:      `{text_html: string (HTML with <p>, <strong>, <em> - keep SHORT)}`,
		Categories:  []ComponentCategory{CategoryContent},
	},
	"heading": {
		Type:        "heading",
		Description: "Section or subsection header to organize content",
		Schema:      `{heading_level: 1-4 (2=section, 3=subsection), heading_text: string}`,
		Categories:  []ComponentCategory{CategoryContent, CategoryFormatting},
	},
	"image": {
		Type:        "image",
		Description: "Image placeholder with AI-generated description for visual learning",
		Schema:      `{image_description: string (detailed for AI generation), image_alt_text: string, image_caption?: string}`,
		Categories:  []ComponentCategory{CategoryMedia},
	},
	"quiz": {
		Type:        "quiz",
		Description: "Knowledge check - MUST be the LAST component of every lesson. Exactly ONE quiz per lesson. Tests understanding of key concepts.",
		Schema:      `{quiz_question: string, quiz_options: [{id: "a"|"b"|"c"|"d", text: string}], quiz_correct_answer_id: string, quiz_explanation: string}`,
		Categories:  []ComponentCategory{CategoryAssessment},
	},
	"code": {
		Type:        "code",
		Description: "Syntax-highlighted code snippet (5-15 lines) for technical content",
		Schema:      `{code: string, language: "javascript"|"python"|"go"|"html"|"css"|"sql"|"bash"|etc}`,
		Categories:  []ComponentCategory{CategoryAssessment, CategoryContent},
	},
	"callout": {
		Type:        "callout",
		Description: "Highlighted box for important information, warnings, or tips",
		Schema:      `{style: "info"|"warning"|"success"|"error"|"tip", title?: string, content: string (1-2 sentences)}`,
		Categories:  []ComponentCategory{CategoryEmphasis},
	},
	"statement": {
		Type:        "statement",
		Description: "DEFINITIONS and key takeaways belong here. Short, memorable, quotable. Use instead of burying definitions in TEXT paragraphs.",
		Schema:      `{statement_text: string (1-2 sentences, quotable), statement_subtext?: string (1 sentence context)}`,
		Categories:  []ComponentCategory{CategoryEmphasis},
	},
	"quote": {
		Type:        "quote",
		Description: "Expert quote with attribution for credibility and inspiration",
		Schema:      `{text: string, attribution: string (name, title, or source)}`,
		Categories:  []ComponentCategory{CategoryEmphasis, CategoryContent},
	},
	"list": {
		Type:        "list",
		Description: "Structured list - DEFAULT TO 'accordion' for any list with explanations. Styles: 'accordion' (expandable - BEST for learning, DEFAULT), 'numbered' (sequential steps only), 'process' (workflows), 'icon' (feature lists), 'bulleted' (simple unordered - AVOID)",
		Schema:      `{style: "accordion"|"numbered"|"process"|"icon"|"bulleted" (DEFAULT: accordion), items: [{text: string, description: string (REQUIRED for accordion)}], title?: string}`,
		Categories:  []ComponentCategory{CategoryFormatting, CategoryContent},
	},
	"gallery": {
		Type:        "gallery",
		Description: "Multiple images as carousel or labeled graphic",
		Schema:      `{style: "carousel"|"labeled_graphic", images: [{description: string, alt_text: string, caption?: string}]}`,
		Categories:  []ComponentCategory{CategoryMedia},
	},
	"multimedia": {
		Type:        "multimedia",
		Description: "Video or audio placeholder for rich media content",
		Schema:      `{type: "video"|"audio", description: string (what should be shown/played), caption?: string}`,
		Categories:  []ComponentCategory{CategoryMedia},
	},
	"chart": {
		Type:        "chart",
		Description: "Data visualization for statistics and comparisons",
		Schema:      `{type: "bar"|"line"|"pie"|"table", title: string, data: {labels: string[], values: number[]}}`,
		Categories:  []ComponentCategory{CategoryMedia, CategoryContent},
	},
	"divider": {
		Type:        "divider",
		Description: "Visual separator between major sections",
		Schema:      `{}`,
		Categories:  []ComponentCategory{CategoryFormatting},
	},
}

// CourseContext captures lesson generation context for schema selection.
type CourseContext struct {
	IsTechnical      bool
	IsDataHeavy      bool
	AudienceLevel    string
	IsFirstInCourse  bool
	IsLastInCourse   bool
	IsFirstInSection bool
	IsLastInSection  bool
	SMEDomains       []string
}

// technicalKeywords are used to detect technical courses.
var technicalKeywords = []string{
	"programming", "code", "coding", "software", "api", "database",
	"development", "engineering", "technical", "data", "analytics",
	"python", "javascript", "java", "go", "golang", "rust", "typescript",
	"cloud", "devops", "security", "cybersecurity", "machine learning",
	"ai", "algorithm", "system", "architecture", "backend", "frontend",
}

// dataKeywords are used to detect data-heavy courses.
var dataKeywords = []string{
	"statistics", "metrics", "analytics", "data", "report",
	"dashboard", "visualization", "chart", "graph", "analysis",
	"numbers", "measurement", "performance", "kpi",
}
