package gemini

import (
	"context"
	"encoding/json"
	"fmt"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// AnalyzeDocument analyzes a single knowledge source document and produces
// structured summaries, key facts, and search term suggestions per topic.
func (c *Client) AnalyzeDocument(ctx context.Context, req service.AnalyzeDocumentRequest) (*service.AnalyzeDocumentResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("document analysis cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildAnalyzeDocumentPrompt(req)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: documentAnalysisSchema(),
	}

	result, err := c.generateWithRetry(ctx, "analyze document", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			config,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to analyze document %q: %w", req.SourceName, err)
	}

	tokensUsed := extractTokensUsed(result)

	// Parse response
	var resp documentAnalysisResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse document analysis response: %w", err)
	}

	// Convert to domain result
	sectionHints := make([]service.SectionHintResult, len(resp.SectionHints))
	for i, hint := range resp.SectionHints {
		sectionHints[i] = service.SectionHintResult{
			TopicName:   hint.TopicName,
			SearchTerms: hint.SearchTerms,
			KeyPoints:   hint.KeyPoints,
		}
	}

	return &service.AnalyzeDocumentResult{
		Summary:      resp.Summary,
		MainTopics:   resp.MainTopics,
		KeyFacts:     resp.KeyFacts,
		ContentDepth: resp.ContentDepth,
		SectionHints: sectionHints,
		TokensUsed:   tokensUsed,
	}, nil
}

// GenerateCoursePlan creates a structured course plan with sections and lessons,
// each carrying targeted search terms for subsequent RAG retrieval.
func (c *Client) GenerateCoursePlan(ctx context.Context, req service.GenerateCoursePlanRequest) (*service.GenerateCoursePlanResult, error) {
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("course plan generation cancelled: %w", ctx.Err())
	default:
	}

	prompt := buildCoursePlanPrompt(req)
	config := &genai.GenerateContentConfig{
		ResponseMIMEType:   "application/json",
		ResponseJsonSchema: coursePlanSchema(),
	}

	result, err := c.generateWithRetry(ctx, "generate course plan", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			c.model,
			genai.Text(prompt),
			config,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate course plan: %w", err)
	}

	tokensUsed := extractTokensUsed(result)

	// Parse response
	var resp coursePlanResponse
	if err := json.Unmarshal([]byte(result.Text()), &resp); err != nil {
		return nil, fmt.Errorf("failed to parse course plan response: %w", err)
	}

	// Convert to domain result
	sections := make([]service.PlannedSectionResult, len(resp.Sections))
	for i, s := range resp.Sections {
		lessons := make([]service.PlannedLessonResult, len(s.Lessons))
		for j, l := range s.Lessons {
			lessons[j] = service.PlannedLessonResult{
				Title:         l.Title,
				Description:   l.Description,
				SearchTerms:   l.SearchTerms,
				LearningGoals: l.LearningGoals,
			}
		}

		sections[i] = service.PlannedSectionResult{
			Title:       s.Title,
			Description: s.Description,
			SearchTerms: s.SearchTerms,
			SourceIDs:   s.SourceIDs,
			Lessons:     lessons,
			Rationale:   s.Rationale,
		}
	}

	return &service.GenerateCoursePlanResult{
		Sections:   sections,
		TokensUsed: tokensUsed,
	}, nil
}

// Response types for JSON parsing

type documentAnalysisResponse struct {
	Summary      string                     `json:"summary"`
	MainTopics   []string                   `json:"main_topics"`
	KeyFacts     []string                   `json:"key_facts"`
	ContentDepth string                     `json:"content_depth"`
	SectionHints []sectionHintResponse      `json:"section_hints"`
}

type sectionHintResponse struct {
	TopicName   string   `json:"topic_name"`
	SearchTerms []string `json:"search_terms"`
	KeyPoints   []string `json:"key_points"`
}

type coursePlanResponse struct {
	Sections []plannedSectionResponse `json:"sections"`
}

type plannedSectionResponse struct {
	Title       string                   `json:"title"`
	Description string                   `json:"description"`
	SearchTerms []string                 `json:"search_terms"`
	SourceIDs   []string                 `json:"source_ids"`
	Rationale   string                   `json:"rationale"`
	Lessons     []plannedLessonResponse  `json:"lessons"`
}

type plannedLessonResponse struct {
	Title         string   `json:"title"`
	Description   string   `json:"description"`
	SearchTerms   []string `json:"search_terms"`
	LearningGoals []string `json:"learning_goals"`
}
