package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

const (
	// DefaultModel is the default Gemini model to use.
	DefaultModel = "gemini-2.5-flash"
)

// Client implements service.AIProvider using Google Gemini.
type Client struct {
	client *genai.Client
	model  string
}

// NewClient creates a new Gemini client with the provided API key.
func NewClient(ctx context.Context, apiKey string) (*Client, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	return &Client{
		client: client,
		model:  DefaultModel,
	}, nil
}

// TestConnection tests if the API key is valid by making a simple request.
func (c *Client) TestConnection(ctx context.Context) error {
	config := &genai.GenerateContentConfig{
		MaxOutputTokens: 10,
	}

	_, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text("Say 'OK' if you can read this."),
		config,
	)
	if err != nil {
		return fmt.Errorf("API key validation failed: %w", err)
	}

	return nil
}

// GenerateCourseOutline generates a course outline using structured output.
func (c *Client) GenerateCourseOutline(ctx context.Context, req service.GenerateOutlineRequest) (*service.GenerateOutlineResult, error) {
	prompt := buildOutlinePrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: courseOutlineSchema(),
	}

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		config,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate outline: %w", err)
	}

	// Parse the structured response
	var outlineResp courseOutlineResponse
	if err := json.Unmarshal([]byte(result.Text()), &outlineResp); err != nil {
		return nil, fmt.Errorf("failed to parse outline response: %w", err)
	}

	// Convert to domain result
	sections := make([]service.OutlineSectionResult, len(outlineResp.Sections))
	for i, s := range outlineResp.Sections {
		lessons := make([]service.OutlineLessonResult, len(s.Lessons))
		for j, l := range s.Lessons {
			lessons[j] = service.OutlineLessonResult{
				Title:                    l.Title,
				Description:              l.Description,
				Order:                    j + 1,
				EstimatedDurationMinutes: l.EstimatedDurationMinutes,
				LearningObjectives:       l.LearningObjectives,
				IsLastInSection:          j == len(s.Lessons)-1,
				IsLastInCourse:           i == len(outlineResp.Sections)-1 && j == len(s.Lessons)-1,
			}
		}
		sections[i] = service.OutlineSectionResult{
			Title:       s.Title,
			Description: s.Description,
			Order:       i + 1,
			Lessons:     lessons,
		}
	}

	return &service.GenerateOutlineResult{
		Sections:   sections,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// GenerateLessonContent generates content for a single lesson.
func (c *Client) GenerateLessonContent(ctx context.Context, req service.GenerateLessonRequest) (*service.GenerateLessonResult, error) {
	prompt := buildLessonPrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: lessonContentSchema(),
	}

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		config,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate lesson content: %w", err)
	}

	// Parse the structured response
	var lessonResp lessonContentResponse
	if err := json.Unmarshal([]byte(result.Text()), &lessonResp); err != nil {
		return nil, fmt.Errorf("failed to parse lesson response: %w", err)
	}

	// Convert to domain result
	components := make([]service.LessonComponentResult, len(lessonResp.Components))
	for i, comp := range lessonResp.Components {
		contentJSON, err := json.Marshal(comp.Content)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal component content: %w", err)
		}
		components[i] = service.LessonComponentResult{
			Type:        comp.Type,
			Order:       i + 1,
			ContentJSON: string(contentJSON),
		}
	}

	return &service.GenerateLessonResult{
		Components: components,
		SegueText:  lessonResp.SegueText,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// RegenerateComponent regenerates a single component with modifications.
func (c *Client) RegenerateComponent(ctx context.Context, req service.RegenerateComponentRequest) (*service.RegenerateComponentResult, error) {
	prompt := buildRegeneratePrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: componentSchema(req.ComponentType),
	}

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		config,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to regenerate component: %w", err)
	}

	return &service.RegenerateComponentResult{
		ContentJSON: result.Text(),
		TokensUsed:  extractTokensUsed(result),
	}, nil
}

