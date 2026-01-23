package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// buildLessonPrompt creates the prompt for full lesson content generation (legacy).
func buildLessonPrompt(req service.GenerateLessonRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating lesson content.\n\n")

	sb.WriteString("## Lesson Information\n")
	sb.WriteString(fmt.Sprintf("**Course:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Section:** %s\n", req.SectionTitle))
	sb.WriteString(fmt.Sprintf("**Lesson:** %s\n", req.LessonTitle))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", req.LessonDescription))

	sb.WriteString("## Learning Objectives\n")
	for _, obj := range req.LearningObjectives {
		sb.WriteString(fmt.Sprintf("- %s\n", obj))
	}
	sb.WriteString("\n")

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n", req.TargetAudience.ExperienceLevel))
	if len(req.TargetAudience.Challenges) > 0 {
		sb.WriteString(fmt.Sprintf("**Challenges:** %s\n", strings.Join(req.TargetAudience.Challenges, ", ")))
	}
	sb.WriteString("\n")

	// Include additional context from wizard if provided
	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString("The course creator has provided the following additional instructions/context:\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## Subject Matter Expert Knowledge\n")
	for _, sme := range req.SMEKnowledge {
		sb.WriteString(fmt.Sprintf("\n### %s (%s)\n", sme.SMEName, sme.Domain))
		for i, chunk := range sme.Chunks {
			if i < 3 { // Limit chunks per lesson
				sb.WriteString(fmt.Sprintf("\n%s\n", chunk))
			}
		}
	}
	sb.WriteString("\n")

	if req.PreviousLessonTitle != "" {
		sb.WriteString(fmt.Sprintf("**Previous Lesson:** %s\n", req.PreviousLessonTitle))
	}
	if req.NextLessonTitle != "" {
		sb.WriteString(fmt.Sprintf("**Next Lesson:** %s\n", req.NextLessonTitle))
	}
	sb.WriteString("\n")

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create engaging lesson content using these component types:\n")
	sb.WriteString("- **heading**: Section headers (use h2 for main sections, h3 for subsections)\n")
	sb.WriteString("- **text**: Rich text content with explanations and examples\n")
	sb.WriteString("- **image**: Suggested images with descriptive placeholders\n")
	sb.WriteString("- **quiz**: Knowledge check questions to reinforce learning\n\n")
	sb.WriteString("Structure the lesson with:\n")
	sb.WriteString("1. Introduction (heading + text)\n")
	sb.WriteString("2. Main content sections with explanations and examples\n")
	sb.WriteString("3. At least one quiz to check understanding\n")
	sb.WriteString("4. Summary or key takeaways\n\n")

	if !req.IsLastInCourse && req.NextLessonTitle != "" {
		sb.WriteString("Include a segue_text that transitions to the next lesson.\n")
	} else {
		sb.WriteString("This is the final lesson, so provide a course conclusion in segue_text.\n")
	}

	return sb.String()
}

