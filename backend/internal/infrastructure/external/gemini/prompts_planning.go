package gemini

import (
	"fmt"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// buildAnalyzeDocumentPrompt creates the prompt for analyzing a single knowledge source document.
func buildAnalyzeDocumentPrompt(req service.AnalyzeDocumentRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer and content analyst.\n\n")

	sb.WriteString("## Task\n")
	sb.WriteString("Analyze the following document that will be used as source material for a course.\n")
	sb.WriteString("Your analysis will guide the course structure, ensuring every section is grounded in real content.\n\n")

	sb.WriteString("## Course Context\n")
	sb.WriteString(fmt.Sprintf("**Course Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	sb.WriteString("## Document to Analyze\n")
	sb.WriteString(fmt.Sprintf("**Document Name:** %s\n\n", req.SourceName))
	sb.WriteString("```\n")
	sb.WriteString(req.DocumentText)
	sb.WriteString("\n```\n\n")

	sb.WriteString("## Instructions\n")
	sb.WriteString("Produce a structured analysis of this document:\n\n")
	sb.WriteString("1. **summary**: A 2-3 paragraph summary of the document's content and purpose.\n")
	sb.WriteString("2. **main_topics**: An array of the major topics/sections found in the document. ")
	sb.WriteString("Use the document's own headings and section names where possible.\n")
	sb.WriteString("3. **key_facts**: An array of specific, concrete facts from the document — ")
	sb.WriteString("product names, specifications, procedures, numbers, dates, proper nouns, ")
	sb.WriteString("technical terms. These are the facts that MUST appear in the course.\n")
	sb.WriteString("4. **content_depth**: Rate the depth as 'basic', 'intermediate', or 'advanced'.\n")
	sb.WriteString("5. **section_hints**: For each major topic that could become a course section, provide:\n")
	sb.WriteString("   - **topic_name**: A descriptive name for the potential course section\n")
	sb.WriteString("   - **search_terms**: 3-8 specific phrases that would retrieve relevant content ")
	sb.WriteString("from this document via vector search. Use exact terminology from the document — ")
	sb.WriteString("product names, technical terms, procedure names, specific concepts. ")
	sb.WriteString("These must be precise enough to find the right passages, not generic.\n")
	sb.WriteString("   - **key_points**: The most important points that should be taught about this topic\n\n")

	sb.WriteString("**IMPORTANT**: The search_terms are critical — they will be used to retrieve ")
	sb.WriteString("specific chunks from a vector database. Use the document's exact terminology, ")
	sb.WriteString("not paraphrases. Include product names, model numbers, process names, and ")
	sb.WriteString("technical terms that appear verbatim in the document.\n")

	return sb.String()
}

// buildCoursePlanPrompt creates the prompt for generating a structured course plan.
func buildCoursePlanPrompt(req service.GenerateCoursePlanRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating a detailed course plan.\n\n")

	if req.InternalDataOnly {
		sb.WriteString("## CRITICAL CONSTRAINT: INTERNAL DATA ONLY MODE\n")
		sb.WriteString("**This course MUST be created using ONLY the analyzed source material.**\n")
		sb.WriteString("EVERY section and lesson MUST be directly traceable to the source documents.\n")
		sb.WriteString("Do NOT add topics, examples, or content not found in the sources.\n")
		sb.WriteString("If the material is limited, create a SMALLER course — quality over quantity.\n\n")
	}

	if req.Constraints != nil {
		sb.WriteString(buildConstraintsSection(req.Constraints))
	}

	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.CourseTitle))
	sb.WriteString(fmt.Sprintf("**Desired Outcome:** %s\n\n", req.DesiredOutcome))

	if req.TargetAudience.Role != "" {
		sb.WriteString("## Target Audience\n")
		sb.WriteString(fmt.Sprintf("**Role:** %s\n", req.TargetAudience.Role))
		if len(req.TargetAudience.LearningGoals) > 0 {
			sb.WriteString(fmt.Sprintf("**Learning Goals:** %s\n", strings.Join(req.TargetAudience.LearningGoals, ", ")))
		}
		if req.TargetAudience.TypicalBackground != "" {
			sb.WriteString(fmt.Sprintf("**Background:** %s\n", req.TargetAudience.TypicalBackground))
		}
		sb.WriteString("\n")
	}

	if len(req.SMEKnowledge) > 0 {
		sb.WriteString("## Subject Matter Expert Perspectives\n")
		for _, sme := range req.SMEKnowledge {
			sb.WriteString(fmt.Sprintf("- **%s** (%s): %s\n", sme.SMEName, sme.Domain, sme.Summary))
		}
		sb.WriteString("\n")
	}

	if req.AdditionalContext != "" {
		sb.WriteString("## Additional Context\n")
		sb.WriteString(req.AdditionalContext)
		sb.WriteString("\n\n")
	}

	// Include document analyses — this is the core input
	sb.WriteString("## Document Analyses\n")
	sb.WriteString("The following documents have been analyzed and will serve as source material.\n")
	sb.WriteString("Your course plan MUST be based on the content described here.\n\n")

	for i, analysis := range req.DocumentAnalyses {
		sb.WriteString(fmt.Sprintf("### Document %d: %s\n", i+1, analysis.Summary[:min(100, len(analysis.Summary))]))
		sb.WriteString(fmt.Sprintf("**Summary:** %s\n\n", analysis.Summary))

		if len(analysis.MainTopics) > 0 {
			sb.WriteString(fmt.Sprintf("**Topics:** %s\n", strings.Join(analysis.MainTopics, ", ")))
		}
		if len(analysis.KeyFacts) > 0 {
			sb.WriteString("**Key Facts:**\n")
			for _, fact := range analysis.KeyFacts {
				sb.WriteString(fmt.Sprintf("- %s\n", fact))
			}
		}
		sb.WriteString(fmt.Sprintf("**Depth:** %s\n\n", analysis.ContentDepth))

		if len(analysis.SectionHints) > 0 {
			sb.WriteString("**Suggested Section Topics:**\n")
			for _, hint := range analysis.SectionHints {
				sb.WriteString(fmt.Sprintf("- **%s** (search terms: %s)\n",
					hint.TopicName, strings.Join(hint.SearchTerms, ", ")))
				if len(hint.KeyPoints) > 0 {
					for _, point := range hint.KeyPoints {
						sb.WriteString(fmt.Sprintf("  - %s\n", point))
					}
				}
			}
		}
		sb.WriteString("\n")
	}

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create a course plan with the following structure:\n\n")
	sb.WriteString("For each **section**:\n")
	sb.WriteString("- **title**: Clear section title reflecting the content\n")
	sb.WriteString("- **description**: What this section covers and why it matters\n")
	sb.WriteString("- **search_terms**: 3-8 specific search phrases that will be used to retrieve ")
	sb.WriteString("relevant content from the source documents via vector search. ")
	sb.WriteString("Use exact terminology from the document analyses — product names, ")
	sb.WriteString("technical terms, process names, model numbers. These are CRITICAL for ")
	sb.WriteString("retrieval quality.\n")
	sb.WriteString("- **source_ids**: Which source documents this section draws from (use document numbers as strings: \"1\", \"2\", etc.)\n")
	sb.WriteString("- **rationale**: Why this section exists and how it connects to source material\n")
	sb.WriteString("- **lessons**: 2-5 lessons per section\n\n")

	sb.WriteString("For each **lesson**:\n")
	sb.WriteString("- **title**: Lesson title\n")
	sb.WriteString("- **description**: What the lesson covers\n")
	sb.WriteString("- **search_terms**: 2-5 specific search phrases for retrieving content ")
	sb.WriteString("relevant to this specific lesson. Be precise — use exact terms from the source.\n")
	sb.WriteString("- **learning_goals**: 1-3 measurable goals for this lesson\n\n")

	sb.WriteString("**CRITICAL**: The search_terms at both section and lesson level are the most ")
	sb.WriteString("important output. They will be used to query a vector database to retrieve ")
	sb.WriteString("the actual source content for each part of the course. Poor search terms = ")
	sb.WriteString("poor content retrieval = poor course quality. Use exact document terminology.\n\n")

	sb.WriteString("Ensure logical progression: introduce fundamentals first, then build complexity.\n")
	sb.WriteString("Group related topics together. Avoid redundancy across sections.\n")

	return sb.String()
}

// documentAnalysisSchema returns the Gemini structured output schema for document analysis.
func documentAnalysisSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"summary": map[string]any{
				"type":        "string",
				"description": "2-3 paragraph summary of the document content and purpose",
			},
			"main_topics": map[string]any{
				"type":        "array",
				"description": "Major topics/sections found in the document",
				"items":       map[string]any{"type": "string"},
			},
			"key_facts": map[string]any{
				"type":        "array",
				"description": "Specific concrete facts: product names, specs, procedures, numbers, proper nouns",
				"items":       map[string]any{"type": "string"},
			},
			"content_depth": map[string]any{
				"type":        "string",
				"description": "Depth assessment of the document content",
				"enum":        []string{"basic", "intermediate", "advanced"},
			},
			"section_hints": map[string]any{
				"type":        "array",
				"description": "Suggested course sections derivable from this document",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"topic_name": map[string]any{
							"type":        "string",
							"description": "Descriptive name for the potential course section",
						},
						"search_terms": map[string]any{
							"type":        "array",
							"description": "3-8 specific phrases for vector search retrieval using exact document terminology",
							"items":       map[string]any{"type": "string"},
						},
						"key_points": map[string]any{
							"type":        "array",
							"description": "Most important points to teach about this topic",
							"items":       map[string]any{"type": "string"},
						},
					},
					"required": []string{"topic_name", "search_terms", "key_points"},
				},
			},
		},
		"required": []string{"summary", "main_topics", "key_facts", "content_depth", "section_hints"},
	}
}

