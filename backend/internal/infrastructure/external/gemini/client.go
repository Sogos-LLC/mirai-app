package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"golang.org/x/sync/errgroup"
	"golang.org/x/time/rate"
	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

const (
	// DefaultModel is the default Gemini model to use.
	// Using 2.0-flash for larger context window (1M tokens)
	DefaultModel = "gemini-2.0-flash"

	// Rate limiting constants for Gemini Flash 2.0 paid tier
	// Paid tier: 2000 RPM (requests per minute), 1M token context
	defaultRPM        = 2000
	defaultBurstSize  = 100                          // Allow larger bursts for parallel generation
	defaultMaxRetries = 3                            // Max retries on rate limit errors
	defaultBaseDelay  = 30 * time.Millisecond        // Base delay for backoff (60s / 2000 RPM = 30ms)
)

// Client implements service.AIProvider using Google Gemini.
type Client struct {
	client     *genai.Client
	model      string
	limiter    *rate.Limiter
	maxRetries int
	baseDelay  time.Duration
}

// NewClient creates a new Gemini client with the provided API key.
func NewClient(ctx context.Context, apiKey string) (*Client, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	// Create rate limiter: 2000 requests per minute with burst of 100
	// rate.Every(30ms) = ~33 tokens/second = ~2000/minute
	limiter := rate.NewLimiter(rate.Every(defaultBaseDelay), defaultBurstSize)

	return &Client{
		client:     client,
		model:      DefaultModel,
		limiter:    limiter,
		maxRetries: defaultMaxRetries,
		baseDelay:  defaultBaseDelay,
	}, nil
}

// waitForRateLimit waits for rate limiter permission before making an API call.
// Returns an error if context is cancelled while waiting.
func (c *Client) waitForRateLimit(ctx context.Context) error {
	if err := c.limiter.Wait(ctx); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("cancelled while waiting for rate limit: %w", ctx.Err())
		}
		return fmt.Errorf("rate limit wait failed: %w", err)
	}
	return nil
}

// isRateLimitError checks if an error is a rate limit (429) error.
func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "ResourceExhausted") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "quota exceeded")
}

// generateWithRetry executes a generation function with rate limiting and retry logic.
func (c *Client) generateWithRetry(ctx context.Context, operation string, fn func() (*genai.GenerateContentResponse, error)) (*genai.GenerateContentResponse, error) {
	var lastErr error

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		// Check if context is cancelled
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("%s cancelled: %w", operation, ctx.Err())
		default:
		}

		// Wait for rate limit permission
		if err := c.waitForRateLimit(ctx); err != nil {
			return nil, err
		}

		// Execute the operation
		result, err := fn()
		if err == nil {
			return result, nil
		}

		lastErr = err

		// If it's a rate limit error and we have retries left, wait and retry
		if isRateLimitError(err) && attempt < c.maxRetries {
			// Exponential backoff: 6s, 12s, 24s
			delay := c.baseDelay * time.Duration(1<<attempt)
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("%s cancelled during retry backoff: %w", operation, ctx.Err())
			case <-time.After(delay):
				continue
			}
		}

		// For non-rate-limit errors, fail immediately
		if !isRateLimitError(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("%s failed after %d retries: %w", operation, c.maxRetries, lastErr)
}

