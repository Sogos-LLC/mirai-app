package entity

import (
	"time"

	"github.com/google/uuid"
)

// KnowledgeGapTask represents a task assigned to an SME to fill a knowledge gap.
type KnowledgeGapTask struct {
	ID                uuid.UUID
	TenantID          uuid.UUID
	CourseID          uuid.UUID
	GapDescription    string
	AssignedToUserID  uuid.UUID
	AssignedByUserID  uuid.UUID
	TargetTeamID      *uuid.UUID
	Status            string
	KnowledgeSourceID *uuid.UUID
	CreatedAt         time.Time
	UpdatedAt         time.Time
	CompletedAt       *time.Time

	// Populated at read time from Kratos identity
	AssignedToName  string
	AssignedToEmail string
}
