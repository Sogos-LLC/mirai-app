package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamKnowledgeRepository defines the interface for global and team-level knowledge source data access.
type TeamKnowledgeRepository interface {
	// CreateWithTeam creates a knowledge source (team_id can be nil for global).
	CreateWithTeam(ctx context.Context, source *entity.KnowledgeSource) error

	// GetByID retrieves a knowledge source by ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error)

	// ListByTeam retrieves all knowledge sources for a specific team.
	ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// ListGlobal retrieves all global knowledge sources (team_id IS NULL).
	ListGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error)

	// GetReadyByTeam retrieves ready sources for a specific team.
	GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// GetReadyGlobal retrieves ready global sources (team_id IS NULL).
	GetReadyGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error)

	// CountByTeam returns the count of sources for a team.
	CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error)

	// SumTokensByTeam returns the total token count for all ready sources in a team.
	SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error)

	// SumTokensGlobal returns the total token count for all ready global sources.
	SumTokensGlobal(ctx context.Context) (int64, error)

	// UpdateStatus updates the processing status of a source.
	UpdateStatus(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32) (*entity.KnowledgeSource, error)

	// UpdateStatusWithSummary updates status with RAG-generated summary.
	UpdateStatusWithSummary(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32, summary string, tokenCount int32) (*entity.KnowledgeSource, error)

	// Delete deletes a knowledge source.
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteByTeam deletes all knowledge sources for a team.
	DeleteByTeam(ctx context.Context, teamID uuid.UUID) error
}
