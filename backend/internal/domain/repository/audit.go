package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// CourseAuditLogRepository defines the interface for course audit log data access.
type CourseAuditLogRepository interface {
	// Create creates a new audit log entry.
	Create(ctx context.Context, entry *entity.CourseAuditLogEntry) error

	// ListByCourse retrieves audit log entries for a course.
	ListByCourse(ctx context.Context, courseID uuid.UUID, limit, offset int) ([]*entity.CourseAuditLogEntry, error)

	// ListByActor retrieves audit log entries by actor.
	ListByActor(ctx context.Context, actorID uuid.UUID, limit, offset int) ([]*entity.CourseAuditLogEntry, error)

	// GetByID retrieves a single audit log entry.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseAuditLogEntry, error)

	// CountByCourse returns the count of audit entries for a course.
	CountByCourse(ctx context.Context, courseID uuid.UUID) (int64, error)
}