// TestConnection tests if the API key is valid by making a simple request.
func (c *Client) TestConnection(ctx context.Context) error {
	config := &genai.GenerateContentConfig{
		MaxOutputTokens: 10,
	}

	_, err := c.generateWithRetry(ctx, "test connection", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text("Say 'OK' if you can read this."),
			config,
		)
	})
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

	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("outline generation cancelled: %w", ctx.Err())
	default:
	}

	// Step 1: Generate sections with lesson titles only
	sectionsPrompt := buildSectionsOnlyPrompt(req)
	sectionsConfig := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: sectionsOnlySchema(),
	}

	sectionsResult, err := c.generateWithRetry(ctx, "generate sections", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(sectionsPrompt),
			sectionsConfig,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate sections: %w", err)
	}
	totalTokensUsed += extractTokensUsed(sectionsResult)

	// Parse sections response
	var sectionsResp sectionsOnlyResponse
	if err := json.Unmarshal([]byte(sectionsResult.Text()), &sectionsResp); err != nil {
		return nil, fmt.Errorf("failed to parse sections response: %w", err)
	}

	// Step 2: Generate detailed lessons for each section IN PARALLEL
	sections := make([]service.OutlineSectionResult, len(sectionsResp.Sections))
	var tokensUsedAtomic atomic.Int64

	g, gctx := errgroup.WithContext(ctx)

	for i, section := range sectionsResp.Sections {
		i, section := i, section // Capture loop variables

		g.Go(func() error {
			lessonsPrompt := buildSectionLessonsPrompt(req, section.Title, section.Description, section.LessonTitles)
			lessonsConfig := &genai.GenerateContentConfig{
				ResponseMIMEType:   "application/json",
				ResponseJsonSchema: sectionLessonsSchema(),
			}

			lessonsResult, err := c.generateWithRetry(gctx, fmt.Sprintf("generate lessons for section %d", i+1), func() (*genai.GenerateContentResponse, error) {
				return c.client.Models.GenerateContent(
					gctx,
					c.model,
					genai.Text(lessonsPrompt),
					lessonsConfig,
				)
			})
			if err != nil {
				return fmt.Errorf("failed to generate lessons for section %q: %w", section.Title, err)
			}
			tokensUsedAtomic.Add(extractTokensUsed(lessonsResult))

			// Parse lessons response
			var lessonsResp sectionLessonsResponse
			if err := json.Unmarshal([]byte(lessonsResult.Text()), &lessonsResp); err != nil {
				return fmt.Errorf("failed to parse lessons response for section %q: %w", section.Title, err)
			}

			// Convert to domain result with positional flags
			lessons := make([]service.OutlineLessonResult, len(lessonsResp.Lessons))
			for j, l := range lessonsResp.Lessons {
				lessons[j] = service.OutlineLessonResult{
					Title:                    l.Title,
					Description:              l.Description,
					Order:                    j + 1,
					EstimatedDurationMinutes: l.EstimatedDurationMinutes,
					LearningObjectives:       l.LearningObjectives,
					IsFirstInSection:         j == 0,
					IsLastInSection:          j == len(lessonsResp.Lessons)-1,
					// IsFirstInCourse and IsLastInCourse set after all sections complete
				}
			}

			sections[i] = service.OutlineSectionResult{
				Title:          section.Title,
				Description:    section.Description,
				Order:          i + 1,
				Lessons:        lessons,
				IsFirstSection: i == 0,
				IsLastSection:  i == len(sectionsResp.Sections)-1,
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	totalTokensUsed += tokensUsedAtomic.Load()

	// Set course-level positional flags (IsFirstInCourse on first lesson, IsLastInCourse on last lesson)
	if len(sections) > 0 {
		// Set IsFirstInCourse on the very first lesson
		firstSection := &sections[0]
		if len(firstSection.Lessons) > 0 {
			firstSection.Lessons[0].IsFirstInCourse = true
		}

		// Set IsLastInCourse on the very last lesson
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

// GenerateLessonContent generates content for a single lesson using iterative component generation.
// This approach generates components one at a time to avoid JSON parsing failures from large responses.
func (c *Client) GenerateLessonContent(ctx context.Context, req service.GenerateLessonRequest) (*service.GenerateLessonResult, error) {
	var totalTokensUsed int64

	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("lesson generation cancelled: %w", ctx.Err())
	default:
	}

	// Step 1: Plan components (get type + purpose for each)
	planPrompt := buildComponentPlanPrompt(req)
	planConfig := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: componentPlanSchema(),
	}

	planResult, err := c.generateWithRetry(ctx, "plan lesson components", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(planPrompt), planConfig)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to plan lesson components: %w", err)
	}
	totalTokensUsed += extractTokensUsed(planResult)

	var plan componentPlanResponse
	if err := json.Unmarshal([]byte(planResult.Text()), &plan); err != nil {
		return nil, fmt.Errorf("failed to parse component plan: %w", err)
	}

	// Step 2: Generate each component individually with position awareness
	var components []service.LessonComponentResult
	var previousComponentsContext strings.Builder
	totalComponents := len(plan.Components)

	for i, planned := range plan.Components {
		// Check for cancellation before each component
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("lesson generation cancelled after %d components: %w", i, ctx.Err())
		default:
		}

		// Build position information for this component
		pos := componentPosition{
			Index:   i,
			Total:   totalComponents,
			IsFirst: i == 0,
			IsLast:  i == totalComponents-1,
		}

		// Build prompt for this single component with position awareness
		compPrompt := buildSingleComponentPromptWithPosition(req, planned, previousComponentsContext.String(), pos)
		compSchema := singleComponentSchema(planned.ComponentType)
		compConfig := &genai.GenerateContentConfig{
			ResponseMIMEType:   "application/json",
			ResponseJsonSchema: compSchema,
		}

		compResult, err := c.generateWithRetry(ctx, fmt.Sprintf("generate %s component %d/%d", planned.ComponentType, i+1, totalComponents), func() (*genai.GenerateContentResponse, error) {
			return c.client.Models.GenerateContent(ctx, c.model, genai.Text(compPrompt), compConfig)
		})
		if err != nil {
			// Log but continue - graceful degradation
			fmt.Printf("Warning: failed to generate %s component: %v\n", planned.ComponentType, err)
			continue
		}
		totalTokensUsed += extractTokensUsed(compResult)

		// Parse the individual component
		comp, contentJSON, summary, err := parseAndTransformComponent(planned.ComponentType, compResult.Text())
		if err != nil {
			// Log but continue - graceful degradation
			fmt.Printf("Warning: failed to parse %s component: %v\n", planned.ComponentType, err)
			continue
		}

		components = append(components, service.LessonComponentResult{
			Type:        comp.ComponentType,
			Order:       len(components) + 1,
			ContentJSON: contentJSON,
		})

		// Add summary to context for next component
		previousComponentsContext.WriteString(fmt.Sprintf("- [%s] %s\n", planned.ComponentType, summary))
	}

	// Step 3: Generate segue text (for all lessons, including last one for course conclusion)
	segueText := ""
	// Generate segue for: transitions to next lesson, section transitions, or course conclusion
	shouldGenerateSegue := req.NextLessonTitle != "" || req.NextSectionTitle != "" || req.IsLastInCourse
	if shouldGenerateSegue {
		seguePrompt := buildSeguePrompt(req)
		segueConfig := &genai.GenerateContentConfig{
			ResponseMIMEType:   "application/json",
			ResponseJsonSchema: segueSchema(),
		}

		segueResult, err := c.generateWithRetry(ctx, "generate segue text", func() (*genai.GenerateContentResponse, error) {
			return c.client.Models.GenerateContent(ctx, c.model, genai.Text(seguePrompt), segueConfig)
		})
		if err == nil {
			totalTokensUsed += extractTokensUsed(segueResult)
			var segue segueResponse
			if json.Unmarshal([]byte(segueResult.Text()), &segue) == nil {
				segueText = segue.SegueText
			}
		}
	}

	if len(components) == 0 {
		return nil, fmt.Errorf("failed to generate any components for lesson")
	}

	return &service.GenerateLessonResult{
		Components: components,
		SegueText:  segueText,
		TokensUsed: totalTokensUsed,
	}, nil
}

// RegenerateComponent regenerates a single component with modifications.
func (c *Client) RegenerateComponent(ctx context.Context, req service.RegenerateComponentRequest) (*service.RegenerateComponentResult, error) {
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("component regeneration cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildRegeneratePrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: componentSchema(req.ComponentType),
	}

	result, err := c.generateWithRetry(ctx, "regenerate component", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			config,
		)
	})
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
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("SME content processing cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildSMEProcessingPrompt(req)

	config := &genai.GenerateContentConfig{
		ResponseMIMEType:  "application/json",
		ResponseJsonSchema: smeProcessingSchema(),
	}

	result, err := c.generateWithRetry(ctx, "process SME content", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			config,
		)
	})
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