// coursePlanSchema returns the Gemini structured output schema for course plan generation.
func coursePlanSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"sections": map[string]any{
				"type":        "array",
				"description": "Planned course sections in logical order",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title": map[string]any{
							"type":        "string",
							"description": "Section title",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "What this section covers and why",
						},
						"search_terms": map[string]any{
							"type":        "array",
							"description": "3-8 specific search phrases for vector retrieval using exact document terminology",
							"items":       map[string]any{"type": "string"},
						},
						"source_ids": map[string]any{
							"type":        "array",
							"description": "Source document identifiers this section draws from",
							"items":       map[string]any{"type": "string"},
						},
						"rationale": map[string]any{
							"type":        "string",
							"description": "Why this section exists and how it connects to source material",
						},
						"lessons": map[string]any{
							"type":        "array",
							"description": "2-5 planned lessons for this section",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"title": map[string]any{
										"type":        "string",
										"description": "Lesson title",
									},
									"description": map[string]any{
										"type":        "string",
										"description": "What this lesson covers",
									},
									"search_terms": map[string]any{
										"type":        "array",
										"description": "2-5 specific search phrases for vector retrieval",
										"items":       map[string]any{"type": "string"},
									},
									"learning_goals": map[string]any{
										"type":        "array",
										"description": "1-3 measurable learning goals",
										"items":       map[string]any{"type": "string"},
									},
								},
								"required": []string{"title", "description", "search_terms", "learning_goals"},
							},
						},
					},
					"required": []string{"title", "description", "search_terms", "source_ids", "rationale", "lessons"},
				},
			},
		},
		"required": []string{"sections"},
	}
}
