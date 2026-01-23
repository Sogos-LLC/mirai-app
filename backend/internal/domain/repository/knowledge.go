package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeSourceRepository defines the interface for knowledge source data access.
type KnowledgeSourceRepository interface {
	// Create creates a new knowledge source.
	Create(ctx context.Context, source *entity.KnowledgeSource) error

	// CreateWithSession creates a knowledge source with session_id (pre-course wizard flow).
	CreateWithSession(ctx context.Context, source *entity.KnowledgeSource) error

	// GetByID retrieves a knowledge source by ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error)

	// ListByCourse retrieves all knowledge sources for a course.
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// ListBySession retrieves all knowledge sources for a session.
	ListBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error)

	// GetReadyByCourse retrieves ready sources for a course.
	GetReadyByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error)

	// GetReadyBySession retrieves ready sources for a session.
	GetReadyBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error)

	// ListPending retrieves pending sources for processing.
	ListPending(ctx context.Context, limit int32) ([]*entity.KnowledgeSource, error)

	// UpdateStatus updates the processing status of a source.
	UpdateStatus(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32) (*entity.KnowledgeSource, error)

	// UpdateStatusWithSummary updates status with RAG-generated summary.
	UpdateStatusWithSummary(ctx context.Context, id uuid.UUID, status valueobject.KnowledgeSourceStatus, errorMsg *string, chunkCount int32, summary string, tokenCount int32) (*entity.KnowledgeSource, error)

	// UpdateVideoURLs updates the detected video URLs.
	UpdateVideoURLs(ctx context.Context, id uuid.UUID, urls []string) (*entity.KnowledgeSource, error)

	// LinkSessionToCourse links all sources from a session to a course.
	LinkSessionToCourse(ctx context.Context, sessionID string, courseID uuid.UUID) (int64, error)

	// Delete deletes a knowledge source.
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteByCourse deletes all knowledge sources for a course.
	DeleteByCourse(ctx context.Context, courseID uuid.UUID) error

	// CountByCourse returns the count of sources for a course.
	CountByCourse(ctx context.Context, courseID uuid.UUID) (int32, error)

	// CountBySession returns the count of sources for a session.
	CountBySession(ctx context.Context, sessionID string) (int32, error)
}