// Component planning types (for iterative generation)
type componentPlanResponse struct {
	Components []plannedComponent `json:"components"`
}

type plannedComponent struct {
	ComponentType string `json:"component_type"`
	Purpose       string `json:"purpose"`
}

type segueResponse struct {
	SegueText string `json:"segue_text"`
}

// Individual component response types
type singleTextComponent struct {
	TextHTML string `json:"text_html"`
}

type singleHeadingComponent struct {
	HeadingLevel int    `json:"heading_level"`
	HeadingText  string `json:"heading_text"`
}

type singleImageComponent struct {
	ImageDescription string `json:"image_description"`
	ImageAltText     string `json:"image_alt_text"`
	ImageCaption     string `json:"image_caption"`
}

type singleQuizComponent struct {
	QuizQuestion        string       `json:"quiz_question"`
	QuizOptions         []quizOption `json:"quiz_options"`
	QuizCorrectAnswerID string       `json:"quiz_correct_answer_id"`
	QuizExplanation     string       `json:"quiz_explanation"`
}

type singleCodeComponent struct {
	Code     string `json:"code"`
	Language string `json:"language"`
}

type singleCalloutComponent struct {
	Style   string `json:"style"`
	Title   string `json:"title"`
	Content string `json:"content"`
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

// =============================================================================
// Iterative Component Generation Schemas
// =============================================================================

// componentPlanSchema returns a simple schema for planning lesson components
func componentPlanSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"components": map[string]any{
				"type":        "array",
				"description": "Planned components for this lesson (5-8 components)",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"component_type": map[string]any{
							"type":        "string",
							"enum":        []string{"text", "heading", "image", "quiz"},
							"description": "The type of component",
						},
						"purpose": map[string]any{
							"type":        "string",
							"description": "Brief description of what this component will contain (1-2 sentences)",
						},
					},
					"required": []string{"component_type", "purpose"},
				},
			},
		},
		"required": []string{"components"},
	}
}

// singleComponentSchema returns the schema for generating a single component
func singleComponentSchema(componentType string) map[string]any {
	switch componentType {
	case "text":
		return singleTextSchema()
	case "heading":
		return singleHeadingSchema()
	case "image":
		return singleImageSchema()
	case "quiz":
		return singleQuizSchema()
	case "code":
		return singleCodeSchema()
	case "callout":
		return singleCalloutSchema()
	default:
		return singleTextSchema()
	}
}

func singleTextSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"text_html": map[string]any{
				"type":        "string",
				"description": "HTML-formatted rich text content (2-4 paragraphs with <p> tags, can include <strong>, <em>, <ul>, <li>)",
			},
		},
		"required": []string{"text_html"},
	}
}

func singleHeadingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"heading_level": map[string]any{
				"type":        "integer",
				"minimum":     1,
				"maximum":     4,
				"description": "Heading level (2 for main sections, 3 for subsections)",
			},
			"heading_text": map[string]any{
				"type":        "string",
				"description": "The heading text",
			},
		},
		"required": []string{"heading_level", "heading_text"},
	}
}

func singleImageSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"image_description": map[string]any{
				"type":        "string",
				"description": "Detailed description of what image should show (for later generation/selection)",
			},
			"image_alt_text": map[string]any{
				"type":        "string",
				"description": "Accessibility alt text for the image",
			},
			"image_caption": map[string]any{
				"type":        "string",
				"description": "Optional caption to display below the image",
			},
		},
		"required": []string{"image_description", "image_alt_text"},
	}
}

func singleQuizSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"quiz_question": map[string]any{
				"type":        "string",
				"description": "The quiz question text",
			},
			"quiz_options": map[string]any{
				"type":        "array",
				"description": "2-4 answer options",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":   map[string]any{"type": "string", "description": "Option ID (a, b, c, or d)"},
						"text": map[string]any{"type": "string", "description": "Option text"},
					},
					"required": []string{"id", "text"},
				},
				"minItems": 2,
				"maxItems": 4,
			},
			"quiz_correct_answer_id": map[string]any{
				"type":        "string",
				"description": "ID of the correct answer",
			},
			"quiz_explanation": map[string]any{
				"type":        "string",
				"description": "Explanation of why the correct answer is right",
			},
		},
		"required": []string{"quiz_question", "quiz_options", "quiz_correct_answer_id", "quiz_explanation"},
	}
}

func segueSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"segue_text": map[string]any{
				"type":        "string",
				"description": "Transition text to the next lesson (1-2 sentences)",
			},
		},
		"required": []string{"segue_text"},
	}
}

func singleCodeSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"code": map[string]any{
				"type":        "string",
				"description": "Code snippet (5-15 lines, relevant to the lesson)",
			},
			"language": map[string]any{
				"type":        "string",
				"description": "Programming language (javascript, python, go, html, css, sql, bash, etc.)",
			},
		},
		"required": []string{"code", "language"},
	}
}

func singleCalloutSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"style": map[string]any{
				"type":        "string",
				"enum":        []string{"info", "warning", "success", "error", "tip"},
				"description": "Visual style of the callout",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Optional short title for the callout",
			},
			"content": map[string]any{
				"type":        "string",
				"description": "Callout message (1-2 sentences of important information)",
			},
		},
		"required": []string{"style", "content"},
	}
}

