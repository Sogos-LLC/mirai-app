package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

func buildSectionsOnlyPrompt(req service.GenerateOutlineRequest) string {
	// Use Internal Data Only prompt if that mode is enabled
	if req.InternalDataOnly && (len(req.RAGContext) > 0 || len(req.DocumentIndices) > 0) {
		return buildInternalDataOnlySectionsPrompt(req)
	}

	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a course outline.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n", req.TargetAudience.ExperienceLevel))
	if len(req.TargetAudience.LearningGoals) > 0 {
		sb.WriteString(fmt.Sprintf("**Learning Goals:** %s\n", strings.Join(req.TargetAudience.LearningGoals, ", ")))
	}
	if len(req.TargetAudience.Prerequisites) > 0 {
		sb.WriteString(fmt.Sprintf("**Prerequisites:** %s\n", strings.Join(req.TargetAudience.Prerequisites, ", ")))
	}
	if len(req.TargetAudience.Challenges) > 0 {
		sb.WriteString(fmt.Sprintf("**Challenges:** %s\n", strings.Join(req.TargetAudience.Challenges, ", ")))
	}
	if req.TargetAudience.IndustryContext != "" {
		sb.WriteString(fmt.Sprintf("**Industry Context:** %s\n", req.TargetAudience.IndustryContext))
	}
	sb.WriteString("\n")

	sb.WriteString("## Subject Matter Expert Knowledge\n")
	for _, sme := range req.SMEKnowledge {
		sb.WriteString(fmt.Sprintf("\n### %s (%s)\n", sme.SMEName, sme.Domain))
		if sme.Summary != "" {
			sb.WriteString(fmt.Sprintf("**Summary:** %s\n", sme.Summary))
		}
		if len(sme.Keywords) > 0 {
			sb.WriteString(fmt.Sprintf("**Key Topics:** %s\n", strings.Join(sme.Keywords, ", ")))
		}
		for i, chunk := range sme.Chunks {
			if i < 5 {
				sb.WriteString(fmt.Sprintf("\n%s\n", chunk))
			}
		}
	}
	sb.WriteString("\n")

	// Include Team Knowledge if available
	if req.IncludeTeamKnowledge && (len(req.TeamDocumentIndices) > 0 || len(req.TeamRAGContext) > 0) {
		sb.WriteString("## Team Knowledge (PRIORITY SOURCE)\n")
		sb.WriteString("The following content comes from the organization's team knowledge base.\n")
		sb.WriteString("**Prioritize this content when creating the course outline.**\n\n")

		// Team document indices
		if len(req.TeamDocumentIndices) > 0 {
			sb.WriteString("### Team Documents Available\n")
			for _, doc := range req.TeamDocumentIndices {
				sb.WriteString(fmt.Sprintf("**%s**", doc.SourceName))
				if doc.Title != "" {
					sb.WriteString(fmt.Sprintf(" - %s", doc.Title))
				}
				sb.WriteString("\n")
				if len(doc.MainTopics) > 0 {
					sb.WriteString(fmt.Sprintf("  Topics: %s\n", strings.Join(doc.MainTopics, ", ")))
				}
				if len(doc.KeyConcepts) > 0 {
					sb.WriteString(fmt.Sprintf("  Concepts: %s\n", strings.Join(doc.KeyConcepts, ", ")))
				}
			}
			sb.WriteString("\n")
		}

		// Team RAG context
		if len(req.TeamRAGContext) > 0 {
			sb.WriteString("### Team Knowledge Content\n")
			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.TeamRAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}
			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("**From: %s**\n", sourceName))
				for _, chunk := range chunks {
					sb.WriteString(fmt.Sprintf("```\n%s\n```\n", chunk.Content))
				}
				sb.WriteString("\n")
			}
		}
	}

	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create a high-level course outline with sections and lesson titles.\n")
	sb.WriteString("Each section should have a clear theme and 2-5 lessons.\n")
	sb.WriteString("For each section, provide the section title, description, and a list of lesson titles.\n")
	sb.WriteString("Ensure content flows logically and builds on previous sections.\n")
	if req.IncludeTeamKnowledge && (len(req.TeamDocumentIndices) > 0 || len(req.TeamRAGContext) > 0) {
		sb.WriteString("**IMPORTANT:** Prioritize team knowledge when available. Incorporate team-specific terminology, examples, and practices.\n")
	}

	return sb.String()
}

