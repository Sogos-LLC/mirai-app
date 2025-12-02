package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SubjectMatterExpert represents a knowledge source entity.
type SubjectMatterExpert struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	CompanyID uuid.UUID

	Name        string
	Description string
	Domain      string // Knowledge domain (e.g., "Sales Training")

	Scope   valueobject.SMEScope
	TeamIDs []uuid.UUID // If scope is team, which teams have access

	Status valueobject.SMEStatus

	// Distilled knowledge storage
	KnowledgeSummary     *string // AI-generated summary
	KnowledgeContentPath *string // S3 path to full distilled knowledge JSON

	CreatedByUserID uuid.UUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// SMETeamAccess represents team access for team-scoped SMEs.
type SMETeamAccess struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	SMEID     uuid.UUID
	TeamID    uuid.UUID
	CreatedAt time.Time
}

// SMETask represents a delegated task for content submission.
type SMETask struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	SMEID    uuid.UUID

	Title               string
	Description         string
	ExpectedContentType *valueobject.ContentType // Hint for what to upload

	// Assignment
	AssignedToUserID uuid.UUID
	AssignedByUserID uuid.UUID
	TeamID           *uuid.UUID // Team context

	Status valueobject.SMETaskStatus

	// Deadline
	DueDate *time.Time

	CreatedAt   time.Time
	UpdatedAt   time.Time
	CompletedAt *time.Time
}

// SMETaskSubmission represents uploaded content for a task.
type SMETaskSubmission struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	TaskID   uuid.UUID

	FileName      string
	FilePath      string // S3 path
	ContentType   valueobject.ContentType
	FileSizeBytes int64

	// Ingestion results
	ExtractedText  *string // Raw extracted text
	AISummary      *string // Gemini-generated summary
	IngestionError *string // Error if failed

	SubmittedByUserID uuid.UUID
	SubmittedAt       time.Time
	ProcessedAt       *time.Time

	// Approval workflow
	ReviewerNotes    *string    // Feedback from reviewer
	ApprovedContent  *string    // Final approved text (may differ from original)
	IsApproved       bool       // Whether submission is approved
	ApprovedAt       *time.Time // When approval occurred
	ApprovedByUserID *uuid.UUID // Who approved the submission
}

// SMEKnowledgeChunk represents a unit of distilled knowledge.
type SMEKnowledgeChunk struct {
	ID           uuid.UUID
	TenantID     uuid.UUID
	SMEID        uuid.UUID
	SubmissionID *uuid.UUID // Source submission (if from task)

	Content        string   // The knowledge text
	Topic          string   // Categorized topic
	Keywords       []string // Extracted keywords
	RelevanceScore float32  // For ranking in generation

	CreatedAt time.Time
}

// SMEListOptions provides filtering options for listing SMEs.
type SMEListOptions struct {
	Scope           *valueobject.SMEScope
	Status          *valueobject.SMEStatus
	TeamID          *uuid.UUID // Filter by team access
	IncludeArchived bool       // Include archived SMEs in results
}

// SMETaskListOptions provides filtering options for listing tasks.
type SMETaskListOptions struct {
	SMEID            *uuid.UUID
	AssignedToUserID *uuid.UUID
	Status           *valueobject.SMETaskStatus
}