// ProcessSMEContent processes and distills knowledge from SME submission.
func (c *Client) ProcessSMEContent(ctx context.Context, req service.ProcessSMEContentRequest) (*service.ProcessSMEContentResult, error) {
	prompt := buildSMEProcessingPrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: smeProcessingSchema(),
	}

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		config,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to process SME content: %w", err)
	}

	// Parse the structured response
	var smeResp smeProcessingResponse
	if err := json.Unmarshal([]byte(result.Text()), &smeResp); err != nil {
		return nil, fmt.Errorf("failed to parse SME processing response: %w", err)
	}

	// Convert to domain result
	chunks := make([]service.SMEChunkResult, len(smeResp.Chunks))
	for i, chunk := range smeResp.Chunks {
		chunks[i] = service.SMEChunkResult{
			Content:        chunk.Content,
			Topic:          chunk.Topic,
			Keywords:       chunk.Keywords,
			RelevanceScore: chunk.RelevanceScore,
		}
	}

	return &service.ProcessSMEContentResult{
		Summary:    smeResp.Summary,
		Chunks:     chunks,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// Response types for JSON parsing

type courseOutlineResponse struct {
	Sections []outlineSection `json:"sections"`
}

type outlineSection struct {
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Lessons     []outlineLesson `json:"lessons"`
}

type outlineLesson struct {
	Title                    string   `json:"title"`
	Description              string   `json:"description"`
	EstimatedDurationMinutes int      `json:"estimated_duration_minutes"`
	LearningObjectives       []string `json:"learning_objectives"`
}

type lessonContentResponse struct {
	Components []lessonComponent `json:"components"`
	SegueText  string            `json:"segue_text"`
}

type lessonComponent struct {
	Type    string         `json:"type"`
	Content map[string]any `json:"content"`
}

type smeProcessingResponse struct {
	Summary string     `json:"summary"`
	Chunks  []smeChunk `json:"chunks"`
}

type smeChunk struct {
	Content        string   `json:"content"`
	Topic          string   `json:"topic"`
	Keywords       []string `json:"keywords"`
	RelevanceScore float32  `json:"relevance_score"`
}

// Schema definitions for structured output

func courseOutlineSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"sections": map[string]any{
				"type":        "array",
				"description": "Course sections in logical order",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title": map[string]any{
							"type":        "string",
							"description": "Section title",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "Brief description of what this section covers",
						},
						"lessons": map[string]any{
							"type":        "array",
							"description": "Lessons within this section",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"title": map[string]any{
										"type":        "string",
										"description": "Lesson title",
									},
									"description": map[string]any{
										"type":        "string",
										"description": "Brief description of the lesson content",
									},
									"estimated_duration_minutes": map[string]any{
										"type":        "integer",
										"description": "Estimated time to complete the lesson in minutes",
									},
									"learning_objectives": map[string]any{
										"type":        "array",
										"description": "Specific learning objectives for this lesson",
										"items":       map[string]any{"type": "string"},
									},
								},
								"required": []string{"title", "description", "estimated_duration_minutes", "learning_objectives"},
							},
						},
					},
					"required": []string{"title", "description", "lessons"},
				},
			},
		},
		"required": []string{"sections"},
	}
}

func lessonContentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"components": map[string]any{
				"type":        "array",
				"description": "Lesson content components in order",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"type": map[string]any{
							"type":        "string",
							"enum":        []string{"text", "heading", "image", "quiz"},
							"description": "Component type",
						},
						"content": map[string]any{
							"type":        "object",
							"description": "Type-specific content",
						},
					},
					"required": []string{"type", "content"},
				},
			},
			"segue_text": map[string]any{
				"type":        "string",
				"description": "Transition text to the next lesson (empty if last lesson)",
			},
		},
		"required": []string{"components", "segue_text"},
	}
}

func componentSchema(componentType string) map[string]any {
	switch componentType {
	case "text":
		return textComponentSchema()
	case "heading":
		return headingComponentSchema()
	case "image":
		return imageComponentSchema()
	case "quiz":
		return quizComponentSchema()
	default:
		return textComponentSchema()
	}
}

func textComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"html": map[string]any{
				"type":        "string",
				"description": "HTML-formatted text content",
			},
			"plaintext": map[string]any{
				"type":        "string",
				"description": "Plain text version of the content",
			},
		},
		"required": []string{"html", "plaintext"},
	}
}

func headingComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"level": map[string]any{
				"type":        "integer",
				"description": "Heading level (1-4)",
				"minimum":     1,
				"maximum":     4,
			},
			"text": map[string]any{
				"type":        "string",
				"description": "Heading text",
			},
		},
		"required": []string{"level", "text"},
	}
}

func imageComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"url": map[string]any{
				"type":        "string",
				"description": "Image URL or placeholder description",
			},
			"alt_text": map[string]any{
				"type":        "string",
				"description": "Alternative text for accessibility",
			},
			"caption": map[string]any{
				"type":        "string",
				"description": "Optional image caption",
			},
		},
		"required": []string{"url", "alt_text"},
	}
}

func quizComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"question": map[string]any{
				"type":        "string",
				"description": "The quiz question",
			},
			"question_type": map[string]any{
				"type":        "string",
				"enum":        []string{"multiple_choice", "true_false"},
				"description": "Type of quiz question",
			},
			"options": map[string]any{
				"type":        "array",
				"description": "Answer options",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id": map[string]any{
							"type":        "string",
							"description": "Unique option identifier",
						},
						"text": map[string]any{
							"type":        "string",
							"description": "Option text",
						},
					},
					"required": []string{"id", "text"},
				},
			},
			"correct_answer_id": map[string]any{
				"type":        "string",
				"description": "ID of the correct answer option",
			},
			"explanation": map[string]any{
				"type":        "string",
				"description": "Explanation of the correct answer",
			},
			"correct_feedback": map[string]any{
				"type":        "string",
				"description": "Feedback shown when answer is correct",
			},
			"incorrect_feedback": map[string]any{
				"type":        "string",
				"description": "Feedback shown when answer is incorrect",
			},
		},
		"required": []string{"question", "question_type", "options", "correct_answer_id", "explanation"},
	}
}

func smeProcessingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"summary": map[string]any{
				"type":        "string",
				"description": "A comprehensive summary of the knowledge content",
			},
			"chunks": map[string]any{
				"type":        "array",
				"description": "Distilled knowledge chunks",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"content": map[string]any{
							"type":        "string",
							"description": "The knowledge content",
						},
						"topic": map[string]any{
							"type":        "string",
							"description": "Topic category for this chunk",
						},
						"keywords": map[string]any{
							"type":        "array",
							"description": "Keywords for this chunk",
							"items":       map[string]any{"type": "string"},
						},
						"relevance_score": map[string]any{
							"type":        "number",
							"description": "Relevance score from 0 to 1",
							"minimum":     0,
							"maximum":     1,
						},
					},
					"required": []string{"content", "topic", "keywords", "relevance_score"},
				},
			},
		},
		"required": []string{"summary", "chunks"},
	}
}

// Prompt builders

func buildOutlinePrompt(req service.GenerateOutlineRequest) string {
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
			if i < 5 { // Limit chunks to avoid context overflow
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

	sb.WriteString("## Instructions\n")
	sb.WriteString("Create a comprehensive course outline with logical sections and lessons.\n")
	sb.WriteString("Each section should have a clear theme and 2-5 lessons.\n")
	sb.WriteString("Each lesson should take 5-20 minutes to complete.\n")
	sb.WriteString("Include specific, measurable learning objectives for each lesson.\n")
	sb.WriteString("Ensure content flows logically and builds on previous lessons.\n")

	return sb.String()
}

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

// Helper functions

func extractTokensUsed(result *genai.GenerateContentResponse) int64 {
	if result == nil || result.UsageMetadata == nil {
		return 0
	}
	return int64(result.UsageMetadata.TotalTokenCount)
}
