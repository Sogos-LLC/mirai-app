package entity

import (
	"time"

	"github.com/google/uuid"
)

// CourseStatus represents the status of a course.
type CourseStatus string

const (
	CourseStatusDraft     CourseStatus = "DRAFT"
	CourseStatusPublished CourseStatus = "PUBLISHED"
	CourseStatusGenerated CourseStatus = "GENERATED"
)

// String returns the string representation of the course status.
func (s CourseStatus) String() string {
	return string(s)
}

// ParseCourseStatus parses a string into a CourseStatus.
func ParseCourseStatus(s string) CourseStatus {
	switch s {
	case "DRAFT":
		return CourseStatusDraft
	case "PUBLISHED":
		return CourseStatusPublished
	case "GENERATED":
		return CourseStatusGenerated
	default:
		return CourseStatusDraft
	}
}

// Course represents course metadata stored in PostgreSQL.
// The actual course content (sections, lessons, blocks) is stored in S3.
type Course struct {
	ID              uuid.UUID
	TenantID        uuid.UUID  // Tenant for RLS isolation
	CompanyID       uuid.UUID  // Company that owns this course
	CreatedByUserID uuid.UUID  // User who created the course
	TeamID          *uuid.UUID // Optional team assignment

	// Metadata
	Title         string
	Status        CourseStatus
	Version       int32
	FolderID      *uuid.UUID
	CategoryTags  []string
	ThumbnailPath *string

	// S3 reference
	ContentPath string // Path to content JSON in S3, e.g., "tenants/{tenant_id}/courses/{id}/content.json"

	// Timestamps
	CreatedAt time.Time
	UpdatedAt time.Time
}

// CourseListOptions provides filtering options for listing courses.
type CourseListOptions struct {
	Status   *CourseStatus
	FolderID *uuid.UUID
	Tags     []string
	Limit    int
	Offset   int
}
