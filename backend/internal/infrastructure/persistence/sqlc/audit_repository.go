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
)

// CourseAuditLogRepository implements repository.CourseAuditLogRepository using sqlc-generated code.
type CourseAuditLogRepository struct {
	db *sql.DB
}

// NewCourseAuditLogRepository creates a new sqlc-based course audit log repository.
func NewCourseAuditLogRepository(db *sql.DB) repository.CourseAuditLogRepository {
	return &CourseAuditLogRepository{db: db}
}

// Create creates a new audit log entry.
func (r *CourseAuditLogRepository) Create(ctx context.Context, entry *entity.CourseAuditLogEntry) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseAuditLog, error) {
		return q.CreateAuditLogEntry(ctx, gen.CreateAuditLogEntryParams{
			TenantID: entry.TenantID,
			CourseID: entry.CourseID,
			Action:   string(entry.Action),
			ActorID:  entry.ActorID,
			Metadata: pqtype.NullRawMessage{RawMessage: entry.Metadata, Valid: entry.Metadata != nil},
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create audit log entry: %w", err)
	}

	entry.ID = result.ID
	entry.CreatedAt = result.CreatedAt
	return nil
}

// ListByCourse retrieves audit log entries for a course.
func (r *CourseAuditLogRepository) ListByCourse(ctx context.Context, courseID uuid.UUID, limit, offset int) ([]*entity.CourseAuditLogEntry, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.CourseAuditLog, error) {
		return q.ListAuditLogByCourse(ctx, gen.ListAuditLogByCourseParams{
			CourseID: courseID,
			Limit:    int32(limit),
			Offset:   int32(offset),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list audit log by course: %w", err)
	}

	entities := make([]*entity.CourseAuditLogEntry, len(results))
	for i, log := range results {
		entities[i] = toAuditLogEntity(&log)
	}
	return entities, nil
}

// ListByActor retrieves audit log entries by actor.
func (r *CourseAuditLogRepository) ListByActor(ctx context.Context, actorID uuid.UUID, limit, offset int) ([]*entity.CourseAuditLogEntry, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.CourseAuditLog, error) {
		return q.ListAuditLogByActor(ctx, gen.ListAuditLogByActorParams{
			ActorID: actorID,
			Limit:   int32(limit),
			Offset:  int32(offset),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list audit log by actor: %w", err)
	}

	entities := make([]*entity.CourseAuditLogEntry, len(results))
	for i, log := range results {
		entities[i] = toAuditLogEntity(&log)
	}
	return entities, nil
}

// GetByID retrieves a single audit log entry.
func (r *CourseAuditLogRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseAuditLogEntry, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseAuditLog, error) {
		return q.GetAuditLogEntry(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get audit log entry: %w", err)
	}
	return toAuditLogEntity(&result), nil
}

// CountByCourse returns the count of audit entries for a course.
func (r *CourseAuditLogRepository) CountByCourse(ctx context.Context, courseID uuid.UUID) (int64, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int64, error) {
		return q.CountAuditLogByCourse(ctx, courseID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count audit log by course: %w", err)
	}
	return count, nil
}

func toAuditLogEntity(log *gen.CourseAuditLog) *entity.CourseAuditLogEntry {
	var metadata json.RawMessage
	if log.Metadata.Valid {
		metadata = log.Metadata.RawMessage
	}
	return &entity.CourseAuditLogEntry{
		ID:        log.ID,
		TenantID:  log.TenantID,
		CourseID:  log.CourseID,
		Action:    entity.AuditAction(log.Action),
		ActorID:   log.ActorID,
		Metadata:  metadata,
		CreatedAt: log.CreatedAt,
	}
}
