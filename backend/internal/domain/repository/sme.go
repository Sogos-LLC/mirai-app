package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// SMERepository defines the interface for Subject Matter Expert data access.
type SMERepository interface {
	// Create creates a new SME.
	Create(ctx context.Context, sme *entity.SubjectMatterExpert) error

	// GetByID retrieves an SME by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.SubjectMatterExpert, error)

	// List retrieves SMEs with optional filtering.
	List(ctx context.Context, opts entity.SMEListOptions) ([]*entity.SubjectMatterExpert, error)

	// Update updates an SME.
	Update(ctx context.Context, sme *entity.SubjectMatterExpert) error

	// Delete deletes an SME.
	Delete(ctx context.Context, id uuid.UUID) error

	// AddTeamAccess adds team access for a team-scoped SME.
	AddTeamAccess(ctx context.Context, access *entity.SMETeamAccess) error

	// RemoveTeamAccess removes team access.
	RemoveTeamAccess(ctx context.Context, smeID, teamID uuid.UUID) error

	// ListTeamAccess lists team access for an SME.
	ListTeamAccess(ctx context.Context, smeID uuid.UUID) ([]*entity.SMETeamAccess, error)
}

// SMETaskRepository defines the interface for SME task data access.
type SMETaskRepository interface {
	// Create creates a new task.
	Create(ctx context.Context, task *entity.SMETask) error

	// GetByID retrieves a task by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETask, error)

	// List retrieves tasks with optional filtering.
	List(ctx context.Context, opts entity.SMETaskListOptions) ([]*entity.SMETask, error)

	// Update updates a task.
	Update(ctx context.Context, task *entity.SMETask) error

	// Cancel cancels a pending task.
	Cancel(ctx context.Context, id uuid.UUID) error

	// Delete permanently deletes a task.
	Delete(ctx context.Context, id uuid.UUID) error
}

// SMESubmissionRepository defines the interface for SME task submission data access.
type SMESubmissionRepository interface {
	// Create creates a new submission.
	Create(ctx context.Context, submission *entity.SMETaskSubmission) error

	// GetByID retrieves a submission by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETaskSubmission, error)

	// ListByTaskID retrieves all submissions for a task.
	ListByTaskID(ctx context.Context, taskID uuid.UUID) ([]*entity.SMETaskSubmission, error)

	// Update updates a submission (e.g., after processing).
	Update(ctx context.Context, submission *entity.SMETaskSubmission) error
}

// SMEKnowledgeRepository defines the interface for SME knowledge chunk data access.
type SMEKnowledgeRepository interface {
	// Create creates a new knowledge chunk.
	Create(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error

	// GetByID retrieves a chunk by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.SMEKnowledgeChunk, error)

	// ListBySMEID retrieves all chunks for an SME.
	ListBySMEID(ctx context.Context, smeID uuid.UUID) ([]*entity.SMEKnowledgeChunk, error)

	// Search searches knowledge across SMEs.
	Search(ctx context.Context, smeIDs []uuid.UUID, query string, limit int) ([]*entity.SMEKnowledgeChunk, error)

	// Update updates a knowledge chunk.
	Update(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error

	// Delete deletes a knowledge chunk by ID.
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteBySMEID deletes all chunks for an SME.
	DeleteBySMEID(ctx context.Context, smeID uuid.UUID) error
}
