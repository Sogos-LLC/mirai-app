package entity

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TenantAISettings contains AI configuration for a tenant.
// Only ADMIN/OWNER roles can access these settings.
type TenantAISettings struct {
	ID       uuid.UUID
	TenantID uuid.UUID

	Provider valueobject.AIProvider

	// Encrypted API key (AES-256-GCM)
	// Stored as: nonce (12 bytes) || ciphertext || auth tag (16 bytes)
	EncryptedAPIKey []byte

	// Usage tracking
	TotalTokensUsed   int64
	MonthlyTokenLimit *int64

	UpdatedAt       time.Time
	UpdatedByUserID *uuid.UUID
}

// HasAPIKey returns true if an API key is configured.
func (s *TenantAISettings) HasAPIKey() bool {
	return len(s.EncryptedAPIKey) > 0
}

// GenerationJob represents an AI generation job.
type GenerationJob struct {
	ID       uuid.UUID
	TenantID uuid.UUID

	Type   valueobject.GenerationJobType
	Status valueobject.GenerationJobStatus

	// References based on job type
	CourseID        *uuid.UUID
	LessonID        *uuid.UUID // References generated_lessons (set after generation)
	OutlineLessonID *uuid.UUID // References outline_lessons (set before generation)
	SMETaskID       *uuid.UUID
	SubmissionID    *uuid.UUID

	// Parent job ID - links child lesson jobs to parent full_course job
	ParentJobID *uuid.UUID

	// Progress tracking
	ProgressPercent int32
	ProgressMessage *string

	// Results
	ResultPath   *string // S3 path to result JSON
	ErrorMessage *string

	// Token usage for billing
	TokensUsed int64

	// Retry tracking
	RetryCount int32
	MaxRetries int32

	CreatedByUserID uuid.UUID
	CreatedAt       time.Time
	StartedAt       *time.Time
	CompletedAt     *time.Time
}

// GenerationJobListOptions provides filtering options for listing jobs.
type GenerationJobListOptions struct {
	Type     *valueobject.GenerationJobType
	Status   *valueobject.GenerationJobStatus
	CourseID *uuid.UUID
}

// CourseOutline represents the generated course structure.
type CourseOutline struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	CourseID uuid.UUID

	Version int32

	Sections []OutlineSection // Loaded separately or populated

	ApprovalStatus   valueobject.OutlineApprovalStatus
	RejectionReason  *string

	GeneratedAt      time.Time
	ApprovedAt       *time.Time
	ApprovedByUserID *uuid.UUID
}

// OutlineSection represents a section in the outline.
type OutlineSection struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	OutlineID uuid.UUID

	Title       string
	Description string
	Position    int32

	Lessons []OutlineLesson // Loaded separately or populated

	CreatedAt time.Time
}

// OutlineLesson represents a lesson in the outline.
type OutlineLesson struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	SectionID uuid.UUID

	Title                    string
	Description              string
	Position                 int32
	EstimatedDurationMinutes *int32
	LearningObjectives       []string

	// Flags for segue generation
	IsLastInSection bool
	IsLastInCourse  bool

	CreatedAt time.Time
}

// GeneratedLesson contains full lesson content.
type GeneratedLesson struct {
	ID              uuid.UUID
	TenantID        uuid.UUID
	CourseID        uuid.UUID
	SectionID       uuid.UUID
	OutlineLessonID uuid.UUID

	Title string

	Components []LessonComponent // Loaded separately or populated

	SegueText *string // Transition to next lesson

	GeneratedAt time.Time
}

// LessonComponent represents a content component in a lesson.
type LessonComponent struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	LessonID uuid.UUID

	Type     valueobject.LessonComponentType
	Position int32

	// Type-specific content stored as JSON
	ContentJSON json.RawMessage

	// Alignment metadata
	SMEChunkIDs          []uuid.UUID
	LearningObjectiveIDs []string

	CreatedAt time.Time
	UpdatedAt time.Time
}

// CourseGenerationInput captures inputs for AI course generation.
type CourseGenerationInput struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	CourseID uuid.UUID

	// SMEs to use as knowledge sources
	SMEIDs []uuid.UUID

	// Target audience templates
	TargetAudienceIDs []uuid.UUID

	// What learners should achieve
	DesiredOutcome string

	// Extra context/instructions
	AdditionalContext *string

	CreatedAt time.Time
	UpdatedAt time.Time
}

// TextContent for text components.
type TextContent struct {
	HTML      string `json:"html"`
	Plaintext string `json:"plaintext"`
}

// HeadingContent for heading components.
type HeadingContent struct {
	Level valueobject.HeadingLevel `json:"level"`
	Text  string                   `json:"text"`
}

// ImageContent for image components.
type ImageContent struct {
	URL     string  `json:"url"`
	AltText string  `json:"alt_text"`
	Caption *string `json:"caption,omitempty"`
}

// QuizContent for quiz/knowledge check components.
type QuizContent struct {
	Question          string       `json:"question"`
	QuestionType      string       `json:"question_type"` // multiple_choice, true_false
	Options           []QuizOption `json:"options"`
	CorrectAnswerID   string       `json:"correct_answer_id"`
	Explanation       string       `json:"explanation"`
	CorrectFeedback   *string      `json:"correct_feedback,omitempty"`
	IncorrectFeedback *string      `json:"incorrect_feedback,omitempty"`
}

// QuizOption represents an answer option.
type QuizOption struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}
