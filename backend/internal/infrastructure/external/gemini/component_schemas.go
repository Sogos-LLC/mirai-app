package gemini

import (
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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
		Description: "Rich text content with HTML formatting for explanations and narratives",
		Schema:      `{text_html: string (HTML with <p>, <strong>, <em>, <ul>, <li>)}`,
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
		Description: "Multiple choice knowledge check to test understanding",
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
		Description: "Key takeaway or memorable principle to emphasize",
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
		Description: "Structured list for steps, features, or related items. Use 'accordion' style for expandable Q&A or detailed explanations - great for learning UX",
		Schema:      `{style: "bulleted"|"numbered"|"icon"|"process"|"accordion", items: [{text: string, description?: string}], title?: string}`,
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
	IsTechnical     bool
	IsDataHeavy     bool
	AudienceLevel   string
	IsFirstInCourse bool
	IsLastInCourse  bool
	IsFirstInSection bool
	IsLastInSection bool
	SMEDomains      []string
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

// DetectCourseContext analyzes request data to determine context for schema selection.
func DetectCourseContext(req service.GenerateLessonRequest) CourseContext {
	ctx := CourseContext{
		IsFirstInCourse:  req.IsFirstInCourse,
		IsLastInCourse:   req.IsLastInCourse,
		IsFirstInSection: req.IsFirstInSection,
		IsLastInSection:  req.IsLastInSection,
		AudienceLevel:    req.TargetAudience.ExperienceLevel,
	}

	// Collect SME domains
	for _, sme := range req.SMEKnowledge {
		ctx.SMEDomains = append(ctx.SMEDomains, sme.Domain)
	}

	// Detect technical course
	searchText := strings.ToLower(req.CourseTitle + " " + req.LessonTitle + " " + req.CourseDescription)
	for _, sme := range req.SMEKnowledge {
		searchText += " " + strings.ToLower(sme.Domain)
	}

	for _, kw := range technicalKeywords {
		if strings.Contains(searchText, kw) {
			ctx.IsTechnical = true
			break
		}
	}

	// Detect data-heavy content
	for _, kw := range dataKeywords {
		if strings.Contains(searchText, kw) {
			ctx.IsDataHeavy = true
			break
		}
	}

	return ctx
}

// SelectRelevantSchemas returns schemas appropriate for the given context.
func SelectRelevantSchemas(ctx CourseContext) []ComponentSchemaDefinition {
	// Always include core content types
	included := map[string]bool{
		"text":      true,
		"heading":   true,
		"image":     true,
		"quiz":      true,
		"callout":   true,
		"statement": true,
		"list":      true,
	}

	// Add code for technical courses
	if ctx.IsTechnical {
		included["code"] = true
	}

	// Add chart for data-heavy content
	if ctx.IsDataHeavy {
		included["chart"] = true
	}

	// Add quote for course intro/conclusion (good for memorable statements)
	if ctx.IsFirstInCourse || ctx.IsLastInCourse {
		included["quote"] = true
	}

	// Add richer media for intermediate/advanced audiences
	if ctx.AudienceLevel == "advanced" || ctx.AudienceLevel == "intermediate" {
		included["gallery"] = true
		included["multimedia"] = true
	}

	// Build result maintaining consistent order
	orderedTypes := []string{
		"heading", "text", "image", "quiz", "code",
		"callout", "statement", "quote", "list",
		"gallery", "multimedia", "chart", "divider",
	}

	var schemas []ComponentSchemaDefinition
	for _, typeName := range orderedTypes {
		if included[typeName] {
			schemas = append(schemas, componentSchemas[typeName])
		}
	}

	return schemas
}

// BuildComponentSchemasPromptSection creates the prompt section describing available components.
func BuildComponentSchemasPromptSection(schemas []ComponentSchemaDefinition) string {
	var sb strings.Builder

	sb.WriteString("## Available Component Types\n")
	sb.WriteString("Use these component types to create engaging, varied content:\n\n")

	for _, schema := range schemas {
		sb.WriteString("### ")
		sb.WriteString(strings.ToUpper(schema.Type))
		sb.WriteString("\n")
		sb.WriteString("**Purpose:** ")
		sb.WriteString(schema.Description)
		sb.WriteString("\n")
		sb.WriteString("**Schema:** `")
		sb.WriteString(schema.Schema)
		sb.WriteString("`\n\n")
	}

	return sb.String()
}

// BuildPositionGuidanceSection creates position-specific component recommendations.
func BuildPositionGuidanceSection(ctx CourseContext) string {
	var sb strings.Builder

	if ctx.IsFirstInCourse {
		sb.WriteString("**FIRST LESSON OF COURSE - Component Recommendations:**\n")
		sb.WriteString("- Start with HEADING + TEXT for welcoming introduction\n")
		sb.WriteString("- Use CALLOUT (info) to set course expectations\n")
		sb.WriteString("- Consider STATEMENT for the key course premise\n")
		sb.WriteString("- Use QUOTE if you have a relevant expert insight\n\n")
	} else if ctx.IsFirstInSection {
		sb.WriteString("**FIRST LESSON OF SECTION - Component Recommendations:**\n")
		sb.WriteString("- Start with HEADING to introduce section theme\n")
		sb.WriteString("- Use CALLOUT (info) to preview section goals\n\n")
	}

	if ctx.IsLastInCourse {
		sb.WriteString("**FINAL LESSON OF COURSE - Component Recommendations:**\n")
		sb.WriteString("- Use STATEMENT for memorable key takeaway\n")
		sb.WriteString("- Include CALLOUT (success) to celebrate completion\n")
		sb.WriteString("- Consider QUOTE for lasting impression\n")
		sb.WriteString("- End with encouragement and next steps\n\n")
	} else if ctx.IsLastInSection {
		sb.WriteString("**LAST LESSON OF SECTION - Component Recommendations:**\n")
		sb.WriteString("- Include CALLOUT (tip) summarizing section\n")
		sb.WriteString("- Prepare transition to next section\n\n")
	}

	return sb.String()
}
