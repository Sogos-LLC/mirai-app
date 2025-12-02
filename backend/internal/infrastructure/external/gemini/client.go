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
// This uses a two-call approach to avoid Gemini's nested schema depth limits:
// 1. First call generates sections with lesson titles only (flat schema)
// 2. Second calls generate detailed lessons for each section
func (c *Client) GenerateCourseOutline(ctx context.Context, req service.GenerateOutlineRequest) (*service.GenerateOutlineResult, error) {
	var totalTokensUsed int64

	// Step 1: Generate sections with lesson titles only
	sectionsPrompt := buildSectionsOnlyPrompt(req)
	sectionsConfig := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: sectionsOnlySchema(),
	}

	sectionsResult, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(sectionsPrompt),
		sectionsConfig,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to generate sections: %w", err)
	}
	totalTokensUsed += extractTokensUsed(sectionsResult)

	// Parse sections response
	var sectionsResp sectionsOnlyResponse
	if err := json.Unmarshal([]byte(sectionsResult.Text()), &sectionsResp); err != nil {
		return nil, fmt.Errorf("failed to parse sections response: %w", err)
	}

	// Step 2: Generate detailed lessons for each section
	sections := make([]service.OutlineSectionResult, len(sectionsResp.Sections))
	totalLessons := 0

	for i, section := range sectionsResp.Sections {
		lessonsPrompt := buildSectionLessonsPrompt(req, section.Title, section.Description, section.LessonTitles)
		lessonsConfig := &genai.GenerateContentConfig{
			ResponseMIMEType:   "application/json",
			ResponseJsonSchema: sectionLessonsSchema(),
		}

		lessonsResult, err := c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(lessonsPrompt),
			lessonsConfig,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to generate lessons for section %q: %w", section.Title, err)
		}
		totalTokensUsed += extractTokensUsed(lessonsResult)

		// Parse lessons response
		var lessonsResp sectionLessonsResponse
		if err := json.Unmarshal([]byte(lessonsResult.Text()), &lessonsResp); err != nil {
			return nil, fmt.Errorf("failed to parse lessons response for section %q: %w", section.Title, err)
		}

		// Convert to domain result
		lessons := make([]service.OutlineLessonResult, len(lessonsResp.Lessons))
		for j, l := range lessonsResp.Lessons {
			lessons[j] = service.OutlineLessonResult{
				Title:                    l.Title,
				Description:              l.Description,
				Order:                    j + 1,
				EstimatedDurationMinutes: l.EstimatedDurationMinutes,
				LearningObjectives:       l.LearningObjectives,
				IsLastInSection:          j == len(lessonsResp.Lessons)-1,
			}
			totalLessons++
		}

		sections[i] = service.OutlineSectionResult{
			Title:       section.Title,
			Description: section.Description,
			Order:       i + 1,
			Lessons:     lessons,
		}
	}

	// Set IsLastInCourse on the last lesson
	if len(sections) > 0 {
		lastSection := &sections[len(sections)-1]
		if len(lastSection.Lessons) > 0 {
			lastSection.Lessons[len(lastSection.Lessons)-1].IsLastInCourse = true
		}
	}

	return &service.GenerateOutlineResult{
		Sections:   sections,
		TokensUsed: totalTokensUsed,
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

	// Convert to domain result - transform flat schema to nested contentJSON
	components := make([]service.LessonComponentResult, len(lessonResp.Components))
	for i, comp := range lessonResp.Components {
		contentJSON, err := comp.toContentJSON()
		if err != nil {
			return nil, fmt.Errorf("failed to convert component content: %w", err)
		}
		components[i] = service.LessonComponentResult{
			Type:        comp.ComponentType,
			Order:       i + 1,
			ContentJSON: contentJSON,
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

// sectionsOnlyResponse is for the first call - flat schema with just section titles and lesson titles
type sectionsOnlyResponse struct {
	Sections []sectionOutline `json:"sections"`
}

type sectionOutline struct {
	Title        string   `json:"title"`
	Description  string   `json:"description"`
	LessonTitles []string `json:"lesson_titles"`
}

// sectionLessonsResponse is for the second call - detailed lessons for a single section
type sectionLessonsResponse struct {
	Lessons []outlineLesson `json:"lessons"`
}

type outlineLesson struct {
	Title                    string   `json:"title"`
	Description              string   `json:"description"`
	EstimatedDurationMinutes int      `json:"estimated_duration_minutes"`
	LearningObjectives       []string `json:"learning_objectives"`
}

type lessonContentResponse struct {
	Components []flatLessonComponent `json:"components"`
	SegueText  string                `json:"segue_text"`
}

// flatLessonComponent matches the new flat schema where all fields are at the same level
type flatLessonComponent struct {
	// Discriminator
	ComponentType string `json:"component_type"`
	// Text fields
	TextHTML string `json:"text_html,omitempty"`
	// Heading fields
	HeadingLevel int    `json:"heading_level,omitempty"`
	HeadingText  string `json:"heading_text,omitempty"`
	// Image fields
	ImageDescription string `json:"image_description,omitempty"`
	ImageAltText     string `json:"image_alt_text,omitempty"`
	ImageCaption     string `json:"image_caption,omitempty"`
	// Quiz fields
	QuizQuestion        string       `json:"quiz_question,omitempty"`
	QuizOptions         []quizOption `json:"quiz_options,omitempty"`
	QuizCorrectAnswerID string       `json:"quiz_correct_answer_id,omitempty"`
	QuizExplanation     string       `json:"quiz_explanation,omitempty"`
}

type quizOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// toContentJSON converts flat component fields to the nested contentJSON format for storage
func (c *flatLessonComponent) toContentJSON() (string, error) {
	var content map[string]any

	switch c.ComponentType {
	case "text":
		content = map[string]any{
			"html":      c.TextHTML,
			"plaintext": stripHTML(c.TextHTML),
		}
	case "heading":
		content = map[string]any{
			"level": c.HeadingLevel,
			"text":  c.HeadingText,
		}
	case "image":
		content = map[string]any{
			"image_description": c.ImageDescription,
			"alt_text":          c.ImageAltText,
			"caption":           c.ImageCaption,
		}
	case "quiz":
		options := make([]map[string]string, len(c.QuizOptions))
		for i, opt := range c.QuizOptions {
			options[i] = map[string]string{"id": opt.ID, "text": opt.Text}
		}
		content = map[string]any{
			"question":          c.QuizQuestion,
			"question_type":     "multiple_choice",
			"options":           options,
			"correct_answer_id": c.QuizCorrectAnswerID,
			"explanation":       c.QuizExplanation,
		}
	default:
		content = map[string]any{}
	}

	jsonBytes, err := json.Marshal(content)
	if err != nil {
		return "", err
	}
	return string(jsonBytes), nil
}

// stripHTML removes HTML tags from a string to create plaintext
func stripHTML(html string) string {
	// Simple regex-free approach
	result := strings.Builder{}
	inTag := false
	for _, r := range html {
		if r == '<' {
			inTag = true
		} else if r == '>' {
			inTag = false
		} else if !inTag {
			result.WriteRune(r)
		}
	}
	return result.String()
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

// sectionsOnlySchema returns a flat schema for the first call - sections with lesson titles only
// This avoids Gemini's nested schema depth limits by keeping lessons as simple string arrays
func sectionsOnlySchema() map[string]any {
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
						"lesson_titles": map[string]any{
							"type":        "array",
							"description": "Lesson titles for this section (2-5 lessons)",
							"items":       map[string]any{"type": "string"},
						},
					},
					"required": []string{"title", "description", "lesson_titles"},
				},
			},
		},
		"required": []string{"sections"},
	}
}