// calloutStyleToNumber converts a string style to its numeric enum value
func calloutStyleToNumber(style string) int {
	switch strings.ToLower(style) {
	case "info":
		return 1
	case "warning":
		return 2
	case "success":
		return 3
	case "error":
		return 4
	case "tip":
		return 5
	default:
		return 1 // Default to info
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

// =============================================================================
// Iterative Component Generation Prompts
// =============================================================================

func buildComponentPlanPrompt(req service.GenerateLessonRequest) string {
	var sb strings.Builder

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

	// Instructions with position-aware guidance
	sb.WriteString("## Component Planning Instructions\n")
	sb.WriteString("Plan 5-8 components for this lesson. For each component, specify:\n")
	sb.WriteString("1. The type (text, heading, image, or quiz)\n")
	sb.WriteString("2. A brief purpose describing what it will contain\n\n")

	sb.WriteString("Required components:\n")
	sb.WriteString("- At least 1 heading (for structure)\n")
	sb.WriteString("- At least 2 text components (for content)\n")
	sb.WriteString("- At least 1 image (for visual learning)\n")
	sb.WriteString("- At least 1 quiz (for knowledge check)\n\n")

	// Position-specific guidance
	if req.IsFirstInCourse {
		sb.WriteString("**IMPORTANT - First Lesson of Course:**\n")
		sb.WriteString("- Start with a welcoming introduction to the entire course\n")
		sb.WriteString("- Set expectations for what learners will achieve\n")
		sb.WriteString("- Build excitement and motivation\n\n")
	} else if req.IsFirstInSection {
		sb.WriteString("**IMPORTANT - First Lesson of Section:**\n")
		sb.WriteString("- Introduce the section's theme and goals\n")
		sb.WriteString("- Connect to what was learned in the previous section\n")
		sb.WriteString("- Set expectations for this section\n\n")
	}

	if req.IsLastInCourse {
		sb.WriteString("**IMPORTANT - Final Lesson of Course:**\n")
		sb.WriteString("- Include a comprehensive summary/conclusion component\n")
		sb.WriteString("- Celebrate the learner's achievement\n")
		sb.WriteString("- Provide next steps or resources for continued learning\n\n")
	} else if req.IsLastInSection {
		sb.WriteString("**IMPORTANT - Last Lesson of Section:**\n")
		sb.WriteString("- Include a section summary component\n")
		sb.WriteString("- Prepare learners for the transition to the next section\n\n")
	}

	sb.WriteString("General structure:\n")
	sb.WriteString("1. Introduction heading and text\n")
	sb.WriteString("2. Main content with explanations and examples\n")
	sb.WriteString("3. Visual element (image or diagram)\n")
	sb.WriteString("4. Quiz to check understanding\n")
	sb.WriteString("5. Summary or key takeaways\n")

	return sb.String()
}

// componentPosition tracks where a component is in the lesson
type componentPosition struct {
	Index       int
	Total       int
	IsFirst     bool
	IsLast      bool
}

func buildSingleComponentPrompt(req service.GenerateLessonRequest, planned plannedComponent, previousComponents string) string {
	return buildSingleComponentPromptWithPosition(req, planned, previousComponents, componentPosition{})
}

func buildSingleComponentPromptWithPosition(req service.GenerateLessonRequest, planned plannedComponent, previousComponents string, pos componentPosition) string {
	var sb strings.Builder

	sb.WriteString("You are generating a single educational component for a lesson.\n\n")

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

	// Type-specific instructions with position awareness
	sb.WriteString("## Instructions\n")
	switch planned.ComponentType {
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
		sb.WriteString("- text_html: 2-4 paragraphs of HTML-formatted content\n")
		sb.WriteString("- Use <p> tags for paragraphs\n")
		sb.WriteString("- Can include <strong>, <em>, <ul>, <li> for emphasis and lists\n")
		sb.WriteString("- Be educational and engaging\n")
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
	}

	return sb.String()
}

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

// parseAndTransformComponent parses a single component response and transforms it to storage format
func parseAndTransformComponent(componentType, responseText string) (*flatLessonComponent, string, string, error) {
	comp := &flatLessonComponent{ComponentType: componentType}
	var contentJSON string
	var summary string

	switch componentType {
	case "text":
		var resp singleTextComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse text component: %w", err)
		}
		comp.TextHTML = resp.TextHTML
		content := map[string]any{
			"html":      resp.TextHTML,
			"plaintext": stripHTML(resp.TextHTML),
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		// Summary: first 60 chars of plaintext
		plaintext := stripHTML(resp.TextHTML)
		if len(plaintext) > 60 {
			summary = plaintext[:60] + "..."
		} else {
			summary = plaintext
		}

	case "heading":
		var resp singleHeadingComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse heading component: %w", err)
		}
		comp.HeadingLevel = resp.HeadingLevel
		comp.HeadingText = resp.HeadingText
		content := map[string]any{
			"level": resp.HeadingLevel,
			"text":  resp.HeadingText,
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		summary = fmt.Sprintf("H%d: %s", resp.HeadingLevel, resp.HeadingText)

	case "image":
		var resp singleImageComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse image component: %w", err)
		}
		comp.ImageDescription = resp.ImageDescription
		comp.ImageAltText = resp.ImageAltText
		comp.ImageCaption = resp.ImageCaption
		// Use camelCase to match frontend ImageRenderer expectations
		content := map[string]any{
			"imageDescription": resp.ImageDescription,
			"altText":          resp.ImageAltText,
			"caption":          resp.ImageCaption,
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		summary = fmt.Sprintf("Image: %s", resp.ImageAltText)

	case "quiz":
		var resp singleQuizComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse quiz component: %w", err)
		}
		comp.QuizQuestion = resp.QuizQuestion
		comp.QuizOptions = resp.QuizOptions
		comp.QuizCorrectAnswerID = resp.QuizCorrectAnswerID
		comp.QuizExplanation = resp.QuizExplanation
		options := make([]map[string]string, len(resp.QuizOptions))
		for i, opt := range resp.QuizOptions {
			options[i] = map[string]string{"id": opt.ID, "text": opt.Text}
		}
		content := map[string]any{
			"question":          resp.QuizQuestion,
			"question_type":     "multiple_choice",
			"options":           options,
			"correct_answer_id": resp.QuizCorrectAnswerID,
			"explanation":       resp.QuizExplanation,
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		// Summary: first 40 chars of question
		if len(resp.QuizQuestion) > 40 {
			summary = fmt.Sprintf("Quiz: %s...", resp.QuizQuestion[:40])
		} else {
			summary = fmt.Sprintf("Quiz: %s", resp.QuizQuestion)
		}

	case "code":
		var resp singleCodeComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse code component: %w", err)
		}
		content := map[string]any{
			"code":     resp.Code,
			"language": resp.Language,
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		summary = fmt.Sprintf("Code (%s)", resp.Language)

	case "callout":
		var resp singleCalloutComponent
		if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
			return nil, "", "", fmt.Errorf("failed to parse callout component: %w", err)
		}
		// Convert string style to numeric enum value (matches proto CalloutStyle)
		styleNum := calloutStyleToNumber(resp.Style)
		content := map[string]any{
			"style":   styleNum,
			"title":   resp.Title,
			"content": resp.Content,
		}
		jsonBytes, _ := json.Marshal(content)
		contentJSON = string(jsonBytes)
		if resp.Title != "" {
			summary = fmt.Sprintf("%s: %s", resp.Style, resp.Title)
		} else if len(resp.Content) > 40 {
			summary = fmt.Sprintf("%s: %s...", resp.Style, resp.Content[:40])
		} else {
			summary = fmt.Sprintf("%s: %s", resp.Style, resp.Content)
		}

	default:
		return nil, "", "", fmt.Errorf("unknown component type: %s", componentType)
	}

	return comp, contentJSON, summary, nil
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
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return "", fmt.Errorf("summarization cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildSummarizePrompt(content)

	result, err := c.generateWithRetry(ctx, "summarize content", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			nil,
		)
	})
	if err != nil {
		return "", fmt.Errorf("failed to summarize content: %w", err)
	}

	return result.Text(), nil
}

// ImproveContent improves the provided content by cleaning up, clarifying, and structuring it.
func (c *Client) ImproveContent(ctx context.Context, content string) (string, error) {
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return "", fmt.Errorf("content improvement cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildImprovePrompt(content)

	result, err := c.generateWithRetry(ctx, "improve content", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			nil,
		)
	})
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

// =============================================================================
// Wizard AI Generation Methods
// =============================================================================

// GenerateImprovedTitle improves the course name and generates a description.
func (c *Client) GenerateImprovedTitle(ctx context.Context, courseName string) (*service.GenerateTitleResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("title generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildImprovedTitlePrompt(courseName)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: improvedTitleSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate improved title", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(prompt), config)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate improved title: %w", err)
	}

	var resp improvedTitleResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse improved title response: %w", err)
	}

	return &service.GenerateTitleResult{
		ImprovedTitle: resp.ImprovedTitle,
		Description:   resp.Description,
		TokensUsed:    extractTokensUsed(result),
	}, nil
}

