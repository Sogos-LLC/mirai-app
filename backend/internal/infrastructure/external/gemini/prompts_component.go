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

	// CRITICAL: Internal Data Only constraint
	if req.InternalDataOnly {
		sb.WriteString("## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE\n")
		sb.WriteString("**All lesson content MUST come from the provided source material below.**\n\n")
		sb.WriteString("You are strictly forbidden from:\n")
		sb.WriteString("- Adding any information not present in the source documents\n")
		sb.WriteString("- Making up examples, facts, statistics, or explanations\n")
		sb.WriteString("- Using general knowledge to fill gaps\n")
		sb.WriteString("- Defaulting to coding, computer science, or any specific domain examples unless the source material is about that topic\n")
		sb.WriteString("- Creating more content than the source material can support\n\n")
		sb.WriteString("If source material is insufficient for planned components, create FEWER components.\n")
		sb.WriteString("Quality over quantity - smaller, accurate lessons are better than hallucinated ones.\n\n")

		// Include Team RAG context first (priority source)
		if req.IncludeTeamKnowledge && len(req.TeamRAGContext) > 0 {
			sb.WriteString("## Team Knowledge (PRIORITY SOURCE)\n")
			sb.WriteString("This content comes from the organization's team knowledge base and should be prioritized:\n\n")

			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.TeamRAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}

			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("### From Team: %s\n", sourceName))
				for _, chunk := range chunks {
					sb.WriteString(fmt.Sprintf("```\n%s\n```\n\n", chunk.Content))
				}
			}
		}

		// Include course-specific RAG context
		if len(req.RAGContext) > 0 {
			sb.WriteString("## Source Content (Retrieved from Knowledge Sources)\n")
			sb.WriteString("Use ONLY this content to build the lesson. Every fact, example, and explanation must come from here:\n\n")

			// Group chunks by source for better organization
			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.RAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}

			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("### From: %s\n", sourceName))
				for _, chunk := range chunks {
					sb.WriteString(fmt.Sprintf("```\n%s\n```\n\n", chunk.Content))
				}
			}
		} else if !req.IncludeTeamKnowledge || len(req.TeamRAGContext) == 0 {
			sb.WriteString("**WARNING:** No source content provided. Generate minimal placeholder content.\n\n")
		}
	} else if req.IncludeTeamKnowledge && len(req.TeamRAGContext) > 0 {
		// Not Internal Data Only, but team knowledge is included
		sb.WriteString("## Team Knowledge (PRIORITY SOURCE)\n")
		sb.WriteString("The following content comes from the organization's team knowledge base.\n")
		sb.WriteString("**Prioritize this content when creating lesson components.**\n\n")

		sourceChunks := make(map[string][]service.RAGChunkInput)
		for _, chunk := range req.TeamRAGContext {
			sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
		}

		for sourceName, chunks := range sourceChunks {
			sb.WriteString(fmt.Sprintf("### From Team: %s\n", sourceName))
			for _, chunk := range chunks {
				sb.WriteString(fmt.Sprintf("```\n%s\n```\n\n", chunk.Content))
			}
		}
	}

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
	sb.WriteString("Plan 8-12 components for this lesson using the component types above. For each component, specify:\n")
	sb.WriteString("1. The type (from the available types listed above)\n")
	sb.WriteString("2. A brief purpose describing what it will contain\n\n")

	sb.WriteString("Required components:\n")
	sb.WriteString("- Multiple headings (for structure and scannability)\n")
	sb.WriteString("- SHORT text components (2-3 sentences max per text block)\n")
	sb.WriteString("- At least 1 image (for visual learning)\n")
	sb.WriteString("- Exactly 1 QUIZ as the LAST component (knowledge check)\n")
	sb.WriteString("- Use STATEMENT for definitions and key takeaways\n")
	sb.WriteString("- Use LIST for comparisons, steps, or related items\n")
	sb.WriteString("- Use CALLOUT for important tips, warnings, or emphasis\n\n")

	// Instructional design principles
	sb.WriteString("## INSTRUCTIONAL DESIGN PRINCIPLES (CRITICAL)\n")
	sb.WriteString("You are creating a LEARNING EXPERIENCE, not a document. Ask yourself for each concept:\n")
	sb.WriteString("'What learning outcome is this trying to achieve, and which component best supports that outcome?'\n\n")

	sb.WriteString("**Map content to components by purpose:**\n")
	sb.WriteString("- Definitions → STATEMENT (short, memorable, quotable)\n")
	sb.WriteString("- Comparisons → LIST (side-by-side clarity)\n")
	sb.WriteString("- Key principles → CALLOUT (visual emphasis)\n")
	sb.WriteString("- Sequential steps → LIST with 'process' or 'numbered' style\n")
	sb.WriteString("- Detailed explanations → LIST with 'accordion' style (expandable)\n")
	sb.WriteString("- Brief context → TEXT (2-3 sentences only)\n")
	sb.WriteString("- Visual concepts → IMAGE with preceding context\n\n")

	sb.WriteString("**NEVER do this:**\n")
	sb.WriteString("- ❌ Long paragraphs (more than 3 sentences in TEXT)\n")
	sb.WriteString("- ❌ Multiple concepts in one TEXT component\n")
	sb.WriteString("- ❌ Definitions buried in paragraphs (use STATEMENT)\n")
	sb.WriteString("- ❌ Comparisons in prose (use LIST)\n")
	sb.WriteString("- ❌ Content dumping without structure\n")
	sb.WriteString("- ❌ Walls of text that ignore visual hierarchy\n\n")

	sb.WriteString("**List Style Selection (CRITICAL):**\n")
	sb.WriteString("- 'accordion' (DEFAULT) - Expandable items with details. USE THIS for any list that explains concepts. BEST for learning UX.\n")
	sb.WriteString("- 'numbered' - ONLY for sequential steps (1, 2, 3...) or ranked items\n")
	sb.WriteString("- 'process' - ONLY for multi-stage workflows or pipelines\n")
	sb.WriteString("- 'icon' - Feature lists with checkmarks\n")
	sb.WriteString("- 'bulleted' - AVOID. Only use for truly simple unordered items with no explanations\n\n")
	sb.WriteString("**ALWAYS DEFAULT TO 'accordion'** unless the content is purely sequential steps.\n\n")

	// Strict content limits section
	sb.WriteString("## STRICT CONTENT LIMITS (ENFORCED)\n")
	sb.WriteString("These limits are validated after generation - violations will cause regeneration:\n\n")
	sb.WriteString("| Component | Limit | Description |\n")
	sb.WriteString("|-----------|-------|-------------|\n")
	sb.WriteString("| TEXT | Max 500 chars | 2-3 short sentences per text block |\n")
	sb.WriteString("| LIST | Max 7 items | Keep lists focused and scannable |\n")
	sb.WriteString("| STATEMENT | Max 200 chars | One memorable key takeaway |\n")
	sb.WriteString("| CALLOUT | Max 300 chars | Brief important info or tip |\n")
	sb.WriteString("| QUIZ | 2-5 options | Multiple choice only |\n\n")
	sb.WriteString("**Structural Requirements:**\n")
	sb.WriteString("- Minimum 4 different component types per lesson (variety)\n")
	sb.WriteString("- At least 1 STATEMENT or CALLOUT per lesson (emphasis)\n")
	sb.WriteString("- No consecutive HEADING components (add content between)\n")
	sb.WriteString("- No consecutive IMAGE components\n\n")

	// Anti-patterns section - critical rules to prevent poor lesson structure
	sb.WriteString("## CRITICAL RULES (MUST FOLLOW)\n")
	sb.WriteString("1. QUIZ must be the LAST component - exactly ONE quiz per lesson as a knowledge check\n")
	sb.WriteString("2. TEXT components must be SHORT - maximum 2-3 sentences each\n")
	sb.WriteString("3. NEVER place 2 or more IMAGE components consecutively\n")
	sb.WriteString("4. NEVER start a lesson with IMAGE - always start with HEADING\n")
	sb.WriteString("5. Maximum 3 IMAGE components per lesson\n")
	sb.WriteString("6. Use STATEMENT for definitions, not long TEXT paragraphs\n")
	sb.WriteString("7. Use LIST for any comparison, sequence, or related items\n\n")

	sb.WriteString("## Anti-Patterns to AVOID\n")
	sb.WriteString("- ❌ Long TEXT paragraphs (more than 3 sentences) - BREAK THEM UP\n")
	sb.WriteString("- ❌ Multiple QUIZ components - only ONE at the END\n")
	sb.WriteString("- ❌ QUIZ in the middle of lesson - must be LAST\n")
	sb.WriteString("- ❌ Definitions in TEXT - use STATEMENT instead\n")
	sb.WriteString("- ❌ Comparisons in prose - use LIST instead\n")
	sb.WriteString("- ❌ IMAGE, IMAGE (consecutive images)\n")
	sb.WriteString("- ❌ Starting lesson with IMAGE\n")
	sb.WriteString("- ❌ Content dumping in one big TEXT block\n\n")

	sb.WriteString("## CORRECT Pattern Examples\n")
	sb.WriteString("✅ HEADING → TEXT (2-3 sentences) → STATEMENT (definition) → LIST (key points) → IMAGE → CALLOUT → QUIZ\n")
	sb.WriteString("✅ HEADING → TEXT → LIST (process style) → IMAGE → HEADING → STATEMENT → TEXT → QUIZ\n")
	sb.WriteString("✅ HEADING → STATEMENT → TEXT → LIST (accordion) → CALLOUT → IMAGE → QUIZ\n\n")

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
