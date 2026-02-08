package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// KnowledgeGapTaskRepository defines the interface for knowledge gap task data access.
type KnowledgeGapTaskRepository interface {
	// Create creates a new knowledge gap task.
	Create(ctx context.Context, task *entity.KnowledgeGapTask) error

	// GetByID retrieves a gap task by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeGapTask, error)

	// ListByUser retrieves gap tasks assigned to a user, optionally filtered by status.
	ListByUser(ctx context.Context, userID uuid.UUID, status *string) ([]*entity.KnowledgeGapTask, error)

	// ListByCourse retrieves gap tasks for a course.
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeGapTask, error)

	// Complete marks a gap task as completed.
	Complete(ctx context.Context, id uuid.UUID, knowledgeSourceID *uuid.UUID, completionNotes *string) (*entity.KnowledgeGapTask, error)

	// SubmitByUser marks all completed tasks for a user as submitted.
	SubmitByUser(ctx context.Context, userID uuid.UUID) ([]*entity.KnowledgeGapTask, error)

	// CountPendingByCourse counts non-completed gap tasks for a course.
	CountPendingByCourse(ctx context.Context, courseID uuid.UUID) (int, error)
}
