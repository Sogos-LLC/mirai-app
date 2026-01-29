package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// buildSingleComponentPromptWithPosition creates the prompt for generating a single component with position awareness.
func buildSingleComponentPromptWithPosition(req service.GenerateLessonRequest, planned plannedComponent, previousComponents string, pos componentPosition) string {
	var sb strings.Builder

	sb.WriteString("You are generating a single educational component for a lesson.\n\n")

	// CRITICAL: Internal Data Only constraint
	if req.InternalDataOnly {
		sb.WriteString("## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE\n")
		sb.WriteString("**This component's content MUST come ONLY from the provided source material.**\n\n")
		sb.WriteString("You are strictly forbidden from:\n")
		sb.WriteString("- Adding any information not present in the source documents\n")
		sb.WriteString("- Making up examples, facts, or explanations\n")
		sb.WriteString("- Using general knowledge to fill gaps\n")
		sb.WriteString("- Defaulting to domain-specific examples not in the source\n\n")

		// Include RAG context
		if len(req.RAGContext) > 0 {
			sb.WriteString("## Source Content (Use ONLY this material)\n")

			// Group chunks by source for better organization
			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.RAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}

			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("**[%s]**\n", sourceName))
				for _, chunk := range chunks {
					sb.WriteString(fmt.Sprintf("```\n%s\n```\n\n", chunk.Content))
				}
			}
		}
	}

	// Course and lesson context
	sb.WriteString("## Context\n")
	sb.WriteString(fmt.Sprintf("**Course:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Section %d:** %s\n", req.SectionOrder, req.SectionTitle))
	sb.WriteString(fmt.Sprintf("**Lesson %d:** %s\n", req.LessonOrder, req.LessonTitle))
	sb.WriteString(fmt.Sprintf("**Lesson Description:** %s\n\n", req.LessonDescription))

	// Lesson position context
	var lessonPosition []string
	if req.IsFirstInCourse {
		lessonPosition = append(lessonPosition, "First lesson of the entire course")
	}
	if req.IsLastInCourse {
		lessonPosition = append(lessonPosition, "Final lesson of the entire course")
	}
	if req.IsFirstInSection && !req.IsFirstInCourse {
		lessonPosition = append(lessonPosition, "First lesson in this section")
	}
	if req.IsLastInSection && !req.IsLastInCourse {
		lessonPosition = append(lessonPosition, "Last lesson in this section")
	}
	if len(lessonPosition) > 0 {
		sb.WriteString(fmt.Sprintf("**Lesson Position:** %s\n\n", strings.Join(lessonPosition, ", ")))
	}

	// Component position context
	sb.WriteString("## Component to Generate\n")
	sb.WriteString(fmt.Sprintf("**Type:** %s\n", planned.ComponentType))
	sb.WriteString(fmt.Sprintf("**Purpose:** %s\n", planned.Purpose))
	if pos.Total > 0 {
		sb.WriteString(fmt.Sprintf("**Position:** Component %d of %d in this lesson\n", pos.Index+1, pos.Total))
		if pos.IsFirst {
			sb.WriteString("*This is the FIRST component of the lesson.*\n")
		}
		if pos.IsLast {
			sb.WriteString("*This is the LAST component of the lesson.*\n")
		}
	}
	sb.WriteString("\n")

	// Previous components
	if previousComponents != "" {
		sb.WriteString("## Previously Generated Components in This Lesson\n")
		sb.WriteString(previousComponents)
		sb.WriteString("\n")
	}

	// Navigation context for transitions
	if pos.IsFirst && req.PreviousLessonTitle != "" {
		sb.WriteString("## Coming From\n")
		sb.WriteString(fmt.Sprintf("The previous lesson was: %s\n", req.PreviousLessonTitle))
		if req.PreviousLessonSummary != "" {
			sb.WriteString(fmt.Sprintf("Summary: %s\n", req.PreviousLessonSummary))
		}
		sb.WriteString("\n")
	}

	if pos.IsLast {
		sb.WriteString("## Going To\n")
		if req.IsLastInCourse {
			sb.WriteString("This is the final lesson of the course - conclude with accomplishment and next steps.\n")
		} else if req.IsLastInSection && req.NextSectionTitle != "" {
			sb.WriteString(fmt.Sprintf("Next section: %s\n", req.NextSectionTitle))
			if req.NextLessonTitle != "" {
				sb.WriteString(fmt.Sprintf("First lesson of next section: %s\n", req.NextLessonTitle))
			}
		} else if req.NextLessonTitle != "" {
			sb.WriteString(fmt.Sprintf("Next lesson: %s\n", req.NextLessonTitle))
		}
		sb.WriteString("\n")
	}

	// Target audience
	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n\n", req.TargetAudience.ExperienceLevel))

	// Include additional context from wizard if provided
	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	// Type-specific instructions with position awareness
	sb.WriteString("## Instructions\n")
	writeComponentInstructions(&sb, planned.ComponentType, pos, req)

	return sb.String()
}