// sectionLessonsSchema returns a schema for generating detailed lessons for a single section
func sectionLessonsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"lessons": map[string]any{
				"type":        "array",
				"description": "Detailed lessons for this section",
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
		"required": []string{"lessons"},
	}
}

func lessonContentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"components": map[string]any{
				"type":        "array",
				"description": "Lesson content components in order. Each component has a type and type-specific fields.",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						// Discriminator field
						"component_type": map[string]any{
							"type":        "string",
							"enum":        []string{"text", "heading", "image", "quiz"},
							"description": "The type of component. Determines which other fields are used.",
						},
						// Text component fields (used when component_type = "text")
						"text_html": map[string]any{
							"type":        "string",
							"description": "For text components: HTML-formatted rich text content with paragraphs, lists, emphasis, etc.",
						},
						// Heading component fields (used when component_type = "heading")
						"heading_level": map[string]any{
							"type":        "integer",
							"minimum":     1,
							"maximum":     4,
							"description": "For heading components: Heading level (1=largest, 4=smallest). Use 2 for section titles, 3 for subsections.",
						},
						"heading_text": map[string]any{
							"type":        "string",
							"description": "For heading components: The heading text.",
						},
						// Image component fields (used when component_type = "image")
						"image_description": map[string]any{
							"type":        "string",
							"description": "For image components: Detailed description of what image should be displayed (e.g. 'A diagram showing the water circulation system in a hot tub'). This will be used to find or generate an appropriate image later.",
						},
						"image_alt_text": map[string]any{
							"type":        "string",
							"description": "For image components: Accessibility alt text describing the image for screen readers.",
						},
						"image_caption": map[string]any{
							"type":        "string",
							"description": "For image components: Optional caption to display below the image.",
						},
						// Quiz component fields (used when component_type = "quiz")
						"quiz_question": map[string]any{
							"type":        "string",
							"description": "For quiz components: The question text.",
						},
						"quiz_options": map[string]any{
							"type":        "array",
							"description": "For quiz components: Array of 2-4 answer options.",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"id": map[string]any{
										"type":        "string",
										"description": "Unique identifier for this option (e.g. 'a', 'b', 'c', 'd').",
									},
									"text": map[string]any{
										"type":        "string",
										"description": "The answer option text.",
									},
								},
								"required": []string{"id", "text"},
							},
							"minItems": 2,
							"maxItems": 4,
						},
						"quiz_correct_answer_id": map[string]any{
							"type":        "string",
							"description": "For quiz components: The id of the correct answer option.",
						},
						"quiz_explanation": map[string]any{
							"type":        "string",
							"description": "For quiz components: Explanation shown after answering, explaining why the correct answer is right.",
						},
					},
					"required": []string{"component_type"},
				},
			},
			"segue_text": map[string]any{
				"type":        "string",
				"description": "Transition text to the next lesson. Should smoothly connect this lesson's content to the next topic. Leave empty if this is the final lesson in the course.",
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

// buildSectionsOnlyPrompt creates the prompt for the first call - sections with lesson titles only
func buildSectionsOnlyPrompt(req service.GenerateOutlineRequest) string {
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
	sb.WriteString("Create a high-level course outline with sections and lesson titles.\n")
	sb.WriteString("Each section should have a clear theme and 2-5 lessons.\n")
	sb.WriteString("For each section, provide the section title, description, and a list of lesson titles.\n")
	sb.WriteString("Ensure content flows logically and builds on previous sections.\n")

	return sb.String()
}

// buildSectionLessonsPrompt creates the prompt for generating detailed lessons for a specific section
func buildSectionLessonsPrompt(req service.GenerateOutlineRequest, sectionTitle, sectionDescription string, lessonTitles []string) string {
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

	// Include limited SME knowledge for context
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

// SummarizeContent creates a concise summary of the provided content.
func (c *Client) SummarizeContent(ctx context.Context, content string) (string, error) {
	prompt := buildSummarizePrompt(content)

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("failed to summarize content: %w", err)
	}

	return result.Text(), nil
}

// ImproveContent improves the provided content by cleaning up, clarifying, and structuring it.
func (c *Client) ImproveContent(ctx context.Context, content string) (string, error) {
	prompt := buildImprovePrompt(content)

	result, err := c.client.Models.GenerateContent(
		ctx,
		c.model,
		genai.Text(prompt),
		nil,
	)
	if err != nil {
		return "", fmt.Errorf("failed to improve content: %w", err)
	}

	return result.Text(), nil
}

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

// Helper functions

func extractTokensUsed(result *genai.GenerateContentResponse) int64 {
	if result == nil || result.UsageMetadata == nil {
		return 0
	}
	return int64(result.UsageMetadata.TotalTokenCount)
}
