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
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// GenerationJobRepository implements repository.GenerationJobRepository using sqlc-generated code.
type GenerationJobRepository struct {
	db *sql.DB
}

// NewGenerationJobRepository creates a new sqlc-based generation job repository.
func NewGenerationJobRepository(db *sql.DB) repository.GenerationJobRepository {
	return &GenerationJobRepository{db: db}
}

// Create creates a new job.
func (r *GenerationJobRepository) Create(ctx context.Context, job *entity.GenerationJob) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GenerationJob, error) {
		return q.CreateGenerationJob(ctx, gen.CreateGenerationJobParams{
			TenantID:        job.TenantID,
			Type:            toGenerationJobType(job.Type.String()),
			Status:          toGenerationJobStatus(job.Status.String()),
			CourseID:        toNullUUID(job.CourseID),
			ParentJobID:     toNullUUID(job.ParentJobID),
			ProgressPercent: int32(job.ProgressPercent),
			ProgressMessage: toNullString(job.ProgressMessage),
			ResultPath:      toNullString(job.ResultPath),
			ErrorMessage:    toNullString(job.ErrorMessage),
			TokensUsed:      job.TokensUsed,
			RetryCount:      int32(job.RetryCount),
			MaxRetries:      int32(job.MaxRetries),
			CreatedByUserID: job.CreatedByUserID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create generation job: %w", err)
	}

	job.ID = result.ID
	job.CreatedAt = result.CreatedAt
	return nil
}

// CreateBatch atomically creates multiple jobs in a single transaction.
func (r *GenerationJobRepository) CreateBatch(ctx context.Context, jobs []*entity.GenerationJob) error {
	if len(jobs) == 0 {
		return nil
	}

	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		for _, job := range jobs {
			err := q.CreateGenerationJobWithID(ctx, gen.CreateGenerationJobWithIDParams{
				ID:              job.ID,
				TenantID:        job.TenantID,
				Type:            toGenerationJobType(job.Type.String()),
				Status:          toGenerationJobStatus(job.Status.String()),
				CourseID:        toNullUUID(job.CourseID),
				ParentJobID:     toNullUUID(job.ParentJobID),
				ProgressPercent: int32(job.ProgressPercent),
				ProgressMessage: toNullString(job.ProgressMessage),
				ResultPath:      toNullString(job.ResultPath),
				ErrorMessage:    toNullString(job.ErrorMessage),
				TokensUsed:      job.TokensUsed,
				RetryCount:      int32(job.RetryCount),
				MaxRetries:      int32(job.MaxRetries),
				CreatedByUserID: job.CreatedByUserID,
			})
			if err != nil {
				return fmt.Errorf("failed to create job: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// GetByID retrieves a job by its ID.
func (r *GenerationJobRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GenerationJob, error) {
		return q.GetGenerationJobByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get generation job: %w", err)
	}
	return toGenerationJobEntity(&result)
}

// List retrieves jobs with optional filtering.
func (r *GenerationJobRepository) List(ctx context.Context, opts entity.GenerationJobListOptions) ([]*entity.GenerationJob, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.GenerationJob, error) {
		var typeStr sql.NullString
		var statusStr sql.NullString
		if opts.Type != nil {
			typeStr = sql.NullString{String: opts.Type.String(), Valid: true}
		}
		if opts.Status != nil {
			statusStr = sql.NullString{String: opts.Status.String(), Valid: true}
		}
		return q.ListGenerationJobs(ctx, gen.ListGenerationJobsParams{
			Type:     typeStr,
			Status:   statusStr,
			CourseID: toNullUUID(opts.CourseID),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list generation jobs: %w", err)
	}

	jobs := make([]*entity.GenerationJob, 0, len(results))
	for i := range results {
		job, err := toGenerationJobEntity(&results[i])
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

// Update updates a job.
func (r *GenerationJobRepository) Update(ctx context.Context, job *entity.GenerationJob) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateGenerationJob(ctx, gen.UpdateGenerationJobParams{
			Status:          toGenerationJobStatus(job.Status.String()),
			ProgressPercent: int32(job.ProgressPercent),
			ProgressMessage: toNullString(job.ProgressMessage),
			ResultPath:      toNullString(job.ResultPath),
			ErrorMessage:    toNullString(job.ErrorMessage),
			TokensUsed:      job.TokensUsed,
			RetryCount:      int32(job.RetryCount),
			StartedAt:       toDoublePointerTime(job.StartedAt),
			CompletedAt:     toDoublePointerTime(job.CompletedAt),
			ID:              job.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update generation job: %w", err)
	}
	return nil
}

// Delete deletes a job and all its children.
func (r *GenerationJobRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		// Delete children first to avoid FK constraint violations
		if err := q.DeleteGenerationJobsByParentID(ctx, uuid.NullUUID{UUID: id, Valid: true}); err != nil {
			return fmt.Errorf("failed to delete child jobs: %w", err)
		}
		if err := q.DeleteGenerationJob(ctx, id); err != nil {
			return fmt.Errorf("failed to delete job: %w", err)
		}
		return nil
	})
}

// GetNextQueued atomically claims the next job for processing.
// Implements "Push + Sweep" pattern for crash recovery.
func (r *GenerationJobRepository) GetNextQueued(ctx context.Context) (*entity.GenerationJob, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GenerationJob, error) {
		return q.ClaimQueuedJob(ctx)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to claim next queued job: %w", err)
	}
	// IMPORTANT: Do NOT return error on parse failure here!
	// The job is already atomically claimed (status='processing') in the DB.
	// Let the service layer handle bad data via failJob().
	job := toGenerationJobEntityNoError(&result)
	return job, nil
}

// ClaimJobByID atomically claims a specific job by ID for processing.
// Returns the job if successfully claimed, nil if already processed/claimed.
func (r *GenerationJobRepository) ClaimJobByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GenerationJob, error) {
		return q.ClaimJobByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to claim job by ID: %w", err)
	}
	// IMPORTANT: Do NOT return error on parse failure here!
	// The job is already atomically claimed (status='processing') in the DB.
	job := toGenerationJobEntityNoError(&result)
	return job, nil
}

// ListByParentID retrieves all child jobs for a parent job.
func (r *GenerationJobRepository) ListByParentID(ctx context.Context, parentID uuid.UUID) ([]*entity.GenerationJob, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.GenerationJob, error) {
		return q.ListGenerationJobsByParentID(ctx, uuid.NullUUID{UUID: parentID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list child jobs: %w", err)
	}

	jobs := make([]*entity.GenerationJob, 0, len(results))
	for i := range results {
		job, err := toGenerationJobEntity(&results[i])
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

// CheckAllChildrenComplete checks if all child jobs of a parent are completed.
func (r *GenerationJobRepository) CheckAllChildrenComplete(ctx context.Context, parentID uuid.UUID) (bool, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (bool, error) {
		return q.CheckAllChildrenComplete(ctx, uuid.NullUUID{UUID: parentID, Valid: true})
	})
	if err != nil {
		return false, fmt.Errorf("failed to check children completion: %w", err)
	}
	return result, nil
}

// TryFinalizeParentJob atomically checks if all children are complete and returns stats.
func (r *GenerationJobRepository) TryFinalizeParentJob(ctx context.Context, parentID uuid.UUID) (*repository.ParentJobFinalizationResult, error) {
	return database.WithRLS(ctx, r.db, func(q *gen.Queries) (*repository.ParentJobFinalizationResult, error) {
		// Lock the parent job row to prevent concurrent finalization attempts
		parentRow, err := q.GetParentJobStatus(ctx, parentID)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to lock parent job: %w", err)
		}

		// If parent is already finalized, return early
		if parentRow.Status == gen.GenerationJobStatusCompleted || parentRow.Status == gen.GenerationJobStatusFailed || parentRow.Status == gen.GenerationJobStatusCancelled {
			return &repository.ParentJobFinalizationResult{
				WasFinalized: false,
				AllComplete:  true,
			}, nil
		}

		// Get child job statistics
		stats, err := q.GetChildJobStats(ctx, uuid.NullUUID{UUID: parentID, Valid: true})
		if err != nil {
			return nil, fmt.Errorf("failed to get child stats: %w", err)
		}

		// Type assert TotalTokens from interface{} to int64
		var totalTokens int64
		if tt, ok := stats.TotalTokens.(int64); ok {
			totalTokens = tt
		}

		result := &repository.ParentJobFinalizationResult{
			WasFinalized:   false,
			AllComplete:    stats.Pending == 0,
			CompletedCount: int(stats.Completed),
			FailedCount:    int(stats.Failed),
			TotalCount:     int(stats.Total),
			TotalTokens:    totalTokens,
		}

		// If there are still pending jobs, just return the stats without finalizing
		if stats.Pending > 0 {
			return result, nil
		}

		// All children are complete - we're the one to finalize the parent
		result.WasFinalized = true

		return result, nil
	})
}

// FinalizeParentJob atomically checks child completion and updates parent status.
func (r *GenerationJobRepository) FinalizeParentJob(ctx context.Context, parentID uuid.UUID, completedStatus, failedStatus string, progressMessage string) (*repository.ParentJobFinalizationResult, error) {
	return database.WithRLS(ctx, r.db, func(q *gen.Queries) (*repository.ParentJobFinalizationResult, error) {
		// Lock the parent job row to prevent concurrent finalization attempts
		parentRow, err := q.GetParentJobStatus(ctx, parentID)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to lock parent job: %w", err)
		}

		// If parent is already finalized, return early
		if parentRow.Status == gen.GenerationJobStatusCompleted || parentRow.Status == gen.GenerationJobStatusFailed || parentRow.Status == gen.GenerationJobStatusCancelled {
			return &repository.ParentJobFinalizationResult{
				WasFinalized: false,
				AllComplete:  true,
			}, nil
		}

		// Get child job statistics
		stats, err := q.GetChildJobStats(ctx, uuid.NullUUID{UUID: parentID, Valid: true})
		if err != nil {
			return nil, fmt.Errorf("failed to get child stats: %w", err)
		}

		// Type assert TotalTokens from interface{} to int64
		var totalTokens int64
		if tt, ok := stats.TotalTokens.(int64); ok {
			totalTokens = tt
		}

		result := &repository.ParentJobFinalizationResult{
			WasFinalized:   false,
			AllComplete:    stats.Pending == 0,
			CompletedCount: int(stats.Completed),
			FailedCount:    int(stats.Failed),
			TotalCount:     int(stats.Total),
			TotalTokens:    totalTokens,
		}

		// If there are still pending jobs, just return the stats without finalizing
		if stats.Pending > 0 {
			return result, nil
		}

		// All children are complete - finalize the parent INSIDE the atomic lock
		finalStatusStr := completedStatus
		var errorMessage sql.NullString
		if stats.Failed > 0 {
			finalStatusStr = failedStatus
			errorMessage = sql.NullString{
				String: fmt.Sprintf("%d lesson(s) failed to generate", stats.Failed),
				Valid:  true,
			}
		}

		// Update parent status atomically while holding the lock
		err = q.FinalizeParentJob(ctx, gen.FinalizeParentJobParams{
			Status:          toGenerationJobStatus(finalStatusStr),
			ProgressMessage: sql.NullString{String: progressMessage, Valid: progressMessage != ""},
			TokensUsed:      totalTokens,
			ErrorMessage:    errorMessage,
			ID:              parentID,
		})
		if err != nil {
			return nil, fmt.Errorf("failed to update parent job status: %w", err)
		}

		result.WasFinalized = true
		return result, nil
	})
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toGenerationJobEntity(j *gen.GenerationJob) (*entity.GenerationJob, error) {
	jobType, err := valueobject.ParseGenerationJobType(string(j.Type))
	if err != nil {
		return nil, fmt.Errorf("failed to parse job type '%s': %w", j.Type, err)
	}
	jobStatus, err := valueobject.ParseGenerationJobStatus(string(j.Status))
	if err != nil {
		return nil, fmt.Errorf("failed to parse job status '%s': %w", j.Status, err)
	}

	job := &entity.GenerationJob{
		ID:              j.ID,
		TenantID:        j.TenantID,
		Type:            jobType,
		Status:          jobStatus,
		CourseID:        fromNullUUIDPtr(j.CourseID),
		ParentJobID:     fromNullUUIDPtr(j.ParentJobID),
		ProgressPercent: int32(j.ProgressPercent),
		ProgressMessage: fromNullStringPtr(j.ProgressMessage),
		ResultPath:      fromNullStringPtr(j.ResultPath),
		ErrorMessage:    fromNullStringPtr(j.ErrorMessage),
		TokensUsed:      j.TokensUsed,
		RetryCount:      int32(j.RetryCount),
		MaxRetries:      int32(j.MaxRetries),
		CreatedByUserID: j.CreatedByUserID,
		CreatedAt:       j.CreatedAt,
		StartedAt:       fromDoublePointerTime(j.StartedAt),
		CompletedAt:     fromDoublePointerTime(j.CompletedAt),
	}
	return job, nil
}

// toGenerationJobEntityNoError converts without returning errors on parse failure.
// Used for atomically claimed jobs where we can't rollback.
func toGenerationJobEntityNoError(j *gen.GenerationJob) *entity.GenerationJob {
	jobType, _ := valueobject.ParseGenerationJobType(string(j.Type))
	jobStatus, _ := valueobject.ParseGenerationJobStatus(string(j.Status))

	job := &entity.GenerationJob{
		ID:              j.ID,
		TenantID:        j.TenantID,
		Type:            jobType,
		Status:          jobStatus,
		CourseID:        fromNullUUIDPtr(j.CourseID),
		ParentJobID:     fromNullUUIDPtr(j.ParentJobID),
		ProgressPercent: int32(j.ProgressPercent),
		ProgressMessage: fromNullStringPtr(j.ProgressMessage),
		ResultPath:      fromNullStringPtr(j.ResultPath),
		ErrorMessage:    fromNullStringPtr(j.ErrorMessage),
		TokensUsed:      j.TokensUsed,
		RetryCount:      int32(j.RetryCount),
		MaxRetries:      int32(j.MaxRetries),
		CreatedByUserID: j.CreatedByUserID,
		CreatedAt:       j.CreatedAt,
		StartedAt:       fromDoublePointerTime(j.StartedAt),
		CompletedAt:     fromDoublePointerTime(j.CompletedAt),
	}
	return job
}
