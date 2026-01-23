package gemini

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"

	"golang.org/x/sync/errgroup"
	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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
