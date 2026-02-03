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

	// Convert CourseID pointer to NullUUID
	var courseID uuid.NullUUID
	if source.CourseID != nil {
		courseID = uuid.NullUUID{UUID: *source.CourseID, Valid: true}
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.CreateKnowledgeSource(ctx, gen.CreateKnowledgeSourceParams{
			ID:            source.ID,
			TenantID:      source.TenantID,
			CourseID:      courseID,
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

// CreateWithSession creates a knowledge source with session_id (pre-course wizard flow).
func (r *KnowledgeSourceRepository) CreateWithSession(ctx context.Context, source *entity.KnowledgeSource) error {
	if source.ID == uuid.Nil {
		source.ID = uuid.New()
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.CreateKnowledgeSourceWithSession(ctx, gen.CreateKnowledgeSourceWithSessionParams{
			ID:            source.ID,
			TenantID:      source.TenantID,
			SessionID:     toNullString(source.SessionID),
			Type:          toKnowledgeSourceType(source.Type.String()),
			Status:        toKnowledgeSourceStatus(source.Status.String()),
			Name:          source.Name,
			FilePath:      toNullString(source.FilePath),
			MimeType:      toNullString(source.MimeType),
			FileSizeBytes: toNullInt64(source.FileSizeBytes),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create knowledge source with session: %w", err)
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
		return q.ListKnowledgeSourcesByCourse(ctx, uuid.NullUUID{UUID: courseID, Valid: true})
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

// ListBySession retrieves all knowledge sources for a session.
func (r *KnowledgeSourceRepository) ListBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListKnowledgeSourcesBySession(ctx, sql.NullString{String: sessionID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list knowledge sources by session: %w", err)
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
		return q.GetReadySourcesByCourse(ctx, uuid.NullUUID{UUID: courseID, Valid: true})
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

// GetReadyBySession retrieves ready sources for a session.
func (r *KnowledgeSourceRepository) GetReadyBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.GetReadySourcesBySession(ctx, sql.NullString{String: sessionID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get ready sources by session: %w", err)
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

// UpdateStatusWithSummary updates status with RAG-generated summary.
func (r *KnowledgeSourceRepository) UpdateStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.UpdateKnowledgeSourceWithSummary(ctx, gen.UpdateKnowledgeSourceWithSummaryParams{
			ID:           id,
			Status:       toKnowledgeSourceStatus(status.String()),
			ErrorMessage: toNullString(errorMsg),
			ChunkCount:   sql.NullInt32{Int32: chunkCount, Valid: true},
			Summary:      sql.NullString{String: summary, Valid: summary != ""},
			TokenCount:   sql.NullInt32{Int32: tokenCount, Valid: true},
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update status with summary: %w", err)
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
		return q.DeleteKnowledgeSourcesByCourse(ctx, uuid.NullUUID{UUID: courseID, Valid: true})
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge sources: %w", err)
	}
	return nil
}

// CountByCourse returns the count of sources for a course.
func (r *KnowledgeSourceRepository) CountByCourse(ctx context.Context, courseID uuid.UUID) (int32, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountKnowledgeSourcesByCourse(ctx, uuid.NullUUID{UUID: courseID, Valid: true})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count knowledge sources: %w", err)
	}
	return count, nil
}

// CountBySession returns the count of sources for a session.
func (r *KnowledgeSourceRepository) CountBySession(ctx context.Context, sessionID string) (int32, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountKnowledgeSourcesBySession(ctx, sql.NullString{String: sessionID, Valid: true})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count knowledge sources by session: %w", err)
	}
	return count, nil
}

// LinkSessionToCourse links all sources from a session to a course.
func (r *KnowledgeSourceRepository) LinkSessionToCourse(ctx context.Context, sessionID string, courseID uuid.UUID) (int64, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int64, error) {
		return q.LinkSessionToCourse(ctx, gen.LinkSessionToCourseParams{
			SessionID: sql.NullString{String: sessionID, Valid: true},
			CourseID:  uuid.NullUUID{UUID: courseID, Valid: true},
		})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to link session to course: %w", err)
	}
	return count, nil
}

// CreateWithTeam creates a knowledge source with team_id (team-level knowledge).
func (r *KnowledgeSourceRepository) CreateWithTeam(ctx context.Context, source *entity.KnowledgeSource) error {
	if source.ID == uuid.Nil {
		source.ID = uuid.New()
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.CreateKnowledgeSourceWithTeam(ctx, gen.CreateKnowledgeSourceWithTeamParams{
			ID:            source.ID,
			TenantID:      source.TenantID,
			TeamID:        toNullUUID(source.TeamID),
			Type:          toKnowledgeSourceType(source.Type.String()),
			Status:        toKnowledgeSourceStatus(source.Status.String()),
			Name:          source.Name,
			FilePath:      toNullString(source.FilePath),
			MimeType:      toNullString(source.MimeType),
			FileSizeBytes: toNullInt64(source.FileSizeBytes),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create knowledge source with team: %w", err)
	}

	source.CreatedAt = result.CreatedAt
	source.UpdatedAt = result.UpdatedAt
	return nil
}

// ListByTeam retrieves all knowledge sources for a team.
func (r *KnowledgeSourceRepository) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list knowledge sources by team: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	return sources, nil
}

// GetReadyByTeam retrieves ready sources for a team (for RAG context).
func (r *KnowledgeSourceRepository) GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.GetReadySourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get ready sources by team: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	return sources, nil
}

// GetTeamSummary returns aggregated statistics for team knowledge.
func (r *KnowledgeSourceRepository) GetTeamSummary(ctx context.Context, teamID uuid.UUID) (*entity.TeamKnowledgeSummary, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GetTeamKnowledgeSummaryRow, error) {
		return q.GetTeamKnowledgeSummary(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get team knowledge summary: %w", err)
	}

	return &entity.TeamKnowledgeSummary{
		TotalSources: result.TotalSources,
		TotalChunks:  result.TotalChunks,
		TotalTokens:  result.TotalTokens,
	}, nil
}

// CountByTeam returns the count of sources for a team.
func (r *KnowledgeSourceRepository) CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count knowledge sources by team: %w", err)
	}
	return count, nil
}

// DeleteByTeam deletes all knowledge sources for a team.
func (r *KnowledgeSourceRepository) DeleteByTeam(ctx context.Context, teamID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge sources by team: %w", err)
	}
	return nil
}

// UpdateDocumentIndex updates the summary and document index after user review.
func (r *KnowledgeSourceRepository) UpdateDocumentIndex(ctx context.Context, id uuid.UUID, summary string, documentIndex *entity.DocumentIndex) (*entity.KnowledgeSource, error) {
	var docIndexJSON pqtype.NullRawMessage
	if documentIndex != nil {
		jsonBytes, err := json.Marshal(documentIndex)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal document index: %w", err)
		}
		docIndexJSON = pqtype.NullRawMessage{RawMessage: jsonBytes, Valid: true}
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.UpdateDocumentIndex(ctx, gen.UpdateDocumentIndexParams{
			ID:            id,
			Summary:       sql.NullString{String: summary, Valid: summary != ""},
			DocumentIndex: docIndexJSON,
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to update document index: %w", err)
	}
	return toKnowledgeSourceEntity(&result), nil
}

// toKnowledgeSourceEntity converts a gen.KnowledgeSource to entity.KnowledgeSource.
func toKnowledgeSourceEntity(ks *gen.KnowledgeSource) *entity.KnowledgeSource {
	sourceType, _ := valueobject.ParseKnowledgeSourceType(string(ks.Type))
	status, _ := valueobject.ParseKnowledgeSourceStatus(string(ks.Status))

	var videoURLs []string
	if ks.VideoUrls.Valid && len(ks.VideoUrls.RawMessage) > 0 {
		_ = json.Unmarshal(ks.VideoUrls.RawMessage, &videoURLs)
	}

	// Handle optional CourseID (nil for pre-course session sources)
	var courseID *uuid.UUID
	if ks.CourseID.Valid {
		courseID = &ks.CourseID.UUID
	}

	// Handle optional TeamID (nil for non-team sources)
	var teamID *uuid.UUID
	if ks.TeamID.Valid {
		teamID = &ks.TeamID.UUID
	}

	// Handle optional DocumentIndex
	var documentIndex *entity.DocumentIndex
	if ks.DocumentIndex.Valid && len(ks.DocumentIndex.RawMessage) > 0 {
		var di entity.DocumentIndex
		if err := json.Unmarshal(ks.DocumentIndex.RawMessage, &di); err == nil {
			documentIndex = &di
		}
	}

	return &entity.KnowledgeSource{
		ID:            ks.ID,
		TenantID:      ks.TenantID,
		CourseID:      courseID,
		SessionID:     fromNullStringPtr(ks.SessionID),
		TeamID:        teamID,
		Type:          sourceType,
		Status:        status,
		Name:          ks.Name,
		FilePath:      fromNullStringPtr(ks.FilePath),
		MimeType:      fromNullStringPtr(ks.MimeType),
		FileSizeBytes: fromNullInt64Ptr(ks.FileSizeBytes),
		ChunkCount:    fromNullInt32(ks.ChunkCount),
		ErrorMessage:  fromNullStringPtr(ks.ErrorMessage),
		Summary:       fromNullStringPtr(ks.Summary),
		TokenCount:    fromNullInt32Ptr(ks.TokenCount),
		VideoURLs:     videoURLs,
		DocumentIndex: documentIndex,
		CreatedAt:     ks.CreatedAt,
		UpdatedAt:     ks.UpdatedAt,
		ProcessedAt:   fromDoublePointerTime(ks.ProcessedAt),
	}
}

