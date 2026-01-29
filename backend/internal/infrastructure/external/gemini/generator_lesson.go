package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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

	// Step 1: Plan components (get type + purpose for each) with validation
	planPrompt := buildComponentPlanPrompt(req)
	planConfig := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: componentPlanSchema(),
	}

	var plan componentPlanResponse
	const maxPlanRetries = 2
	for planAttempt := 0; planAttempt <= maxPlanRetries; planAttempt++ {
		planResult, err := c.generateWithRetry(ctx, "plan lesson components", func() (*genai.GenerateContentResponse, error) {
			return c.client.Models.GenerateContent(ctx, c.model, genai.Text(planPrompt), planConfig)
		})
		if err != nil {
			return nil, fmt.Errorf("failed to plan lesson components: %w", err)
		}
		totalTokensUsed += extractTokensUsed(planResult)

		if err := json.Unmarshal([]byte(planResult.Text()), &plan); err != nil {
			return nil, fmt.Errorf("failed to parse component plan: %w", err)
		}

		// Validate the plan meets ILD requirements
		if validationErr := ValidateComponentPlan(plan.Components); validationErr != nil {
			if planAttempt < maxPlanRetries {
				fmt.Printf("Plan validation failed (attempt %d/%d): %v - retrying\n",
					planAttempt+1, maxPlanRetries+1, validationErr)
				continue
			}
			// Log but proceed anyway on final failure - we've improved prompts
			fmt.Printf("Plan validation failed after %d attempts: %v - proceeding anyway\n",
				maxPlanRetries+1, validationErr)
		}
		break
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
