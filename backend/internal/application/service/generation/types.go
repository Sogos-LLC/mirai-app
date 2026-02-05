package generation

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/application/service/content"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// Type aliases for backward-compatible access within the generation package.
// These point to the canonical definitions in the content package.
type S3CourseContent = content.S3CourseContent
type WizardData = content.WizardData
type SMEPersona = content.SMEPersona
type AudiencePersona = content.AudiencePersona
type ToneOption = content.ToneOption
type CourseContent = content.CourseContent
type CourseSettings = content.CourseSettings
type CurriculumMap = content.CurriculumMap
type CoursePlan = content.CoursePlan
type DocumentAnalysis = content.DocumentAnalysis
type SectionHint = content.SectionHint
type PlannedSection = content.PlannedSection
type PlannedLesson = content.PlannedLesson
type GeneratedLesson = content.GeneratedLesson
type LessonComponent = content.LessonComponent
type ProvenanceChunk = content.ProvenanceChunk
type ComponentProvenance = content.ComponentProvenance
type LessonProvenance = content.LessonProvenance
type OutlineProvenance = content.OutlineProvenance
type CurriculumRow = content.CurriculumRow
type CurriculumCell = content.CurriculumCell
type CurriculumValidationIssue = content.CurriculumValidationIssue

// Re-export content package functions used by generation handlers.
var FindLesson = content.FindLesson
var UpsertLesson = content.UpsertLesson

// AIProviderFactory creates AIProvider instances per-tenant.
type AIProviderFactory interface {
	GetProvider(ctx context.Context, tenantID uuid.UUID) (service.AIProvider, error)
}

// ContentStorage provides read/write access to course content in object storage.
type ContentStorage interface {
	ReadCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}) error
	WriteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}) error
	UpdateCourseContentAtomic(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}, updateFn func() error) error
}

// KnowledgeSearcher provides RAG search capabilities for internal data only mode.
type KnowledgeSearcher interface {
	SearchKnowledge(ctx context.Context, courseID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error)
}

// TeamKnowledgeSearcher provides RAG search capabilities for team-level knowledge.
type TeamKnowledgeSearcher interface {
	SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)
}

// TeamResolver resolves the team for a tenant.
type TeamResolver interface {
	GetTeamByTenant(ctx context.Context, tenantID uuid.UUID) (*entity.Team, error)
}

// OutlineNotifier sends notifications when outline generation completes.
type OutlineNotifier interface {
	NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error
	NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// CourseCompletionNotifier sends notifications when full course generation completes.
type CourseCompletionNotifier interface {
	NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error
	NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// AISettingsRepository provides AI settings operations.
type AISettingsRepository interface {
	IncrementTokenUsage(ctx context.Context, tenantID uuid.UUID, tokens int64) error
}

// ComponentRegenInput stores inputs for component regeneration job.
type ComponentRegenInput struct {
	CourseID             string   `json:"courseId"`
	LessonID             string   `json:"lessonId"`
	ComponentID          string   `json:"componentId"`
	ModificationPrompt   string   `json:"modificationPrompt"`
	PersonaIDs           []string `json:"personaIds,omitempty"`
	LearningObjectiveIDs []string `json:"learningObjectiveIds,omitempty"`
}

// parseDesiredOutcomes extracts individual learning outcomes from course content.
// It parses the multi-line desired outcomes from wizard data, falling back to
// the single desired outcome from settings if needed.
func parseDesiredOutcomes(c *S3CourseContent) []string {
	var outcomes []string

	rawOutcomes := ""
	if c.WizardData != nil {
		rawOutcomes = c.WizardData.DesiredOutcomes
	}
	if rawOutcomes == "" {
		rawOutcomes = c.Settings.DesiredOutcome
	}
	if rawOutcomes == "" {
		return outcomes
	}

	lines := strings.Split(rawOutcomes, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "-")
		line = strings.TrimPrefix(line, "•")
		line = strings.TrimPrefix(line, "*")
		// Handle numbered list items like "1. " or "1) "
		for i, ch := range line {
			if ch >= '0' && ch <= '9' {
				continue
			}
			if (ch == '.' || ch == ')') && i > 0 {
				line = line[i+1:]
			}
			break
		}
		line = strings.TrimSpace(line)
		if line != "" {
			outcomes = append(outcomes, line)
		}
	}

	return outcomes
}
