package gemini

import (
	"context"
	"fmt"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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
		ResponseMIMEType:   "application/json",
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
