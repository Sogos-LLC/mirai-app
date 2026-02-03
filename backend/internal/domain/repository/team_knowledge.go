package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamKnowledgeRepository defines the interface for team-level knowledge source data access.
type TeamKnowledgeRepository interface {
	// CreateWithTeam creates a team-level knowledge source.
	CreateWithTeam(ctx context.Context, source *entity.KnowledgeSource) error

	// GetByID retrieves a knowledge source by ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error)

	// ListByTeam retrieves all knowledge sources for a team.
	ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// GetReadyByTeam retrieves ready sources for a team.
	GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// CountByTeam returns the count of sources for a team.
	CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error)

	// SumTokensByTeam returns the total token count for all ready sources in a team.
	SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error)

	// UpdateStatus updates the processing status of a source.
	UpdateStatus(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32) (*entity.KnowledgeSource, error)

	// UpdateStatusWithSummary updates status with RAG-generated summary.
	UpdateStatusWithSummary(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32, summary string, tokenCount int32) (*entity.KnowledgeSource, error)

	// Delete deletes a knowledge source.
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteByTeam deletes all knowledge sources for a team.
	DeleteByTeam(ctx context.Context, teamID uuid.UUID) error
}
