package sqlc

import (
	"context"
	"database/sql"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamKnowledgeRepository implements repository.TeamKnowledgeRepository.
type TeamKnowledgeRepository struct {
	db *sql.DB
}

// NewTeamKnowledgeRepository creates a new sqlc-based team knowledge repository.
func NewTeamKnowledgeRepository(db *sql.DB) repository.TeamKnowledgeRepository {
	log.Printf("[TeamKnowledgeRepository] Initializing repository")
	return &TeamKnowledgeRepository{db: db}
}

// CreateWithTeam creates a knowledge source (team_id can be nil for global).
func (r *TeamKnowledgeRepository) CreateWithTeam(ctx context.Context, source *entity.KnowledgeSource) error {
	log.Printf("[TeamKnowledgeRepository.CreateWithTeam] Creating source: name=%s, teamID=%v", source.Name, source.TeamID)

	if source.ID == uuid.Nil {
		source.ID = uuid.New()
	}

	// Build team_id - handle nil for global knowledge
	var teamIDParam uuid.NullUUID
	if source.TeamID != nil {
		teamIDParam = uuid.NullUUID{UUID: *source.TeamID, Valid: true}
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.CreateTeamKnowledgeSource(ctx, gen.CreateTeamKnowledgeSourceParams{
			ID:            source.ID,
			TenantID:      source.TenantID,
			TeamID:        teamIDParam,
			Type:          toKnowledgeSourceType(source.Type.String()),
			Status:        toKnowledgeSourceStatus(source.Status.String()),
			Name:          source.Name,
			FilePath:      toNullString(source.FilePath),
			MimeType:      toNullString(source.MimeType),
			FileSizeBytes: toNullInt64(source.FileSizeBytes),
			ContentHash:   toNullString(source.ContentHash),
		})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.CreateWithTeam] ERROR: %v", err)
		return fmt.Errorf("failed to create team knowledge source: %w", err)
	}

	source.CreatedAt = result.CreatedAt
	source.UpdatedAt = result.UpdatedAt
	log.Printf("[TeamKnowledgeRepository.CreateWithTeam] SUCCESS: id=%s", source.ID)
	return nil
}

// GetByID retrieves a knowledge source by ID.
func (r *TeamKnowledgeRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.GetByID] Fetching source: id=%s", id)

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.GetKnowledgeSourceByIDForTeam(ctx, id)
	})
	if err == sql.ErrNoRows {
		log.Printf("[TeamKnowledgeRepository.GetByID] Not found: id=%s", id)
		return nil, nil
	}
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.GetByID] ERROR: %v", err)
		return nil, fmt.Errorf("failed to get knowledge source: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.GetByID] SUCCESS: id=%s, status=%s", id, result.Status)
	return toKnowledgeSourceEntity(&result), nil
}

// ListByTeam retrieves all knowledge sources for a team.
func (r *TeamKnowledgeRepository) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.ListByTeam] Listing sources for team: %s", teamID)

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.ListByTeam] ERROR: %v", err)
		return nil, fmt.Errorf("failed to list team knowledge sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	log.Printf("[TeamKnowledgeRepository.ListByTeam] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// GetReadyByTeam retrieves ready sources for a team.
func (r *TeamKnowledgeRepository) GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.GetReadyByTeam] Getting ready sources for team: %s", teamID)

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.GetReadySourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.GetReadyByTeam] ERROR: %v", err)
		return nil, fmt.Errorf("failed to get ready team sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	log.Printf("[TeamKnowledgeRepository.GetReadyByTeam] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// CountByTeam returns the count of sources for a team.
func (r *TeamKnowledgeRepository) CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error) {
	log.Printf("[TeamKnowledgeRepository.CountByTeam] Counting sources for team: %s", teamID)

	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.CountByTeam] ERROR: %v", err)
		return 0, fmt.Errorf("failed to count team knowledge sources: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.CountByTeam] SUCCESS: count=%d", count)
	return count, nil
}

// SumTokensByTeam returns the total token count for all ready sources in a team.
func (r *TeamKnowledgeRepository) SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error) {
	log.Printf("[TeamKnowledgeRepository.SumTokensByTeam] Summing tokens for team: %s", teamID)

	total, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int64, error) {
		return q.SumTokenCountByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.SumTokensByTeam] ERROR: %v", err)
		return 0, fmt.Errorf("failed to sum team token count: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.SumTokensByTeam] SUCCESS: total=%d", total)
	return total, nil
}

