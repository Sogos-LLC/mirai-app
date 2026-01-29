package gemini

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// GenerateImprovedTitle generates a polished course title from a user's draft.
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
// If RAG context is provided, it will be used to enhance the outcomes.
func (c *Client) GenerateCourseOutcomes(ctx context.Context, req service.GenerateOutcomesRequest) (*service.GenerateOutcomesResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("outcomes generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildCourseOutcomesPromptWithRAG(req.CourseName, req.RAGContext)
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

	// Build citations from RAG context (if provided)
	var citations []service.KnowledgeCitation
	for _, chunk := range req.RAGContext {
		// Only include chunks with good relevance
		if chunk.RelevanceScore >= 0.5 {
			citations = append(citations, service.KnowledgeCitation{
				SourceID:       chunk.SourceID,
				SourceName:     chunk.SourceName,
				Excerpt:        truncateExcerpt(chunk.Content, 200),
				RelevanceScore: chunk.RelevanceScore,
			})
		}
	}

	return &service.GenerateOutcomesResult{
		Outcomes:   resp.Outcomes,
		Citations:  citations,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// truncateExcerpt truncates text to a maximum length, adding ellipsis if needed.
func truncateExcerpt(text string, maxLen int) string {
	if len(text) <= maxLen {
		return text
	}
	return text[:maxLen-3] + "..."
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
