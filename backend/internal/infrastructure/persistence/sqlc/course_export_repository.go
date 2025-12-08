package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CourseExportRepository implements repository.CourseExportRepository using sqlc-generated code.
type CourseExportRepository struct {
	db *sql.DB
}

// NewCourseExportRepository creates a new sqlc-based course export repository.
func NewCourseExportRepository(db *sql.DB) repository.CourseExportRepository {
	return &CourseExportRepository{db: db}
}

// Create creates a new export job.
func (r *CourseExportRepository) Create(ctx context.Context, export *entity.CourseExport) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseExport, error) {
		return q.CreateCourseExport(ctx, gen.CreateCourseExportParams{
			TenantID:        export.TenantID,
			CourseID:        export.CourseID,
			Format:          toExportFormat(export.Format.String()),
			CreatedByUserID: export.CreatedByUserID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create course export: %w", err)
	}

	export.ID = result.ID
	export.Status = valueobject.ExportStatusPending
	export.Version = result.Version
	export.CreatedAt = result.CreatedAt
	return nil
}

// GetByID retrieves an export by ID.
func (r *CourseExportRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseExport, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseExport, error) {
		return q.GetCourseExportByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get course export: %w", err)
	}
	return toCourseExportEntity(&result), nil
}

// ListByCourseID retrieves all exports for a course.
func (r *CourseExportRepository) ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.CourseExport, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.CourseExport, error) {
		return q.ListCourseExportsByCourseID(ctx, courseID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list course exports: %w", err)
	}

	exports := make([]*entity.CourseExport, len(results))
	for i := range results {
		exports[i] = toCourseExportEntity(&results[i])
	}
	return exports, nil
}

// UpdateProgress updates the progress of an export.
func (r *CourseExportRepository) UpdateProgress(ctx context.Context, id uuid.UUID, percent int32, message string) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCourseExportProgress(ctx, gen.UpdateCourseExportProgressParams{
			ProgressPercent: percent,
			ProgressMessage: stringToNullString(message),
			ID:              id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update export progress: %w", err)
	}
	return nil
}

// MarkProcessing marks an export as processing.
func (r *CourseExportRepository) MarkProcessing(ctx context.Context, id uuid.UUID, percent int32, message string) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCourseExportProcessing(ctx, gen.UpdateCourseExportProcessingParams{
			ProgressPercent: percent,
			ProgressMessage: stringToNullString(message),
			ID:              id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to mark export processing: %w", err)
	}
	return nil
}

// MarkCompleted marks an export as completed with file info.
func (r *CourseExportRepository) MarkCompleted(ctx context.Context, id uuid.UUID, filePath string, fileSize int64) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCourseExportComplete(ctx, gen.UpdateCourseExportCompleteParams{
			FilePath:      sql.NullString{String: filePath, Valid: true},
			FileSizeBytes: sql.NullInt64{Int64: fileSize, Valid: true},
			ID:            id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to mark export completed: %w", err)
	}
	return nil
}

// MarkFailed marks an export as failed with error message.
func (r *CourseExportRepository) MarkFailed(ctx context.Context, id uuid.UUID, errMsg string) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCourseExportFailed(ctx, gen.UpdateCourseExportFailedParams{
			ErrorMessage: sql.NullString{String: errMsg, Valid: true},
			ID:           id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to mark export failed: %w", err)
	}
	return nil
}

// ClaimPending atomically claims the next pending export for processing.
func (r *CourseExportRepository) ClaimPending(ctx context.Context) (*entity.CourseExport, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseExport, error) {
		return q.ClaimPendingExport(ctx)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to claim pending export: %w", err)
	}
	return toCourseExportEntity(&result), nil
}

// ClaimByID atomically claims a specific export for processing.
func (r *CourseExportRepository) ClaimByID(ctx context.Context, id uuid.UUID) (*entity.CourseExport, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseExport, error) {
		return q.ClaimExportByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to claim export by ID: %w", err)
	}
	return toCourseExportEntity(&result), nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

// toExportFormat converts a string to gen.ExportFormat.
func toExportFormat(s string) gen.ExportFormat {
	return gen.ExportFormat(s)
}

// toCourseExportEntity converts a sqlc-generated CourseExport to domain entity.
func toCourseExportEntity(e *gen.CourseExport) *entity.CourseExport {
	format, _ := valueobject.ParseExportFormat(string(e.Format))
	status, _ := valueobject.ParseExportStatus(string(e.Status))

	return &entity.CourseExport{
		ID:              e.ID,
		TenantID:        e.TenantID,
		CourseID:        e.CourseID,
		Format:          format,
		Status:          status,
		Version:         e.Version,
		FilePath:        fromNullStringPtr(e.FilePath),
		FileSizeBytes:   fromNullInt64Ptr(e.FileSizeBytes),
		ProgressPercent: e.ProgressPercent,
		ProgressMessage: fromNullStringPtr(e.ProgressMessage),
		ErrorMessage:    fromNullStringPtr(e.ErrorMessage),
		CreatedByUserID: e.CreatedByUserID,
		CreatedAt:       e.CreatedAt,
		StartedAt:       fromDoublePointerTime(e.StartedAt),
		CompletedAt:     fromDoublePointerTime(e.CompletedAt),
	}
}
