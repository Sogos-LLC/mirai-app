package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CourseExport represents a course export job.
type CourseExport struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	CourseID uuid.UUID

	Format  valueobject.ExportFormat
	Status  valueobject.ExportStatus
	Version int32

	// File information (set on completion)
	FilePath      *string
	FileSizeBytes *int64

	// Progress tracking
	ProgressPercent int32
	ProgressMessage *string

	// Error information (set on failure)
	ErrorMessage *string

	CreatedByUserID uuid.UUID
	CreatedAt       time.Time
	StartedAt       *time.Time
	CompletedAt     *time.Time
}

// IsComplete returns true if the export has finished (success or failure).
func (e *CourseExport) IsComplete() bool {
	return e.Status.IsTerminal()
}

// IsActive returns true if the export is still in progress.
func (e *CourseExport) IsActive() bool {
	return e.Status.IsActive()
}

// MarkProcessing updates the export to processing status.
func (e *CourseExport) MarkProcessing() {
	e.Status = valueobject.ExportStatusProcessing
	now := time.Now()
	e.StartedAt = &now
}

// MarkCompleted updates the export to completed status.
func (e *CourseExport) MarkCompleted(filePath string, fileSize int64) {
	e.Status = valueobject.ExportStatusCompleted
	e.FilePath = &filePath
	e.FileSizeBytes = &fileSize
	e.ProgressPercent = 100
	msg := "Export complete"
	e.ProgressMessage = &msg
	now := time.Now()
	e.CompletedAt = &now
}

// MarkFailed updates the export to failed status.
func (e *CourseExport) MarkFailed(errMsg string) {
	e.Status = valueobject.ExportStatusFailed
	e.ErrorMessage = &errMsg
	now := time.Now()
	e.CompletedAt = &now
}

// UpdateProgress updates the progress percentage and message.
func (e *CourseExport) UpdateProgress(percent int32, message string) {
	e.ProgressPercent = percent
	e.ProgressMessage = &message
}
