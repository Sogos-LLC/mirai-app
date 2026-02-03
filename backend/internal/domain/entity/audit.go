package entity

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// AuditAction represents the type of auditable action.
type AuditAction string

const (
	AuditActionOutlineApproved     AuditAction = "outline_approved"
	AuditActionOutlineRejected     AuditAction = "outline_rejected"
	AuditActionCurriculumApproved  AuditAction = "curriculum_approved"
	AuditActionCurriculumOverride  AuditAction = "curriculum_override"
	AuditActionLessonsGenerated    AuditAction = "lessons_generated"
	AuditActionKnowledgeLocked     AuditAction = "knowledge_locked"
	AuditActionCourseExported      AuditAction = "course_exported"
)

// String returns the string representation of the audit action.
func (a AuditAction) String() string {
	return string(a)
}

// CourseAuditLogEntry represents an entry in the course audit log.
type CourseAuditLogEntry struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	CourseID  uuid.UUID
	Action    AuditAction
	ActorID   uuid.UUID
	Metadata  json.RawMessage
	CreatedAt time.Time
}

// OutlineApprovedMetadata contains metadata for outline approval.
type OutlineApprovedMetadata struct {
	SectionCount int `json:"section_count"`
	LessonCount  int `json:"lesson_count"`
	Version      int `json:"version"`
}

// CurriculumApprovedMetadata contains metadata for curriculum approval.
type CurriculumApprovedMetadata struct {
	WarningsAcknowledged bool    `json:"warnings_acknowledged"`
	WarningCount         int     `json:"warning_count"`
	ErrorCount           int     `json:"error_count"`
	GroundingScore       float32 `json:"grounding_score"`
}

// LessonsGeneratedMetadata contains metadata for lesson generation.
type LessonsGeneratedMetadata struct {
	TotalLessons   int   `json:"total_lessons"`
	TotalTokens    int64 `json:"total_tokens"`
	ParentJobID    string `json:"parent_job_id"`
}

// KnowledgeLockedMetadata contains metadata for knowledge locking.
type KnowledgeLockedMetadata struct {
	TeamSourceCount   int `json:"team_source_count"`
	GlobalSourceCount int `json:"global_source_count"`
	TotalTokens       int64 `json:"total_tokens"`
}
