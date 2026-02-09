package entity

import (
	"time"

	"github.com/google/uuid"
)

// ShareLink represents a course share link for external review.
type ShareLink struct {
	ID            uuid.UUID
	TenantID      uuid.UUID
	CourseID      uuid.UUID
	CreatedBy     uuid.UUID
	Token         string
	AllowedEmails []string
	IsActive      bool
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// VerificationCode represents a share email verification code.
type VerificationCode struct {
	ID          uuid.UUID
	ShareLinkID uuid.UUID
	Email       string
	Code        string
	ExpiresAt   time.Time
	VerifiedAt  *time.Time
	CreatedAt   time.Time
}

// ReviewComment represents a review comment from an external reviewer.
type ReviewComment struct {
	ID            uuid.UUID
	ShareLinkID   uuid.UUID
	CourseID      uuid.UUID
	LessonID      string
	ReviewerEmail string
	Comment       string
	CreatedAt     time.Time
}