// buildRegeneratePrompt creates the prompt for regenerating a component.
func buildRegeneratePrompt(req service.RegenerateComponentRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer modifying lesson content.\n\n")

	sb.WriteString("## Current Content\n")
	sb.WriteString(fmt.Sprintf("**Component Type:** %s\n", req.ComponentType))
	sb.WriteString(fmt.Sprintf("**Current Content:**\n```json\n%s\n```\n\n", req.CurrentContentJSON))

	sb.WriteString("## Modification Request\n")
	sb.WriteString(req.ModificationPrompt)
	sb.WriteString("\n\n")

	if req.LessonContext != "" {
		sb.WriteString("## Lesson Context\n")
		sb.WriteString(req.LessonContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n\n", req.TargetAudience.ExperienceLevel))

	sb.WriteString("## Instructions\n")
	sb.WriteString("Regenerate the component according to the modification request.\n")
	sb.WriteString("Maintain the same component type and structure.\n")
	sb.WriteString("Ensure the content is appropriate for the target audience.\n")

	return sb.String()
}

// buildSeguePrompt creates the prompt for generating transition text.
func buildSeguePrompt(req service.GenerateLessonRequest) string {
	var sb strings.Builder

	sb.WriteString("You are writing a transition to connect lessons.\n\n")

	// Context
	sb.WriteString("## Current Context\n")
	sb.WriteString(fmt.Sprintf("**Course:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Current Section:** %s\n", req.SectionTitle))
	sb.WriteString(fmt.Sprintf("**Current Lesson:** %s\n", req.LessonTitle))

	// Determine transition type
	if req.IsLastInCourse {
		sb.WriteString("\n## Transition Type: COURSE CONCLUSION\n")
		sb.WriteString("This is the final lesson of the entire course.\n\n")
		sb.WriteString("## Instructions\n")
		sb.WriteString("Write 2-3 sentences that:\n")
		sb.WriteString("- Congratulate the learner on completing the course\n")
		sb.WriteString("- Summarize the key achievement\n")
		sb.WriteString("- Encourage applying the learned skills\n")
		sb.WriteString("- Optionally suggest next steps or resources\n")
	} else if req.IsLastInSection && req.NextSectionTitle != "" {
		sb.WriteString(fmt.Sprintf("\n## Transition Type: SECTION TO SECTION\n"))
		sb.WriteString(fmt.Sprintf("**Next Section:** %s\n", req.NextSectionTitle))
		if req.NextLessonTitle != "" {
			sb.WriteString(fmt.Sprintf("**First Lesson of Next Section:** %s\n", req.NextLessonTitle))
		}
		sb.WriteString("\n## Instructions\n")
		sb.WriteString("Write 2-3 sentences that:\n")
		sb.WriteString("- Acknowledge completion of the current section\n")
		sb.WriteString("- Preview what's coming in the next section\n")
		sb.WriteString("- Build excitement for the new topics\n")
		sb.WriteString("- Create a smooth bridge between sections\n")
	} else {
		sb.WriteString(fmt.Sprintf("\n## Transition Type: LESSON TO LESSON\n"))
		sb.WriteString(fmt.Sprintf("**Next Lesson:** %s\n", req.NextLessonTitle))
		sb.WriteString("\n## Instructions\n")
		sb.WriteString("Write 1-2 sentences that:\n")
		sb.WriteString("- Connect the concepts just learned to the next topic\n")
		sb.WriteString("- Create natural flow between lessons\n")
		sb.WriteString("- Motivate the learner to continue\n")
	}

	return sb.String()
}

// buildSMEProcessingPrompt creates the prompt for SME content processing.
func buildSMEProcessingPrompt(req service.ProcessSMEContentRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert at extracting and organizing knowledge for educational content.\n\n")

	sb.WriteString("## Subject Matter Expert Information\n")
	sb.WriteString(fmt.Sprintf("**Name:** %s\n", req.SMEName))
	sb.WriteString(fmt.Sprintf("**Domain:** %s\n\n", req.SMEDomain))

	sb.WriteString("## Source Content\n")
	sb.WriteString(req.ExtractedText)
	sb.WriteString("\n\n")

	sb.WriteString("## Instructions\n")
	sb.WriteString("Analyze this content and extract key knowledge:\n\n")
	sb.WriteString("1. **Summary**: Write a comprehensive summary (2-3 paragraphs) of the main knowledge.\n\n")
	sb.WriteString("2. **Knowledge Chunks**: Extract discrete, self-contained pieces of knowledge:\n")
	sb.WriteString("   - Each chunk should cover one concept or topic\n")
	sb.WriteString("   - Assign a topic category to each chunk\n")
	sb.WriteString("   - Extract relevant keywords\n")
	sb.WriteString("   - Rate relevance (0-1) based on how useful this is for course creation\n")
	sb.WriteString("   - Aim for 5-15 chunks depending on content density\n\n")
	sb.WriteString("Focus on actionable knowledge that can be taught to learners.\n")

	return sb.String()
}

// buildSummarizePrompt creates the prompt for content summarization.
func buildSummarizePrompt(content string) string {
	return fmt.Sprintf(`You are an expert at creating concise summaries of knowledge content.

## Content to Summarize
%s

## Instructions
Create a clear, concise summary of the above content. The summary should:
- Capture the key points and main ideas
- Be 2-4 paragraphs long
- Be written in a professional, educational tone
- Preserve important details and facts
- Be suitable for use as SME knowledge for course generation

Return only the summary text without any additional formatting or headers.`, content)
}

// buildImprovePrompt creates the prompt for content improvement.
func buildImprovePrompt(content string) string {
	return fmt.Sprintf(`You are an expert editor who improves content for clarity and structure.

## Content to Improve
%s

## Instructions
Improve the above content by:
- Fixing grammar and spelling errors
- Improving clarity and readability
- Organizing information logically
- Breaking up long paragraphs
- Adding appropriate structure (headers, bullet points where helpful)
- Maintaining the original meaning and facts
- Keeping a professional, educational tone

Return only the improved content without any additional commentary.`, content)
}
