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

// TenantKnowledgeSettings contains knowledge/RAG configuration for a tenant.
// Only ADMIN/OWNER roles can access these settings.
type TenantKnowledgeSettings struct {
	ID       uuid.UUID
	TenantID uuid.UUID

	// Allow courses to use global (tenant-wide) knowledge sources
	AllowGlobalKnowledge bool

	// Threshold for low grounding warnings (0.0-1.0)
	LowGroundingThreshold float32

	// Enforce internal data only mode for all courses
	// When true, courses cannot use AI-synthesized content
	EnforceInternalOnly bool

	// Require curriculum map approval before lesson generation
	RequireCurriculumApproval bool

	UpdatedAt       time.Time
	UpdatedByUserID *uuid.UUID
}

// DefaultKnowledgeSettings returns default settings for a tenant.
func DefaultKnowledgeSettings(tenantID uuid.UUID) *TenantKnowledgeSettings {
	return &TenantKnowledgeSettings{
		TenantID:                  tenantID,
		AllowGlobalKnowledge:      true,
		LowGroundingThreshold:     0.6,
		EnforceInternalOnly:       false,
		RequireCurriculumApproval: true,
	}
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

	// Position flags for contextual generation
	IsFirstSection bool
	IsLastSection  bool

	// Section metadata for curriculum alignment
	MappedOutcomeIDs    []string // IDs of learning outcomes this section addresses
	Level               string   // "introduce", "develop", "master"
	Intent              string   // "teach", "assess", "reinforce"
	Emphasis            string   // "low", "medium", "high"
	GroundingScore      float32  // 0.0-1.0, how grounded in knowledge sources
	ContributingChunkIDs []string // RAG chunk IDs that informed this section

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

	// Position flags for contextual generation
	IsFirstInSection bool // First lesson in this section
	IsLastInSection  bool // Last lesson in this section
	IsFirstInCourse  bool // First lesson in entire course
	IsLastInCourse   bool // Last lesson in entire course

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

	// Provenance tracking
	GroundingScore    float32
	SourceCount       int32
	GroundedTokens    int32
	TotalTokens       int32
	AggregateProvenance *LessonProvenance
}

// LessonProvenance aggregates provenance across all components in a lesson.
type LessonProvenance struct {
	GroundingScore   float32
	TeamTokens       int32
	GlobalTokens     int32
	CourseTokens     int32
	UngroundedTokens int32
	TotalTokens      int32
	SourceCount      int32
}

// ComponentProvenance tracks which knowledge sources contributed to a component.
type ComponentProvenance struct {
	SourceChunks       []ProvenanceChunk
	Queries            []string
	TeamTokens         int32
	GlobalTokens       int32
	CourseTokens       int32
	TotalTokens        int32
	GeneratedAt        time.Time
	DominantSourceType string // "internal", "web", "model"
	Paragraphs         []AnnotatedParagraph
	ModelName          string
	GenerationContext  string
}

// AnnotatedParagraph holds a single HTML paragraph with source attribution indices.
type AnnotatedParagraph struct {
	HTML          string
	SourceIndices []int32
}

// ProvenanceChunk represents a knowledge chunk that contributed to generated content.
type ProvenanceChunk struct {
	ChunkID         string
	SourceID        string
	SourceName      string
	Excerpt         string
	SimilarityScore float32
	Scope           string // "course", "team", "global"
	SourceType      string // "internal", "web", "model"
	URL             string // For web sources
	PageTitle       string // For web sources
	TeamID          string // For internal knowledge
	TeamName        string // For internal knowledge
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

	// Provenance tracking
	Provenance *ComponentProvenance

	// User validation
	Validated bool

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