// ListGlobal retrieves all global knowledge sources (team_id IS NULL).
func (r *TeamKnowledgeRepository) ListGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.ListGlobal] Listing global knowledge sources")

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.ListGlobalKnowledgeSources(ctx)
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.ListGlobal] ERROR: %v", err)
		return nil, fmt.Errorf("failed to list global knowledge sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	log.Printf("[TeamKnowledgeRepository.ListGlobal] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// GetReadyGlobal retrieves ready global sources (team_id IS NULL).
func (r *TeamKnowledgeRepository) GetReadyGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.GetReadyGlobal] Getting ready global sources")

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeSource, error) {
		return q.GetReadyGlobalSources(ctx)
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.GetReadyGlobal] ERROR: %v", err)
		return nil, fmt.Errorf("failed to get ready global sources: %w", err)
	}

	sources := make([]*entity.KnowledgeSource, len(results))
	for i := range results {
		sources[i] = toKnowledgeSourceEntity(&results[i])
	}
	log.Printf("[TeamKnowledgeRepository.GetReadyGlobal] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// SumTokensGlobal returns the total token count for all ready global sources.
func (r *TeamKnowledgeRepository) SumTokensGlobal(ctx context.Context) (int64, error) {
	log.Printf("[TeamKnowledgeRepository.SumTokensGlobal] Summing global tokens")

	total, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int64, error) {
		return q.SumTokenCountGlobal(ctx)
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.SumTokensGlobal] ERROR: %v", err)
		return 0, fmt.Errorf("failed to sum global token count: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.SumTokensGlobal] SUCCESS: total=%d", total)
	return total, nil
}

// UpdateStatus updates the processing status of a source.
func (r *TeamKnowledgeRepository) UpdateStatus(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.UpdateStatus] Updating status: id=%s, status=%s", id, status)

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.UpdateKnowledgeSourceStatus(ctx, gen.UpdateKnowledgeSourceStatusParams{
			ID:           id,
			Status:       toKnowledgeSourceStatus(status.String()),
			ErrorMessage: toNullString(errorMsg),
			ChunkCount:   sql.NullInt32{Int32: chunkCount, Valid: true},
		})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.UpdateStatus] ERROR: %v", err)
		return nil, fmt.Errorf("failed to update status: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.UpdateStatus] SUCCESS: id=%s", id)
	return toKnowledgeSourceEntity(&result), nil
}

// UpdateStatusWithSummary updates status with RAG-generated summary.
func (r *TeamKnowledgeRepository) UpdateStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.UpdateStatusWithSummary] Updating: id=%s, status=%s, chunks=%d, tokens=%d",
		id, status, chunkCount, tokenCount)

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
		log.Printf("[TeamKnowledgeRepository.UpdateStatusWithSummary] ERROR: %v", err)
		return nil, fmt.Errorf("failed to update status with summary: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.UpdateStatusWithSummary] SUCCESS: id=%s", id)
	return toKnowledgeSourceEntity(&result), nil
}

// Delete deletes a knowledge source.
func (r *TeamKnowledgeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	log.Printf("[TeamKnowledgeRepository.Delete] Deleting source: id=%s", id)

	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteKnowledgeSource(ctx, id)
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.Delete] ERROR: %v", err)
		return fmt.Errorf("failed to delete knowledge source: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.Delete] SUCCESS: id=%s", id)
	return nil
}

// DeleteByTeam deletes all knowledge sources for a team.
func (r *TeamKnowledgeRepository) DeleteByTeam(ctx context.Context, teamID uuid.UUID) error {
	log.Printf("[TeamKnowledgeRepository.DeleteByTeam] Deleting all sources for team: %s", teamID)

	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteKnowledgeSourcesByTeam(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.DeleteByTeam] ERROR: %v", err)
		return fmt.Errorf("failed to delete team knowledge sources: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.DeleteByTeam] SUCCESS: teamID=%s", teamID)
	return nil
}

// FindByContentHash finds a knowledge source by content hash (for duplicate detection).
func (r *TeamKnowledgeRepository) FindByContentHash(ctx context.Context, contentHash string) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeRepository.FindByContentHash] Finding source by hash: %s", contentHash[:16]+"...")

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeSource, error) {
		return q.FindKnowledgeSourceByContentHash(ctx, sql.NullString{String: contentHash, Valid: true})
	})
	if err == sql.ErrNoRows {
		log.Printf("[TeamKnowledgeRepository.FindByContentHash] No duplicate found")
		return nil, nil
	}
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.FindByContentHash] ERROR: %v", err)
		return nil, fmt.Errorf("failed to find by content hash: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.FindByContentHash] Found duplicate: id=%s, name=%s", result.ID, result.Name)
	return toKnowledgeSourceEntity(&result), nil
}

// UpdateContentHash updates the content hash for a knowledge source.
func (r *TeamKnowledgeRepository) UpdateContentHash(ctx context.Context, id uuid.UUID, contentHash string) error {
	log.Printf("[TeamKnowledgeRepository.UpdateContentHash] Updating hash for: id=%s", id)

	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateKnowledgeSourceContentHash(ctx, gen.UpdateKnowledgeSourceContentHashParams{
			ID:          id,
			ContentHash: sql.NullString{String: contentHash, Valid: true},
		})
	})
	if err != nil {
		log.Printf("[TeamKnowledgeRepository.UpdateContentHash] ERROR: %v", err)
		return fmt.Errorf("failed to update content hash: %w", err)
	}

	log.Printf("[TeamKnowledgeRepository.UpdateContentHash] SUCCESS: id=%s", id)
	return nil
}