// buildInternalDataOnlySectionsPrompt creates a prompt for Internal Data Only mode.
// This prompt strictly instructs the AI to use ONLY the provided document content.
func buildInternalDataOnlySectionsPrompt(req service.GenerateOutlineRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a course outline.\n\n")

	// CRITICAL: Internal Data Only instructions
	sb.WriteString("## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE\n")
	sb.WriteString("**This course MUST be created using ONLY the provided source material.**\n\n")
	sb.WriteString("You are strictly forbidden from:\n")
	sb.WriteString("- Adding any information not present in the source documents\n")
	sb.WriteString("- Making up examples, facts, or explanations\n")
	sb.WriteString("- Using general knowledge to fill gaps\n")
	sb.WriteString("- Defaulting to coding, computer science, or any specific domain examples unless the source material is about that topic\n")
	sb.WriteString("- Creating more content than the source material can support\n\n")
	sb.WriteString("If the source material is insufficient for a comprehensive course, create a SMALLER course that covers only what is available.\n\n")

	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	// Team Knowledge (priority source in Internal Data Only mode)
	if req.IncludeTeamKnowledge && (len(req.TeamDocumentIndices) > 0 || len(req.TeamRAGContext) > 0) {
		sb.WriteString("## Team Knowledge (PRIORITY SOURCE)\n")
		sb.WriteString("This content comes from the organization's team knowledge base and should be prioritized.\n\n")

		if len(req.TeamDocumentIndices) > 0 {
			sb.WriteString("### Team Documents\n")
			for _, doc := range req.TeamDocumentIndices {
				sb.WriteString(fmt.Sprintf("**%s**", doc.SourceName))
				if doc.Title != "" {
					sb.WriteString(fmt.Sprintf(" - %s", doc.Title))
				}
				sb.WriteString("\n")
				if len(doc.MainTopics) > 0 {
					sb.WriteString(fmt.Sprintf("  Topics: %s\n", strings.Join(doc.MainTopics, ", ")))
				}
				if len(doc.KeyConcepts) > 0 {
					sb.WriteString(fmt.Sprintf("  Concepts: %s\n", strings.Join(doc.KeyConcepts, ", ")))
				}
			}
			sb.WriteString("\n")
		}

		if len(req.TeamRAGContext) > 0 {
			sb.WriteString("### Team Knowledge Content\n")
			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.TeamRAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}
			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("**From: %s**\n", sourceName))
				for _, chunk := range chunks {
					sb.WriteString(fmt.Sprintf("```\n%s\n```\n", chunk.Content))
				}
				sb.WriteString("\n")
			}
		}
	}

	// Document indices show what content is available
	if len(req.DocumentIndices) > 0 {
		sb.WriteString("## Available Source Documents\n")
		sb.WriteString("These are the documents uploaded by the user. Your course MUST be based on these:\n\n")
		for _, doc := range req.DocumentIndices {
			sb.WriteString(fmt.Sprintf("### Document: %s\n", doc.SourceName))
			if doc.Title != "" {
				sb.WriteString(fmt.Sprintf("**Title:** %s\n", doc.Title))
			}
			if len(doc.MainTopics) > 0 {
				sb.WriteString(fmt.Sprintf("**Topics Covered:** %s\n", strings.Join(doc.MainTopics, ", ")))
			}
			if len(doc.KeyConcepts) > 0 {
				sb.WriteString(fmt.Sprintf("**Key Concepts:** %s\n", strings.Join(doc.KeyConcepts, ", ")))
			}
			if doc.EstimatedLessonCount > 0 {
				sb.WriteString(fmt.Sprintf("**Estimated Lessons:** %d\n", doc.EstimatedLessonCount))
			}
			if doc.ContentDepth != "" {
				sb.WriteString(fmt.Sprintf("**Content Depth:** %s\n", doc.ContentDepth))
			}
			sb.WriteString("\n")
		}
	}

	// RAG context provides the actual content
	if len(req.RAGContext) > 0 {
		sb.WriteString("## Source Content (Retrieved from Documents)\n")
		sb.WriteString("Use ONLY this content to build the course. Every fact, example, and explanation must come from here:\n\n")

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
	}

	if req.AdditionalContext != "" {
		sb.WriteString("## User's Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("Based STRICTLY on the source content above, create a course outline:\n")
	sb.WriteString("1. Analyze the available content and identify teachable topics\n")
	sb.WriteString("2. Create sections that group related topics from the source material\n")
	sb.WriteString("3. Each section should have 1-4 lessons (scale to available content)\n")
	sb.WriteString("4. Lesson titles should reflect actual content from the documents\n")
	sb.WriteString("5. If content is limited, create fewer sections/lessons - do NOT invent content\n")
	sb.WriteString("6. Every lesson must be supportable by the provided source material\n")
	if req.IncludeTeamKnowledge && (len(req.TeamDocumentIndices) > 0 || len(req.TeamRAGContext) > 0) {
		sb.WriteString("7. **Prioritize team knowledge** - incorporate team-specific terminology, examples, and practices\n")
	}
	sb.WriteString("\nRemember: Quality over quantity. A smaller, accurate course is better than a large, hallucinated one.\n")

	return sb.String()
}

func buildSectionLessonsPrompt(req service.GenerateOutlineRequest, sectionTitle, sectionDescription string, lessonTitles []string) string {
	// Use Internal Data Only prompt if that mode is enabled
	if req.InternalDataOnly && len(req.RAGContext) > 0 {
		return buildInternalDataOnlyLessonsPrompt(req, sectionTitle, sectionDescription, lessonTitles)
	}

	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating detailed lesson plans.\n\n")
	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Course Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Current Section\n")
	sb.WriteString(fmt.Sprintf("**Section Title:** %s\n", sectionTitle))
	sb.WriteString(fmt.Sprintf("**Section Description:** %s\n\n", sectionDescription))

	sb.WriteString("## Lesson Titles to Expand\n")
	for i, title := range lessonTitles {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, title))
	}
	sb.WriteString("\n")

	sb.WriteString("## Target Audience\n")
	sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
	sb.WriteString(fmt.Sprintf("**Experience Level:** %s\n", req.TargetAudience.ExperienceLevel))
	if len(req.TargetAudience.Challenges) > 0 {
		sb.WriteString(fmt.Sprintf("**Challenges:** %s\n", strings.Join(req.TargetAudience.Challenges, ", ")))
	}
	sb.WriteString("\n")

	if len(req.SMEKnowledge) > 0 {
		sb.WriteString("## Subject Matter Expert Knowledge (Summary)\n")
		for _, sme := range req.SMEKnowledge {
			if sme.Summary != "" {
				sb.WriteString(fmt.Sprintf("**%s (%s):** %s\n", sme.SMEName, sme.Domain, sme.Summary))
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("For each lesson title provided above, create detailed lesson information:\n")
	sb.WriteString("- Keep the original title or improve it slightly\n")
	sb.WriteString("- Write a brief description of what the lesson covers\n")
	sb.WriteString("- Estimate duration (5-20 minutes)\n")
	sb.WriteString("- Include 2-4 specific, measurable learning objectives\n")
	sb.WriteString("- Ensure lessons flow logically within the section\n")

	return sb.String()
}

// buildInternalDataOnlyLessonsPrompt creates a lesson details prompt for Internal Data Only mode.
func buildInternalDataOnlyLessonsPrompt(req service.GenerateOutlineRequest, sectionTitle, sectionDescription string, lessonTitles []string) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating detailed lesson plans.\n\n")

	// CRITICAL: Internal Data Only instructions
	sb.WriteString("## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE\n")
	sb.WriteString("**All lesson content MUST come from the provided source material.**\n")
	sb.WriteString("Do NOT add external information, examples, or explanations.\n")
	sb.WriteString("If source material is insufficient for a lesson, simplify or shorten the lesson.\n\n")

	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Course Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Current Section\n")
	sb.WriteString(fmt.Sprintf("**Section Title:** %s\n", sectionTitle))
	sb.WriteString(fmt.Sprintf("**Section Description:** %s\n\n", sectionDescription))

	sb.WriteString("## Lesson Titles to Detail\n")
	for i, title := range lessonTitles {
		sb.WriteString(fmt.Sprintf("%d. %s\n", i+1, title))
	}
	sb.WriteString("\n")

	// Include RAG context
	if len(req.RAGContext) > 0 {
		sb.WriteString("## Source Content (Use ONLY this material)\n")
		for _, chunk := range req.RAGContext {
			sb.WriteString(fmt.Sprintf("**[%s]**\n```\n%s\n```\n\n", chunk.SourceName, chunk.Content))
		}
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("For each lesson title, create detailed information using ONLY the source content above:\n")
	sb.WriteString("- Write a description based on source material only\n")
	sb.WriteString("- Estimate duration (scale to available content, can be 3-15 minutes)\n")
	sb.WriteString("- Include 1-3 learning objectives that are supportable by the source\n")
	sb.WriteString("- If insufficient content, create a shorter, focused lesson\n")
	sb.WriteString("- Reference source document names in descriptions where helpful\n")

	return sb.String()
}
