package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// CourseExportRepository provides access to course export data.
type CourseExportRepository interface {
	// Create creates a new export job.
	Create(ctx context.Context, export *entity.CourseExport) error

	// GetByID retrieves an export by ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseExport, error)

	// ListByCourseID retrieves all exports for a course.
	ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.CourseExport, error)

	// UpdateProgress updates the progress of an export.
	UpdateProgress(ctx context.Context, id uuid.UUID, percent int32, message string) error

	// MarkProcessing marks an export as processing.
	MarkProcessing(ctx context.Context, id uuid.UUID, percent int32, message string) error

	// MarkCompleted marks an export as completed with file info.
	MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize int64) error

	// MarkFailed marks an export as failed with error message.
	MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error

	// ClaimPending atomically claims the next pending export for processing.
	ClaimPending(ctx context.Context) (*entity.CourseExport, error)

	// ClaimByID atomically claims a specific export for processing.
	ClaimByID(ctx context.Context, id uuid.UUID) (*entity.CourseExport, error)
}
