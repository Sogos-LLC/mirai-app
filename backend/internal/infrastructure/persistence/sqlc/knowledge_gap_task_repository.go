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
)

// KnowledgeGapTaskRepository implements repository.KnowledgeGapTaskRepository using sqlc.
type KnowledgeGapTaskRepository struct {
	db *sql.DB
}

// NewKnowledgeGapTaskRepository creates a new sqlc-based knowledge gap task repository.
func NewKnowledgeGapTaskRepository(db *sql.DB) repository.KnowledgeGapTaskRepository {
	return &KnowledgeGapTaskRepository{db: db}
}

// Create creates a new knowledge gap task.
func (r *KnowledgeGapTaskRepository) Create(ctx context.Context, task *entity.KnowledgeGapTask) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeGapTask, error) {
		return q.CreateGapTask(ctx, gen.CreateGapTaskParams{
			TenantID:         task.TenantID,
			CourseID:         task.CourseID,
			GapDescription:   task.GapDescription,
			AssignedToUserID: task.AssignedToUserID,
			AssignedByUserID: task.AssignedByUserID,
			TargetTeamID:     toNullUUID(task.TargetTeamID),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create gap task: %w", err)
	}

	task.ID = result.ID
	task.Status = result.Status
	task.CreatedAt = result.CreatedAt
	task.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a gap task by its ID.
func (r *KnowledgeGapTaskRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeGapTask, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeGapTask, error) {
		return q.GetGapTaskByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get gap task: %w", err)
	}
	return toGapTaskEntity(&result), nil
}

// ListByUser retrieves gap tasks assigned to a user, optionally filtered by status.
func (r *KnowledgeGapTaskRepository) ListByUser(ctx context.Context, userID uuid.UUID, status *string) ([]*entity.KnowledgeGapTask, error) {
	var statusParam sql.NullString
	if status != nil {
		statusParam = sql.NullString{String: *status, Valid: true}
	}

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeGapTask, error) {
		return q.ListGapTasksByUser(ctx, gen.ListGapTasksByUserParams{
			AssignedToUserID: userID,
			Status:           statusParam,
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list gap tasks by user: %w", err)
	}

	tasks := make([]*entity.KnowledgeGapTask, len(results))
	for i := range results {
		tasks[i] = toGapTaskEntity(&results[i])
	}
	return tasks, nil
}

// ListByCourse retrieves gap tasks for a course.
func (r *KnowledgeGapTaskRepository) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeGapTask, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.KnowledgeGapTask, error) {
		return q.ListGapTasksByCourse(ctx, courseID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list gap tasks by course: %w", err)
	}

	tasks := make([]*entity.KnowledgeGapTask, len(results))
	for i := range results {
		tasks[i] = toGapTaskEntity(&results[i])
	}
	return tasks, nil
}

// Complete marks a gap task as completed.
func (r *KnowledgeGapTaskRepository) Complete(ctx context.Context, id uuid.UUID, knowledgeSourceID *uuid.UUID, completionNotes *string) (*entity.KnowledgeGapTask, error) {
	var notes sql.NullString
	if completionNotes != nil {
		notes = sql.NullString{String: *completionNotes, Valid: true}
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.KnowledgeGapTask, error) {
		return q.CompleteGapTask(ctx, gen.CompleteGapTaskParams{
			ID:                id,
			KnowledgeSourceID: toNullUUID(knowledgeSourceID),
			CompletionNotes:   notes,
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to complete gap task: %w", err)
	}
	return toGapTaskEntity(&result), nil
}

// CountPendingByCourse counts non-completed gap tasks for a course.
func (r *KnowledgeGapTaskRepository) CountPendingByCourse(ctx context.Context, courseID uuid.UUID) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountPendingGapTasksByCourse(ctx, courseID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count pending gap tasks: %w", err)
	}
	return int(count), nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toGapTaskEntity(t *gen.KnowledgeGapTask) *entity.KnowledgeGapTask {
	task := &entity.KnowledgeGapTask{
		ID:               t.ID,
		TenantID:         t.TenantID,
		CourseID:         t.CourseID,
		GapDescription:   t.GapDescription,
		AssignedToUserID: t.AssignedToUserID,
		AssignedByUserID: t.AssignedByUserID,
		Status:           t.Status,
		CreatedAt:        t.CreatedAt,
		UpdatedAt:        t.UpdatedAt,
	}

	if t.TargetTeamID.Valid {
		task.TargetTeamID = &t.TargetTeamID.UUID
	}
	if t.KnowledgeSourceID.Valid {
		task.KnowledgeSourceID = &t.KnowledgeSourceID.UUID
	}
	if t.CompletedAt != nil {
		task.CompletedAt = *t.CompletedAt
	}
	if t.CompletionNotes.Valid {
		task.CompletionNotes = &t.CompletionNotes.String
	}

	return task
}
