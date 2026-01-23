package sqlc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/sqlc-dev/pqtype"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeSourceRepository implements repository.KnowledgeSourceRepository.
type KnowledgeSourceRepository struct {
	db *sql.DB
}

// NewKnowledgeSourceRepository creates a new sqlc-based knowledge source repository.
func NewKnowledgeSourceRepository(db *sql.DB) repository.KnowledgeSourceRepository {
	return &KnowledgeSourceRepository{db: db}
}

// Create creates a new knowledge source.
func (r *KnowledgeSourceRepository) Create(ctx context.Context, source *entity.KnowledgeSource) error {
	if source.ID == uuid.Nil {
		source.ID = uuid.New()
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.CreateKnowledgeSource(ctx, gen.CreateKnowledgeSourceParams{
			ID:            source.ID,
			TenantID:      source.TenantID,
			CourseID:      source.CourseID,
			Type:          toKnowledgeSourceType(source.Type.String()),
			Status:        toKnowledgeSourceStatus(source.Status.String()),
			Name:          source.Name,
			FilePath:      toNullString(source.FilePath),
			MimeType:      toNullString(source.MimeType),
			FileSizeBytes: toNullInt64(source.FileSizeBytes),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create knowledge source: %w", err)
	}

	source.CreatedAt = result.CreatedAt
	source.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a knowledge source by ID.
func (r *KnowledgeSourceRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.GetKnowledgeSourceByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get knowledge source: %w", err)
	}
	return toKnowledgeSourceEntity(&result), nil
}

// ListByCourse retrieves all knowledge sources for a course.
func (r *KnowledgeSourceRepository) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListKnowledgeSourcesByCourse(ctx, courseID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list knowledge sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	return sources, nil
}

// GetReadyByCourse retrieves ready sources for a course.
func (r *KnowledgeSourceRepository) GetReadyByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.GetReadySourcesByCourse(ctx, courseID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get ready sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	return sources, nil
}

// ListPending retrieves pending sources for processing.
func (r *KnowledgeSourceRepository) ListPending(ctx context.Context, limit int32) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListPendingKnowledgeSources(ctx, limit)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pending sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	return sources, nil
}

// UpdateStatus updates the processing status of a source.
func (r *KnowledgeSourceRepository) UpdateStatus(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
) (*entity.KnowledgeSource, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.UpdateKnowledgeSourceStatus(ctx, gen.UpdateKnowledgeSourceStatusParams{
			ID:           id,
			Status:       toKnowledgeSourceStatus(status.String()),
			ErrorMessage: toNullString(errorMsg),
			ChunkCount:   sql.NullInt32{Int32: chunkCount, Valid: true},
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update status: %w", err)
	}
	return toKnowledgeSourceEntity(&result), nil
}

// UpdateVideoURLs updates the detected video URLs.
func (r *KnowledgeSourceRepository) UpdateVideoURLs(ctx context.Context, id uuid.UUID, urls []string) (*entity.KnowledgeSource, error) {
	jsonBytes, err := json.Marshal(urls)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal video urls: %w", err)
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.UpdateKnowledgeSourceVideoURLs(ctx, gen.UpdateKnowledgeSourceVideoURLsParams{
			ID:        id,
			VideoUrls: pqtype.NullRawMessage{RawMessage: jsonBytes, Valid: true},
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update video urls: %w", err)
	}
	return toKnowledgeSourceEntity(&result), nil
}

// Delete deletes a knowledge source.
func (r *KnowledgeSourceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteKnowledgeSource(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge source: %w", err)
	}
	return nil
}

// DeleteByCourse deletes all knowledge sources for a course.
func (r *KnowledgeSourceRepository) DeleteByCourse(ctx context.Context, courseID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteKnowledgeSourcesByCourse(ctx, courseID)
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge sources: %w", err)
	}
	return nil
}

// CountByCourse returns the count of sources for a course.
func (r *KnowledgeSourceRepository) CountByCourse(ctx context.Context, courseID uuid.UUID) (int32, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountKnowledgeSourcesByCourse(ctx, courseID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count knowledge sources: %w", err)
	}
	return count, nil
}

// toKnowledgeSourceEntity converts a gen.KnowledgeSource to entity.KnowledgeSource.
func toKnowledgeSourceEntity(ks *gen.KnowledgeSource) *entity.KnowledgeSource {
	sourceType, _ := valueobject.ParseKnowledgeSourceType(string(ks.Type))
	status, _ := valueobject.ParseKnowledgeSourceStatus(string(ks.Status))

	var videoURLs []string
	if ks.VideoUrls.Valid && len(ks.VideoUrls.RawMessage) > 0 {
		_ = json.Unmarshal(ks.VideoUrls.RawMessage, &videoURLs)
	}

	return &entity.KnowledgeSource{
		ID:            ks.ID,
		TenantID:      ks.TenantID,
		CourseID:      ks.CourseID,
		Type:          sourceType,
		Status:        status,
		Name:          ks.Name,
		FilePath:      fromNullStringPtr(ks.FilePath),
		MimeType:      fromNullStringPtr(ks.MimeType),
		FileSizeBytes: fromNullInt64Ptr(ks.FileSizeBytes),
		ChunkCount:    fromNullInt32(ks.ChunkCount),
		ErrorMessage:  fromNullStringPtr(ks.ErrorMessage),
		VideoURLs:     videoURLs,
		CreatedAt:     ks.CreatedAt,
		UpdatedAt:     ks.UpdatedAt,
		ProcessedAt:   fromDoublePointerTime(ks.ProcessedAt),
	}
}