// writeComponentInstructions writes component-specific instructions to the builder.
func writeComponentInstructions(sb *strings.Builder, componentType string, pos componentPosition, req service.GenerateLessonRequest) {
	switch componentType {
	case "heading":
		sb.WriteString("Generate a heading with:\n")
		sb.WriteString("- heading_level: 2 for main sections, 3 for subsections\n")
		sb.WriteString("- heading_text: Clear, descriptive heading text\n")
		if pos.IsFirst && req.IsFirstInCourse {
			sb.WriteString("\n*As the first heading of the course, make it welcoming and set the stage.*\n")
		} else if pos.IsFirst && req.IsFirstInSection {
			sb.WriteString("\n*As the first heading of this section, introduce the section's theme.*\n")
		}
	case "text":
		sb.WriteString("Generate text content with:\n")
		sb.WriteString("- text_html: 2-3 SHORT paragraphs of HTML-formatted content\n")
		sb.WriteString("- Use <p> tags for each paragraph\n")
		sb.WriteString("- Add <br> between paragraphs for visual spacing (single line break, not double)\n")
		sb.WriteString("- If content has sub-sections (like intro + items), separate them with <br>\n")
		sb.WriteString("- Can include <strong>, <em> for emphasis\n")
		sb.WriteString("- Keep each paragraph to 2-3 sentences MAX\n")
		sb.WriteString("- Be educational and engaging\n")
		sb.WriteString("\n**Text Formatting Example:**\n")
		sb.WriteString("```html\n<p>First paragraph introducing the concept.</p><br>\n")
		sb.WriteString("<p><strong>Key Point 1:</strong> Explanation here.</p><br>\n")
		sb.WriteString("<p><strong>Key Point 2:</strong> Explanation here.</p>\n```\n")
		if pos.IsFirst && req.IsFirstInCourse {
			sb.WriteString("\n*As the first text of the course, welcome learners and set expectations.*\n")
		}
		if pos.IsLast && req.IsLastInCourse {
			sb.WriteString("\n*As the final text of the course, provide a strong conclusion and celebrate completion.*\n")
		} else if pos.IsLast && req.IsLastInSection {
			sb.WriteString("\n*As the last text in this section, summarize key takeaways and prepare for the next section.*\n")
		}
	case "image":
		sb.WriteString("Generate an image placeholder with:\n")
		sb.WriteString("- image_description: Detailed description of the image to show\n")
		sb.WriteString("- image_alt_text: Accessibility description\n")
		sb.WriteString("- image_caption: Optional caption\n")
	case "quiz":
		sb.WriteString("Generate a quiz question with:\n")
		sb.WriteString("- quiz_question: Clear question text\n")
		sb.WriteString("- quiz_options: 3-4 answer options with id (a,b,c,d) and text\n")
		sb.WriteString("- quiz_correct_answer_id: The correct option's id\n")
		sb.WriteString("- quiz_explanation: Why the correct answer is right\n")
		if pos.IsLast {
			sb.WriteString("\n*As the final component, make this quiz reinforce the key learning objectives.*\n")
		}
	case "code":
		sb.WriteString("Generate a code snippet with:\n")
		sb.WriteString("- code: Relevant code example (5-15 lines)\n")
		sb.WriteString("- language: Programming language (javascript, python, go, etc.)\n")
	case "callout":
		sb.WriteString("Generate a callout with:\n")
		sb.WriteString("- style: info, warning, success, error, or tip\n")
		sb.WriteString("- title: Optional short title\n")
		sb.WriteString("- content: Important information (1-2 sentences)\n")
		if pos.IsLast && req.IsLastInSection {
			sb.WriteString("\n*Consider using a 'tip' or 'success' callout to summarize key section takeaways.*\n")
		}
	case "statement":
		sb.WriteString("Generate a STATEMENT - a key takeaway that emphasizes a critical concept.\n\n")
		sb.WriteString("**Guidelines:**\n")
		sb.WriteString("- statement_text: Write 1-2 sentences maximum focusing on ONE key principle or insight\n")
		sb.WriteString("- statement_subtext: Optional brief supporting context (1 sentence)\n")
		sb.WriteString("- Make it memorable and quotable - this should be the 'golden nugget' learners remember\n")
		sb.WriteString("- Avoid jargon - use clear, direct language\n")
		if pos.IsLast {
			sb.WriteString("\n*As the final statement, capture the single most important takeaway from this lesson.*\n")
		}
	case "quote":
		sb.WriteString("Generate a quote with:\n")
		sb.WriteString("- text: The quote text (1-3 sentences)\n")
		sb.WriteString("- attribution: Who said it - name, title, or source\n")
	case "list":
		sb.WriteString("Generate a list with:\n")
		sb.WriteString("- style: REQUIRED - choose from: accordion (DEFAULT), numbered, process, icon, bulleted\n")
		sb.WriteString("- items: Array of list items\n")
		sb.WriteString("- title: Optional title above the list\n\n")
		sb.WriteString("**STYLE SELECTION (IMPORTANT):**\n")
		sb.WriteString("- 'accordion' (DEFAULT) - Use for ANY list with explanations. Items expand to show details. BEST for learning UX.\n")
		sb.WriteString("  Items MUST have both 'text' (collapsed header) AND 'description' (expanded content)\n")
		sb.WriteString("- 'numbered' - ONLY for sequential steps or ranked items (1, 2, 3...)\n")
		sb.WriteString("- 'process' - ONLY for multi-stage workflows or pipelines\n")
		sb.WriteString("- 'icon' - For feature lists with checkmarks\n")
		sb.WriteString("- 'bulleted' - AVOID unless truly unordered with no explanations needed\n\n")
		sb.WriteString("**Accordion Item Format:**\n")
		sb.WriteString("```json\n{\"style\": \"accordion\", \"items\": [\n")
		sb.WriteString("  {\"text\": \"Item Title\", \"description\": \"Detailed explanation when expanded\"},\n")
		sb.WriteString("  {\"text\": \"Another Item\", \"description\": \"More details here\"}\n]}\n```\n")
	case "gallery":
		sb.WriteString("Generate a gallery with:\n")
		sb.WriteString("- style: carousel or labeled_graphic\n")
		sb.WriteString("- images: 2-5 images with description, alt_text, and optional caption\n")
	case "multimedia":
		sb.WriteString("Generate a multimedia placeholder with:\n")
		sb.WriteString("- media_type: video or audio\n")
		sb.WriteString("- description: What the media should show or explain\n")
		sb.WriteString("- caption: Optional caption or transcript hint\n")
	case "chart":
		sb.WriteString("Generate a chart with:\n")
		sb.WriteString("- chart_type: bar, line, pie, or table\n")
		sb.WriteString("- title: Chart title\n")
		sb.WriteString("- labels: Array of data labels\n")
		sb.WriteString("- values: Array of numeric values\n")
	case "divider":
		sb.WriteString("Generate a divider with:\n")
		sb.WriteString("- style: line, dots, or space\n")
	default:
		sb.WriteString("Generate the component content following the expected schema.\n")
	}
}