// GenerateCourseOutcomes generates desired course outcomes from a course name.
// Used by the "magic wand" button in wizard step 1.
func (c *Client) GenerateCourseOutcomes(ctx context.Context, courseName string) (*service.GenerateOutcomesResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("outcomes generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildCourseOutcomesPrompt(courseName)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: courseOutcomesSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate course outcomes", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(prompt), config)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate course outcomes: %w", err)
	}

	var resp courseOutcomesResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse course outcomes response: %w", err)
	}

	return &service.GenerateOutcomesResult{
		Outcomes:   resp.Outcomes,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// GenerateSMEPersonas generates 3 diverse SME personas based on course topic.
func (c *Client) GenerateSMEPersonas(ctx context.Context, title, description string) (*service.GenerateSMEPersonasResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("SME persona generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildSMEPersonasPrompt(title, description)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: smePersonasSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate SME personas", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(prompt), config)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate SME personas: %w", err)
	}

	var resp smePersonasResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse SME personas response: %w", err)
	}

	personas := make([]service.WizardSMEPersona, len(resp.Personas))
	for i, p := range resp.Personas {
		personas[i] = service.WizardSMEPersona{
			ID:          p.ID,
			JobTitle:    p.JobTitle,
			Description: p.Description,
			Skills:      p.Skills,
			Voice:       p.Voice,
		}
	}

	return &service.GenerateSMEPersonasResult{
		Personas:   personas,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// GenerateAudiencePersonas generates 3 diverse audience personas.
func (c *Client) GenerateAudiencePersonas(ctx context.Context, req service.GenerateAudiencePersonasRequest) (*service.GenerateAudiencePersonasResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("audience persona generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildAudiencePersonasPrompt(req)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: audiencePersonasSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate audience personas", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(prompt), config)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate audience personas: %w", err)
	}

	var resp audiencePersonasResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse audience personas response: %w", err)
	}

	personas := make([]service.WizardAudiencePersona, len(resp.Personas))
	for i, p := range resp.Personas {
		personas[i] = service.WizardAudiencePersona{
			ID:          p.ID,
			Name:        p.Name,
			Role:        p.Role,
			Description: p.Description,
			Goals:       p.Goals,
		}
	}

	return &service.GenerateAudiencePersonasResult{
		Personas:   personas,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// GenerateToneOptions generates 3 tone/style options for the course.
func (c *Client) GenerateToneOptions(ctx context.Context, req service.GenerateToneOptionsRequest) (*service.GenerateToneOptionsResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("tone options generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildToneOptionsPrompt(req)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: toneOptionsSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate tone options", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(ctx, c.model, genai.Text(prompt), config)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate tone options: %w", err)
	}

	var resp toneOptionsResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse tone options response: %w", err)
	}

	options := make([]service.WizardToneOption, len(resp.Options))
	for i, o := range resp.Options {
		options[i] = service.WizardToneOption{
			ID:            o.ID,
			Name:          o.Name,
			Description:   o.Description,
			LevelOfDetail: o.LevelOfDetail,
		}
	}

	return &service.GenerateToneOptionsResult{
		Options:    options,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// =============================================================================
// Wizard Response Types
// =============================================================================

type improvedTitleResponse struct {
	ImprovedTitle string `json:"improved_title"`
	Description   string `json:"description"`
}

type courseOutcomesResponse struct {
	Outcomes string `json:"outcomes"`
}

type smePersonasResponse struct {
	Personas []smePersonaItem `json:"personas"`
}

type smePersonaItem struct {
	ID          string   `json:"id"`
	JobTitle    string   `json:"job_title"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Voice       string   `json:"voice"`
}

type audiencePersonasResponse struct {
	Personas []audiencePersonaItem `json:"personas"`
}

type audiencePersonaItem struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Description string   `json:"description"`
	Goals       []string `json:"goals"`
}

type toneOptionsResponse struct {
	Options []toneOptionItem `json:"options"`
}

type toneOptionItem struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	LevelOfDetail string `json:"level_of_detail"`
}

// =============================================================================
// Wizard Schema Definitions
// =============================================================================

func improvedTitleSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"improved_title": map[string]any{
				"type":        "string",
				"description": "A polished, professional course title that is clear, engaging, and accurately represents the content.",
			},
			"description": map[string]any{
				"type":        "string",
				"description": "A compelling 2-3 sentence description of the course that highlights what learners will gain.",
			},
		},
		"required": []string{"improved_title", "description"},
	}
}

func courseOutcomesSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"outcomes": map[string]any{
				"type":        "string",
				"description": "A formatted list of 3-5 learning outcomes as bullet points, each starting with an action verb.",
			},
		},
		"required": []string{"outcomes"},
	}
}

func smePersonasSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"personas": map[string]any{
				"type":        "array",
				"description": "3 diverse SME personas with different expertise angles",
				"minItems":    3,
				"maxItems":    3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id": map[string]any{
							"type":        "string",
							"description": "Unique identifier (e.g., 'sme-1', 'sme-2', 'sme-3')",
						},
						"job_title": map[string]any{
							"type":        "string",
							"description": "Professional job title (e.g., 'Senior Data Scientist', 'UX Research Lead')",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "2-3 sentence background describing their expertise and experience",
						},
						"skills": map[string]any{
							"type":        "array",
							"description": "3-5 key skills or areas of expertise",
							"items":       map[string]any{"type": "string"},
						},
						"voice": map[string]any{
							"type":        "string",
							"description": "Their teaching voice/style (e.g., 'Practical and hands-on', 'Academic and thorough')",
						},
					},
					"required": []string{"id", "job_title", "description", "skills", "voice"},
				},
			},
		},
		"required": []string{"personas"},
	}
}

func audiencePersonasSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"personas": map[string]any{
				"type":        "array",
				"description": "3 diverse audience personas representing different learner profiles",
				"minItems":    3,
				"maxItems":    3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id": map[string]any{
							"type":        "string",
							"description": "Unique identifier (e.g., 'audience-1', 'audience-2', 'audience-3')",
						},
						"name": map[string]any{
							"type":        "string",
							"description": "A representative name for this persona (e.g., 'Alex the Career Changer')",
						},
						"role": map[string]any{
							"type":        "string",
							"description": "Their current job role or position",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "2-3 sentence description of their background and current situation",
						},
						"goals": map[string]any{
							"type":        "array",
							"description": "2-4 learning goals or outcomes they want to achieve",
							"items":       map[string]any{"type": "string"},
						},
					},
					"required": []string{"id", "name", "role", "description", "goals"},
				},
			},
		},
		"required": []string{"personas"},
	}
}

func toneOptionsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"options": map[string]any{
				"type":        "array",
				"description": "3 distinct tone/style options for the course",
				"minItems":    3,
				"maxItems":    3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id": map[string]any{
							"type":        "string",
							"description": "Unique identifier (e.g., 'tone-1', 'tone-2', 'tone-3')",
						},
						"name": map[string]any{
							"type":        "string",
							"description": "Short name for this tone (e.g., 'Quick Start Guide', 'Deep Dive', 'Hands-on Workshop')",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "2-3 sentence description of the tone and teaching style",
						},
						"level_of_detail": map[string]any{
							"type":        "string",
							"enum":        []string{"brief", "moderate", "comprehensive"},
							"description": "The depth of content coverage",
						},
					},
					"required": []string{"id", "name", "description", "level_of_detail"},
				},
			},
		},
		"required": []string{"options"},
	}
}

// =============================================================================
// Wizard Prompt Builders
// =============================================================================

func buildImprovedTitlePrompt(courseName string) string {
	return fmt.Sprintf(`You are an expert course designer who creates compelling course titles and descriptions.

## Original Course Name
%s

## Instructions
Based on the course name provided, create:

1. **Improved Title**: A polished, professional course title that:
   - Is clear and specific about what learners will learn
   - Is engaging and motivating
   - Uses proper capitalization (Title Case)
   - Is concise (typically 3-8 words)
   - Avoids jargon unless the topic requires it

2. **Description**: A compelling 2-3 sentence course description that:
   - Clearly states what the course covers
   - Highlights the key benefits for learners
   - Sets appropriate expectations for the content
   - Uses active, engaging language

Keep the improved title close to the original intent, but make it more professional and marketable.`, courseName)
}

func buildCourseOutcomesPrompt(courseName string) string {
	return fmt.Sprintf(`You are an expert instructional designer who creates measurable learning outcomes for professional courses.

## Course Topic
%s

## Instructions
Generate 3-5 clear, measurable learning outcomes for this course. Each outcome should:

1. Start with an action verb from Bloom's Taxonomy (e.g., Understand, Apply, Analyze, Create, Evaluate)
2. Be specific and measurable
3. Describe what the learner will be able to DO after completing the course
4. Be achievable within a typical course duration

Format your response as bullet points, with each outcome on a new line starting with "• ".

Example format:
• Understand the fundamental concepts of [topic] and their applications
• Apply [skill] techniques to solve real-world problems
• Analyze [subject] scenarios and identify key patterns
• Create effective [deliverable] using industry best practices
• Evaluate [outcomes] and make data-driven decisions

Generate outcomes that are relevant, practical, and aligned with professional development goals.`, courseName)
}

func buildSMEPersonasPrompt(title, description string) string {
	return fmt.Sprintf(`You are an expert instructional designer creating subject matter expert (SME) personas for a course.

## Course Information
**Title:** %s
**Description:** %s

## Instructions
Generate 3 diverse SME personas who could teach this course. Each persona should:

1. Have a unique professional background and expertise angle
2. Bring different perspectives to the subject matter
3. Have distinct teaching styles that would appeal to different learners

Make the personas realistic and specific to the course topic. Consider:
- Different career paths that lead to expertise in this area
- Varying years of experience and specializations
- Different industries or contexts where this knowledge applies

The personas should complement each other, covering different aspects of the course material from different angles.`, title, description)
}

func buildAudiencePersonasPrompt(req service.GenerateAudiencePersonasRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating target audience personas for a course.\n\n")

	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.Title))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", req.Description))

	if len(req.SMEPersonas) > 0 {
		sb.WriteString("## Subject Matter Experts Teaching This Course\n")
		for _, sme := range req.SMEPersonas {
			sb.WriteString(fmt.Sprintf("- **%s**: %s\n", sme.JobTitle, sme.Description))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(`## Instructions
Generate 3 diverse audience personas who would benefit from this course. Each persona should:

1. Have a distinct background and current role
2. Have different motivations for taking the course
3. Represent different experience levels (e.g., beginner, intermediate, career-changer)

Make the personas realistic and relatable. Consider:
- Different career stages (early career, mid-career, transitioning)
- Different industries or contexts
- Different learning goals and motivations
- What challenges they face that this course would address

Each persona should feel like a real person with specific goals and challenges.`)

	return sb.String()
}

func buildToneOptionsPrompt(req service.GenerateToneOptionsRequest) string {
	var sb strings.Builder

	sb.WriteString("You are an expert instructional designer creating tone and style options for a course.\n\n")

	sb.WriteString("## Course Information\n")
	sb.WriteString(fmt.Sprintf("**Title:** %s\n", req.Title))
	sb.WriteString(fmt.Sprintf("**Description:** %s\n\n", req.Description))

	if len(req.AudiencePersonas) > 0 {
		sb.WriteString("## Target Audience\n")
		for _, p := range req.AudiencePersonas {
			sb.WriteString(fmt.Sprintf("- **%s** (%s): %s\n", p.Name, p.Role, p.Description))
		}
		sb.WriteString("\n")
	}

	sb.WriteString(`## Instructions
Generate 3 distinct tone/style options for this course. Each option should:

1. Have a clear, descriptive name (e.g., "Quick Start Guide", "Deep Dive", "Hands-on Workshop")
2. Define a specific teaching approach and content depth
3. Match one of these detail levels:
   - "brief": Concise, focused on essentials, quick to complete
   - "moderate": Balanced coverage, includes examples and practice
   - "comprehensive": In-depth, thorough explanations, extensive practice

The options should offer meaningful variety:
- One focused on practical, quick application
- One balanced for general learning
- One thorough for deep understanding

Consider what tone would best serve the target audience's goals.`)

	return sb.String()
}

// =============================================================================
// Image Generation
// =============================================================================

const (
	// ImageGenerationModel is the model used for high-quality image generation.
	// gemini-3-pro-image-preview is optimized for professional image generation.
	ImageGenerationModel = "gemini-3-pro-image-preview"
)

// GenerateImage generates an image from a text prompt using Gemini's image generation.
func (c *Client) GenerateImage(ctx context.Context, req service.GenerateImageRequest) (*service.GenerateImageResult, error) {
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("image generation cancelled: %w", ctx.Err())
	default:
	}

	// Set default aspect ratio
	aspectRatio := req.AspectRatio
	if aspectRatio == "" {
		aspectRatio = "16:9"
	}

	// Build a descriptive prompt for better image generation
	// Follow best practice: describe the scene, don't just list keywords
	prompt := buildImageGenerationPrompt(req.Prompt)

	// Configure for image generation
	config := &genai.GenerateContentConfig{
		ResponseModalities: []string{"Image"},
		ImageConfig: &genai.ImageConfig{
			AspectRatio: aspectRatio,
			ImageSize:   "1K", // Use 1K for reasonable quality and speed
		},
	}

	result, err := c.generateWithRetry(ctx, "generate image", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			ImageGenerationModel,
			genai.Text(prompt),
			config,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate image: %w", err)
	}

	// Extract image data from response
	imageData, mimeType, err := extractImageFromResponse(result)
	if err != nil {
		return nil, err
	}

	return &service.GenerateImageResult{
		ImageData:  imageData,
		MimeType:   mimeType,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// buildImageGenerationPrompt enhances the image description for better generation results.
// Following Gemini best practices: describe the scene narratively.
func buildImageGenerationPrompt(description string) string {
	var sb strings.Builder

	sb.WriteString("Create a professional, high-quality educational illustration. ")
	sb.WriteString("The image should be clear, visually appealing, and suitable for an online learning platform. ")
	sb.WriteString("\n\n")
	sb.WriteString("Image description: ")
	sb.WriteString(description)
	sb.WriteString("\n\n")
	sb.WriteString("Style guidelines:\n")
	sb.WriteString("- Clean, modern aesthetic suitable for professional education\n")
	sb.WriteString("- Good contrast and readability\n")
	sb.WriteString("- Avoid text overlays (captions will be added separately)\n")
	sb.WriteString("- Use a consistent, neutral color palette that works in both light and dark themes\n")

	return sb.String()
}

// extractImageFromResponse extracts image bytes and MIME type from Gemini response.
func extractImageFromResponse(result *genai.GenerateContentResponse) ([]byte, string, error) {
	if result == nil || len(result.Candidates) == 0 {
		return nil, "", fmt.Errorf("no response candidates from image generation")
	}

	candidate := result.Candidates[0]
	if candidate.Content == nil || len(candidate.Content.Parts) == 0 {
		return nil, "", fmt.Errorf("no content parts in image generation response")
	}

	// Look for image data in the response parts
	for _, part := range candidate.Content.Parts {
		if part.InlineData != nil && part.InlineData.Data != nil {
			return part.InlineData.Data, part.InlineData.MIMEType, nil
		}
	}

	return nil, "", fmt.Errorf("no image data found in response")
}

// Helper functions

func extractTokensUsed(result *genai.GenerateContentResponse) int64 {
	if result == nil || result.UsageMetadata == nil {
		return 0
	}
	return int64(result.UsageMetadata.TotalTokenCount)
}
