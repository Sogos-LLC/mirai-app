package gemini

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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
		ResponseMIMEType:   "application/json",
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
