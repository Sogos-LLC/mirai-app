package gemini

import (
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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
