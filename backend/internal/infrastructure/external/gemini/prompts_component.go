package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// buildComponentPlanPrompt creates the prompt for planning lesson components.
func buildComponentPlanPrompt(req service.GenerateLessonRequest) string {
	var sb strings.Builder

	// Detect context and select relevant schemas
	ctx := DetectCourseContext(req)
	relevantSchemas := SelectRelevantSchemas(ctx)

	sb.WriteString("You are an expert instructional designer planning components for a lesson.\n\n")

	// Course context
	sb.WriteString("## Course Overview\n")
	sb.WriteString(fmt.Sprintf("**Course Title:** %s\n", req.CourseTitle))
	if req.CourseDescription != "" {
		sb.WriteString(fmt.Sprintf("**Course Description:** %s\n", req.CourseDescription))
	}
	sb.WriteString("\n")

	// Course outline for context
	if len(req.CourseOutline) > 0 {
		sb.WriteString("## Course Structure\n")
		for _, section := range req.CourseOutline {
			marker := ""
			if section.Order == req.SectionOrder {
				marker = " ← CURRENT SECTION"
			}
			sb.WriteString(fmt.Sprintf("**Section %d: %s**%s\n", section.Order, section.Title, marker))
			for _, lesson := range section.Lessons {
				lessonMarker := ""
				if section.Order == req.SectionOrder && lesson.Order == req.LessonOrder {
					lessonMarker = " ← CURRENT LESSON"
				}
				sb.WriteString(fmt.Sprintf("  - Lesson %d: %s%s\n", lesson.Order, lesson.Title, lessonMarker))
			}
		}
		sb.WriteString("\n")
	}

	// Section context
	sb.WriteString("## Current Section\n")
	sb.WriteString(fmt.Sprintf("**Section %d:** %s\n", req.SectionOrder, req.SectionTitle))
	if req.SectionDescription != "" {
		sb.WriteString(fmt.Sprintf("**Description:** %s\n", req.SectionDescription))
	}
	if req.IsFirstSection {
		sb.WriteString("*This is the FIRST section of the course.*\n")
	}
	if req.IsLastSection {
		sb.WriteString("*This is the LAST section of the course.*\n")
	}
	sb.WriteString("\n")

	// Lesson context with position
	sb.WriteString("## Current Lesson\n")
	sb.WriteString(fmt.Sprintf("**Lesson %d:** %s\n", req.LessonOrder, req.LessonTitle))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n", req.LessonDescription))

	// Position indicators
	var positionNotes []string
	if req.IsFirstInCourse {
		positionNotes = append(positionNotes, "FIRST lesson in the entire course")
	}
	if req.IsLastInCourse {
		positionNotes = append(positionNotes, "LAST lesson in the entire course")
	}
	if req.IsFirstInSection && !req.IsFirstInCourse {
		positionNotes = append(positionNotes, "First lesson in this section")
	}
	if req.IsLastInSection && !req.IsLastInCourse {
		positionNotes = append(positionNotes, "Last lesson in this section")
	}
	if len(positionNotes) > 0 {
		sb.WriteString(fmt.Sprintf("**Position:** %s\n", strings.Join(positionNotes, ", ")))
	}
	sb.WriteString("\n")

	// Learning objectives
	sb.WriteString("## Learning Objectives\n")
	for _, obj := range req.LearningObjectives {
		sb.WriteString(fmt.Sprintf("- %s\n", obj))
	}
	sb.WriteString("\n")

	// Previously generated content in this section
	if len(req.PreviousLessonsInSection) > 0 {
		sb.WriteString("## Previously Completed Lessons in This Section\n")
		for _, prev := range req.PreviousLessonsInSection {
			sb.WriteString(fmt.Sprintf("**%s** (%d components)\n", prev.Title, prev.ComponentCount))
			if len(prev.KeyPoints) > 0 {
				sb.WriteString("Key points covered:\n")
				for _, point := range prev.KeyPoints {
					sb.WriteString(fmt.Sprintf("  - %s\n", point))
				}
			}
		}
		sb.WriteString("\n")
	}

	// Navigation context
	if req.PreviousLessonTitle != "" {
		sb.WriteString(fmt.Sprintf("**Previous Lesson:** %s\n", req.PreviousLessonTitle))
		if req.PreviousLessonSummary != "" {
			sb.WriteString(fmt.Sprintf("  Summary: %s\n", req.PreviousLessonSummary))
		}
	}
	if req.NextLessonTitle != "" {
		sb.WriteString(fmt.Sprintf("**Next Lesson:** %s\n", req.NextLessonTitle))
	}
	if req.NextSectionTitle != "" && req.IsLastInSection {
		sb.WriteString(fmt.Sprintf("**Next Section:** %s\n", req.NextSectionTitle))
	}
	sb.WriteString("\n")

	// Target audience
	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n\n", req.TargetAudience.ExperienceLevel))

	// Include additional context from wizard if provided
	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString("The course creator has provided the following additional instructions/context:\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	// Inject component schemas based on context
	sb.WriteString(BuildComponentSchemasPromptSection(relevantSchemas))

	// Instructions with position-aware guidance
	sb.WriteString("## Component Planning Instructions\n")
	sb.WriteString("Plan 5-8 components for this lesson using the component types above. For each component, specify:\n")
	sb.WriteString("1. The type (from the available types listed above)\n")
	sb.WriteString("2. A brief purpose describing what it will contain\n\n")

	sb.WriteString("Required components:\n")
	sb.WriteString("- At least 1 heading (for structure)\n")
	sb.WriteString("- At least 2 text components (for core content)\n")
	sb.WriteString("- At least 1 image (for visual learning)\n")
	sb.WriteString("- At least 1 quiz (for knowledge check)\n")
	sb.WriteString("- Consider using callout, statement, or list for variety and engagement\n\n")

	// Anti-patterns section - critical rules to prevent poor lesson structure
	sb.WriteString("## CRITICAL RULES (MUST FOLLOW)\n")
	sb.WriteString("1. NEVER place 2 or more IMAGE components consecutively - ALWAYS separate images with TEXT, HEADING, or other content\n")
	sb.WriteString("2. NEVER start a lesson with IMAGE - always start with HEADING followed by TEXT\n")
	sb.WriteString("3. TEXT components are the core educational content - each IMAGE must be preceded by TEXT that explains the concept\n")
	sb.WriteString("4. Maximum 3 IMAGE components per lesson - visuals support text, not replace it\n")
	sb.WriteString("5. Every lesson MUST have substantive text content explaining concepts\n\n")

	sb.WriteString("## Anti-Patterns to AVOID\n")
	sb.WriteString("- ❌ IMAGE, IMAGE, IMAGE (consecutive images with no content between)\n")
	sb.WriteString("- ❌ IMAGE, IMAGE (even 2 consecutive images is wrong)\n")
	sb.WriteString("- ❌ Starting lesson with IMAGE instead of HEADING + TEXT\n")
	sb.WriteString("- ❌ Lessons with only images and no text explanations\n")
	sb.WriteString("- ❌ More than 3 images total in a single lesson\n\n")

	sb.WriteString("## CORRECT Pattern Examples\n")
	sb.WriteString("✅ HEADING → TEXT → IMAGE → TEXT → QUIZ\n")
	sb.WriteString("✅ HEADING → TEXT → IMAGE → TEXT → CALLOUT → IMAGE → TEXT → QUIZ\n")
	sb.WriteString("✅ HEADING → TEXT → LIST → IMAGE → TEXT → QUIZ\n\n")

	// Position-specific guidance (context-aware)
	sb.WriteString(BuildPositionGuidanceSection(ctx))

	sb.WriteString("General structure:\n")
	sb.WriteString("1. Introduction heading and text\n")
	sb.WriteString("2. Main content with explanations and examples\n")
	sb.WriteString("3. Visual elements and emphasis components\n")
	sb.WriteString("4. Quiz to check understanding\n")
	sb.WriteString("5. Summary or key takeaways\n")

	return sb.String()
}

// buildSingleComponentPrompt creates the prompt for a single component (no position).
func buildSingleComponentPrompt(req service.GenerateLessonRequest, planned plannedComponent, previousComponents string) string {
	return buildSingleComponentPromptWithPosition(req, planned, previousComponents, componentPosition{})
}
