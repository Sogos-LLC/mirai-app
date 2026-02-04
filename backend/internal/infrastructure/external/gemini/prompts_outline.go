package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

func buildSectionsOnlyPrompt(req service.GenerateOutlineRequest) string {
	// Use Internal Data Only prompt if that mode is enabled (strict no-synthesis mode)
	if req.InternalDataOnly && (len(req.RAGContext) > 0 || len(req.DocumentIndices) > 0) {
		return buildInternalDataOnlySectionsPrompt(req)
	}

	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a course outline.\n\n")

	// Inject constraints at the top if provided
	if req.Constraints != nil {
		sb.WriteString(buildConstraintsSection(req.Constraints))
	}
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

	// CRITICAL: Include RAG context when knowledge sources are selected
	// This enables knowledge-grounded generation in normal mode (AI can expand but should be grounded)
	if len(req.RAGContext) > 0 || len(req.DocumentIndices) > 0 {
		sb.WriteString("## Knowledge Sources\n")
		sb.WriteString("**IMPORTANT**: The following reference materials have been provided by the user.\n")
		sb.WriteString("Use this content as the foundation for your course structure. The course should:\n")
		sb.WriteString("- Prioritize topics and concepts from the source materials\n")
		sb.WriteString("- Structure sections around the key themes in the documents\n")
		sb.WriteString("- Align lesson content with what the sources actually cover\n")
		sb.WriteString("- You may add supplementary context to connect concepts, but the core content should come from the sources\n\n")

		// Include document indices if available
		if len(req.DocumentIndices) > 0 {
			sb.WriteString("### Available Documents Overview\n")
			for _, doc := range req.DocumentIndices {
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
				if doc.EstimatedLessonCount > 0 {
					sb.WriteString(fmt.Sprintf("  Estimated lesson depth: %d lessons\n", doc.EstimatedLessonCount))
				}
			}
			sb.WriteString("\n")
		}

		// Include RAG content chunks
		if len(req.RAGContext) > 0 {
			sb.WriteString("### Source Content Excerpts\n")
			sb.WriteString("Key passages from the uploaded documents:\n\n")

			// Group chunks by source for better organization
			sourceChunks := make(map[string][]service.RAGChunkInput)
			for _, chunk := range req.RAGContext {
				sourceChunks[chunk.SourceName] = append(sourceChunks[chunk.SourceName], chunk)
			}

			for sourceName, chunks := range sourceChunks {
				sb.WriteString(fmt.Sprintf("**From: %s**\n", sourceName))
				for _, chunk := range chunks {
					// Truncate long chunks for the outline phase
					content := chunk.Content
					if len(content) > 500 {
						content = content[:500] + "..."
					}
					sb.WriteString(fmt.Sprintf("> %s\n\n", content))
				}
			}
		}
		sb.WriteString("\n")
	}

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

	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	// Enumerate desired outcomes so the AI can map sections to them
	if len(req.DesiredOutcomes) > 0 {
		sb.WriteString("## Desired Learning Outcomes\n")
		sb.WriteString("The course must address these specific outcomes. Each section should map to one or more outcomes using their zero-based index.\n\n")
		for i, outcome := range req.DesiredOutcomes {
			sb.WriteString(fmt.Sprintf("**%d:** %s\n", i, outcome))
		}
		sb.WriteString("\n")
	}

	// Include approved course plan guidance
	if req.CoursePlan != nil && len(req.CoursePlan.Sections) > 0 {
		sb.WriteString(buildCoursePlanGuidanceSection(req.CoursePlan))
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create a high-level course outline with sections and lesson titles.\n")
	if req.CoursePlan != nil && len(req.CoursePlan.Sections) > 0 {
		sb.WriteString("**You MUST follow the Approved Course Plan structure above closely.** Each section has been mapped to specific source material.\n")
	} else if len(req.RAGContext) > 0 || len(req.DocumentIndices) > 0 {
		sb.WriteString("**Base your course structure on the provided knowledge sources.** The course length and depth should reflect the available source material.\n")
	}
	if req.Constraints != nil {
		sb.WriteString(fmt.Sprintf("Each section should have a clear theme and %d-%d lessons (as specified in constraints above).\n\n",
			req.Constraints.MinLessonsPerSection, req.Constraints.MaxLessonsPerSection))
	} else {
		sb.WriteString("Each section should have a clear theme and 2-5 lessons.\n\n")
	}
	sb.WriteString("For each section, provide:\n")
	sb.WriteString("- Section title and description\n")
	sb.WriteString("- List of lesson titles (2-5 lessons)\n")
	sb.WriteString("- **level**: Learning progression level\n")
	sb.WriteString("  - 'introduce': First exposure to concepts (earlier sections)\n")
	sb.WriteString("  - 'develop': Building understanding (middle sections)\n")
	sb.WriteString("  - 'master': Deep proficiency (later sections)\n")
	sb.WriteString("- **intent**: Primary purpose of the section\n")
	sb.WriteString("  - 'teach': Primary instruction of new material\n")
	sb.WriteString("  - 'assess': Evaluation/testing of knowledge\n")
	sb.WriteString("  - 'reinforce': Practice and reinforcement\n")
	sb.WriteString("- **emphasis**: Relative importance (low, medium, high)\n")
	sb.WriteString("- **mapped_outcome_indices**: Zero-based indices of desired outcomes this section addresses. ")
	if len(req.DesiredOutcomes) > 0 {
		sb.WriteString(fmt.Sprintf("There are %d outcomes (indices 0 through %d). ", len(req.DesiredOutcomes), len(req.DesiredOutcomes)-1))
		sb.WriteString("EVERY section MUST map to at least one outcome. ")
		sb.WriteString("EVERY outcome MUST appear in at least one section's mapping.\n\n")
	} else {
		sb.WriteString("If the course has a single desired outcome, use [0] for all sections.\n\n")
	}
	sb.WriteString("Ensure content flows logically and builds on previous sections.\n")

	return sb.String()
}

// buildInternalDataOnlySectionsPrompt creates a prompt for Internal Data Only mode.
// This prompt strictly instructs the AI to use ONLY the provided document content.
func buildInternalDataOnlySectionsPrompt(req service.GenerateOutlineRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a course outline.\n\n")

	// Inject constraints at the top if provided (before Internal Data Only instructions)
	if req.Constraints != nil {
		sb.WriteString(buildConstraintsSection(req.Constraints))
	}

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

	// Enumerate desired outcomes so the AI can map sections to them
	if len(req.DesiredOutcomes) > 0 {
		sb.WriteString("## Desired Learning Outcomes\n")
		sb.WriteString("The course must address these specific outcomes. Each section should map to one or more outcomes using their zero-based index.\n\n")
		for i, outcome := range req.DesiredOutcomes {
			sb.WriteString(fmt.Sprintf("**%d:** %s\n", i, outcome))
		}
		sb.WriteString("\n")
	}

	// Include approved course plan guidance
	if req.CoursePlan != nil && len(req.CoursePlan.Sections) > 0 {
		sb.WriteString(buildCoursePlanGuidanceSection(req.CoursePlan))
	}

	sb.WriteString("## Instructions\n")
	if req.CoursePlan != nil && len(req.CoursePlan.Sections) > 0 {
		sb.WriteString("Based on the Approved Course Plan AND source content above, create a course outline:\n")
		sb.WriteString("1. Follow the plan structure closely — each planned section maps to source material\n")
	} else {
		sb.WriteString("Based STRICTLY on the source content above, create a course outline:\n")
		sb.WriteString("1. Analyze the available content and identify teachable topics\n")
	}
	sb.WriteString("2. Create sections that group related topics from the source material\n")
	if req.Constraints != nil {
		sb.WriteString(fmt.Sprintf("3. Each section should have %d-%d lessons (as specified in constraints)\n",
			req.Constraints.MinLessonsPerSection, req.Constraints.MaxLessonsPerSection))
	} else {
		sb.WriteString("3. Each section should have 1-4 lessons (scale to available content)\n")
	}
	sb.WriteString("4. Lesson titles should reflect actual content from the documents\n")
	sb.WriteString("5. If content is limited, create fewer sections/lessons - do NOT invent content\n")
	sb.WriteString("6. Every lesson must be supportable by the provided source material\n\n")
	sb.WriteString("For each section, also provide:\n")
	sb.WriteString("- **level**: 'introduce', 'develop', or 'master' (learning progression)\n")
	sb.WriteString("- **intent**: 'teach', 'assess', or 'reinforce' (primary purpose)\n")
	sb.WriteString("- **emphasis**: 'low', 'medium', or 'high' (relative importance)\n")
	sb.WriteString("- **mapped_outcome_indices**: Zero-based indices of outcomes this section addresses. ")
	if len(req.DesiredOutcomes) > 0 {
		sb.WriteString(fmt.Sprintf("There are %d outcomes (indices 0 through %d). ", len(req.DesiredOutcomes), len(req.DesiredOutcomes)-1))
		sb.WriteString("EVERY section MUST map to at least one outcome. ")
		sb.WriteString("EVERY outcome MUST appear in at least one section's mapping.\n\n")
	} else {
		sb.WriteString("If the course has a single desired outcome, use [0] for all sections.\n\n")
	}
	sb.WriteString("Remember: Quality over quantity. A smaller, accurate course is better than a large, hallucinated one.\n")

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

// buildCoursePlanGuidanceSection creates the approved plan guidance for outline prompts.
func buildCoursePlanGuidanceSection(plan *service.CoursePlanContext) string {
	var sb strings.Builder

	sb.WriteString("## Approved Course Plan\n")
	sb.WriteString("The following course plan was created from analysis of the source documents.\n")
	sb.WriteString("You MUST follow this structure closely. Each section has been mapped to specific source material.\n\n")

	for i, section := range plan.Sections {
		sb.WriteString(fmt.Sprintf("### Section %d: %s\n", i+1, section.Title))
		sb.WriteString(fmt.Sprintf("**Description:** %s\n", section.Description))
		if section.Rationale != "" {
			sb.WriteString(fmt.Sprintf("**Rationale:** %s\n", section.Rationale))
		}
		if len(section.Lessons) > 0 {
			sb.WriteString("**Planned Lessons:**\n")
			for j, lesson := range section.Lessons {
				sb.WriteString(fmt.Sprintf("  %d. %s", j+1, lesson.Title))
				if lesson.Description != "" {
					sb.WriteString(fmt.Sprintf(" — %s", lesson.Description))
				}
				sb.WriteString("\n")
			}
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

// buildConstraintsSection creates the mandatory constraints section for prompts.
// This section instructs the AI on hard bounds derived from knowledge sources.
func buildConstraintsSection(c *service.CourseConstraintsInput) string {
	var sb strings.Builder

	sb.WriteString("## MANDATORY COURSE STRUCTURE CONSTRAINTS\n")
	sb.WriteString("**CRITICAL: These are HARD requirements derived from available source material.**\n\n")
	sb.WriteString(fmt.Sprintf("- **Section Count**: EXACTLY %d to %d sections\n", c.MinSections, c.MaxSections))
	sb.WriteString(fmt.Sprintf("- **Lessons Per Section**: EXACTLY %d to %d lessons per section\n", c.MinLessonsPerSection, c.MaxLessonsPerSection))
	sb.WriteString(fmt.Sprintf("- **Total Lessons**: EXACTLY %d to %d total lessons across all sections\n", c.MinTotalLessons, c.MaxTotalLessons))
	if c.RecommendedDepth != "" {
		sb.WriteString(fmt.Sprintf("- **Content Depth**: Target %s level content\n", c.RecommendedDepth))
	}
	sb.WriteString("\n**Your response will be REJECTED if it violates these constraints.**\n\n")

	return sb.String()
}
