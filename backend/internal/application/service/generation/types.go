package generation

import (
	"context"
	"encoding/json"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

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

// WizardData stores wizard selections for AI context and realignment.
type WizardData struct {
	SMEPersonas          []SMEPersona      `json:"smePersonas"`
	SelectedSMEIDs       []string          `json:"selectedSmeIds"`
	AudiencePersonas     []AudiencePersona `json:"audiencePersonas"`
	SelectedAudienceIDs  []string          `json:"selectedAudienceIds"`
	SelectedTone         *ToneOption       `json:"selectedTone,omitempty"`
	AdditionalContext    string            `json:"additionalContext"`
	DesiredOutcomes      string            `json:"desiredOutcomes"`
	InternalDataOnly     bool              `json:"internalDataOnly"`
	SelectedTeamDocIDs   []string          `json:"selectedTeamDocIds,omitempty"`
	SelectedGlobalDocIDs []string          `json:"selectedGlobalDocIds,omitempty"`
}

// SMEPersona represents an SME (Subject Matter Expert) persona.
type SMEPersona struct {
	ID          string   `json:"id"`
	JobTitle    string   `json:"jobTitle"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Voice       string   `json:"voice"`
}

// AudiencePersona represents an audience persona.
type AudiencePersona struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Role        string   `json:"role"`
	Description string   `json:"description"`
	Goals       []string `json:"goals"`
}

// ToneOption represents the selected tone/style for the course.
type ToneOption struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Description   string `json:"description"`
	LevelOfDetail string `json:"levelOfDetail"`
}

// CourseContent represents the course content structure.
type CourseContent struct {
	Sections []map[string]any `json:"sections"`
}

// CourseSettings represents the course settings.
type CourseSettings struct {
	Title          string `json:"title"`
	DesiredOutcome string `json:"desiredOutcome"`
}

// CurriculumMap represents the curriculum coverage matrix.
type CurriculumMap struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

// S3CourseContent represents the full course content stored in object storage.
type S3CourseContent struct {
	Settings           CourseSettings      `json:"settings"`
	WizardData         *WizardData         `json:"wizardData,omitempty"`
	Personas           []map[string]any    `json:"personas"`
	LearningObjectives []map[string]any    `json:"learningObjectives"`
	AssessmentSettings map[string]any      `json:"assessmentSettings"`
	Content            CourseContent       `json:"content"`
	Exports            []map[string]any    `json:"exports,omitempty"`
	GeneratedLessons   []GeneratedLesson   `json:"generatedLessons,omitempty"`
	CurriculumMap      *CurriculumMap      `json:"curriculumMap,omitempty"`
	OutlineProvenance  *OutlineProvenance  `json:"outlineProvenance,omitempty"`
}

// GeneratedLesson represents a generated lesson stored in content.json.
type GeneratedLesson struct {
	ID                  string            `json:"id"`
	SectionID           string            `json:"sectionId"`
	OutlineLessonID     string            `json:"outlineLessonId"`
	Title               string            `json:"title"`
	SegueText           *string           `json:"segueText,omitempty"`
	Components          []LessonComponent `json:"components"`
	GeneratedAt         time.Time         `json:"generatedAt"`
	AggregateProvenance *LessonProvenance `json:"aggregateProvenance,omitempty"`
}

// LessonComponent represents a lesson component stored in content.json.
type LessonComponent struct {
	ID                   string               `json:"id"`
	Type                 string               `json:"type"`
	Order                int32                `json:"order"`
	ContentJSON          json.RawMessage      `json:"contentJson"`
	LearningObjectiveIDs []string             `json:"learningObjectiveIds,omitempty"`
	CreatedAt            time.Time            `json:"createdAt"`
	UpdatedAt            time.Time            `json:"updatedAt"`
	Provenance           *ComponentProvenance `json:"provenance,omitempty"`
}

// ProvenanceChunk represents a knowledge chunk that contributed to generated content.
type ProvenanceChunk struct {
	ChunkID         string  `json:"chunkId"`
	SourceID        string  `json:"sourceId"`
	SourceName      string  `json:"sourceName"`
	Excerpt         string  `json:"excerpt"`
	SimilarityScore float32 `json:"similarityScore"`
	Scope           string  `json:"scope"`
}

// ComponentProvenance tracks which knowledge sources contributed to a component.
type ComponentProvenance struct {
	SourceChunks []ProvenanceChunk `json:"sourceChunks"`
	Queries      []string          `json:"queries,omitempty"`
	TeamTokens   int32             `json:"teamTokens"`
	GlobalTokens int32             `json:"globalTokens"`
	CourseTokens int32             `json:"courseTokens"`
	TotalTokens  int32             `json:"totalTokens"`
	GeneratedAt  time.Time         `json:"generatedAt"`
}

// LessonProvenance aggregates provenance across all components in a lesson.
type LessonProvenance struct {
	GroundingScore   float32 `json:"groundingScore"`
	TeamTokens       int32   `json:"teamTokens"`
	GlobalTokens     int32   `json:"globalTokens"`
	CourseTokens     int32   `json:"courseTokens"`
	UngroundedTokens int32   `json:"ungroundedTokens"`
	TotalTokens      int32   `json:"totalTokens"`
	SourceCount      int32   `json:"sourceCount"`
}

// OutlineProvenance tracks aggregate knowledge source attribution for outline generation.
type OutlineProvenance struct {
	TotalSources       int       `json:"totalSources"`
	TotalChunks        int       `json:"totalChunks"`
	TeamTokens         int32     `json:"teamTokens"`
	GlobalTokens       int32     `json:"globalTokens"`
	CourseTokens       int32     `json:"courseTokens"`
	GroundingScore     float32   `json:"groundingScore"`
	ConstraintsApplied bool      `json:"constraintsApplied"`
	ConstraintsMet     bool      `json:"constraintsMet"`
	GeneratedAt        time.Time `json:"generatedAt"`
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

// FindLesson finds a generated lesson by ID.
func FindLesson(content *S3CourseContent, lessonID string) *GeneratedLesson {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonID {
			return &content.GeneratedLessons[i]
		}
	}
	return nil
}

// UpsertLesson adds or updates a lesson in the content.
func UpsertLesson(content *S3CourseContent, lesson GeneratedLesson) {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lesson.ID {
			content.GeneratedLessons[i] = lesson
			return
		}
	}
	content.GeneratedLessons = append(content.GeneratedLessons, lesson)
}
