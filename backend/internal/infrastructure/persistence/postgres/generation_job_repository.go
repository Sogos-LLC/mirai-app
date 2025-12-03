package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// GenerationJobRepository implements repository.GenerationJobRepository using PostgreSQL.
type GenerationJobRepository struct {
	db *sql.DB
}

// NewGenerationJobRepository creates a new PostgreSQL generation job repository.
func NewGenerationJobRepository(db *sql.DB) repository.GenerationJobRepository {
	return &GenerationJobRepository{db: db}
}

// Create creates a new job.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) Create(ctx context.Context, job *entity.GenerationJob) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO generation_jobs (tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
			RETURNING id, created_at
		`
		return tx.QueryRowContext(ctx, query,
			job.TenantID,
			job.Type.String(),
			job.Status.String(),
			job.CourseID,
			job.LessonID,
			job.OutlineLessonID,
			job.SMETaskID,
			job.SubmissionID,
			job.ParentJobID,
			job.ProgressPercent,
			job.ProgressMessage,
			job.ResultPath,
			job.ErrorMessage,
			job.TokensUsed,
			job.RetryCount,
			job.MaxRetries,
			job.CreatedByUserID,
		).Scan(&job.ID, &job.CreatedAt)
	})
}

// GetByID retrieves a job by its ID.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.GenerationJob, error) {
		query := `
			SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
			FROM generation_jobs
			WHERE id = $1
		`
		job := &entity.GenerationJob{}
		var typeStr, statusStr string
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&job.ID,
			&job.TenantID,
			&typeStr,
			&statusStr,
			&job.CourseID,
			&job.LessonID,
			&job.OutlineLessonID,
			&job.SMETaskID,
			&job.SubmissionID,
			&job.ParentJobID,
			&job.ProgressPercent,
			&job.ProgressMessage,
			&job.ResultPath,
			&job.ErrorMessage,
			&job.TokensUsed,
			&job.RetryCount,
			&job.MaxRetries,
			&job.CreatedByUserID,
			&job.CreatedAt,
			&job.StartedAt,
			&job.CompletedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get job: %w", err)
		}
		job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
		job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
		return job, nil
	})
}

// List retrieves jobs with optional filtering.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) List(ctx context.Context, opts entity.GenerationJobListOptions) ([]*entity.GenerationJob, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.GenerationJob, error) {
		query := `
			SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
			FROM generation_jobs
			WHERE 1=1
		`
		args := []interface{}{}
		argIndex := 1

		if opts.Type != nil {
			query += fmt.Sprintf(" AND type = $%d", argIndex)
			args = append(args, opts.Type.String())
			argIndex++
		}

		if opts.Status != nil {
			query += fmt.Sprintf(" AND status = $%d", argIndex)
			args = append(args, opts.Status.String())
			argIndex++
		}

		if opts.CourseID != nil {
			query += fmt.Sprintf(" AND course_id = $%d", argIndex)
			args = append(args, *opts.CourseID)
			argIndex++
		}

		query += " ORDER BY created_at DESC"

		rows, err := tx.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, fmt.Errorf("failed to list jobs: %w", err)
		}
		defer rows.Close()

		var jobs []*entity.GenerationJob
		for rows.Next() {
			job := &entity.GenerationJob{}
			var typeStr, statusStr string
			if err := rows.Scan(
				&job.ID,
				&job.TenantID,
				&typeStr,
				&statusStr,
				&job.CourseID,
				&job.LessonID,
				&job.OutlineLessonID,
				&job.SMETaskID,
				&job.SubmissionID,
				&job.ParentJobID,
				&job.ProgressPercent,
				&job.ProgressMessage,
				&job.ResultPath,
				&job.ErrorMessage,
				&job.TokensUsed,
				&job.RetryCount,
				&job.MaxRetries,
				&job.CreatedByUserID,
				&job.CreatedAt,
				&job.StartedAt,
				&job.CompletedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan job: %w", err)
			}
			job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
			job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
			jobs = append(jobs, job)
		}
		return jobs, nil
	})
}

// Update updates a job.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) Update(ctx context.Context, job *entity.GenerationJob) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE generation_jobs
			SET status = $1, progress_percent = $2, progress_message = $3, result_path = $4, error_message = $5, tokens_used = $6, retry_count = $7, started_at = $8, completed_at = $9
			WHERE id = $10
		`
		_, err := tx.ExecContext(ctx, query,
			job.Status.String(),
			job.ProgressPercent,
			job.ProgressMessage,
			job.ResultPath,
			job.ErrorMessage,
			job.TokensUsed,
			job.RetryCount,
			job.StartedAt,
			job.CompletedAt,
			job.ID,
		)
		return err
	})
}

// GetNextQueued atomically claims the next queued job for processing.
// Uses RLS with superadmin context to access jobs across all tenants.
// Atomically updates status to 'processing' and sets started_at in a single statement.
// This prevents race conditions where multiple workers could pick up the same job.
func (r *GenerationJobRepository) GetNextQueued(ctx context.Context) (*entity.GenerationJob, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.GenerationJob, error) {
		// Atomic claim: UPDATE with subquery SELECT FOR UPDATE SKIP LOCKED
		// This ensures only one worker can claim each job
		query := `
			UPDATE generation_jobs
			SET status = 'processing', started_at = NOW()
			WHERE id = (
				SELECT id FROM generation_jobs
				WHERE status = 'queued'
				ORDER BY created_at ASC
				LIMIT 1
				FOR UPDATE SKIP LOCKED
			)
			RETURNING id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
		`
		job := &entity.GenerationJob{}
		var typeStr, statusStr string
		err := tx.QueryRowContext(ctx, query).Scan(
			&job.ID,
			&job.TenantID,
			&typeStr,
			&statusStr,
			&job.CourseID,
			&job.LessonID,
			&job.OutlineLessonID,
			&job.SMETaskID,
			&job.SubmissionID,
			&job.ParentJobID,
			&job.ProgressPercent,
			&job.ProgressMessage,
			&job.ResultPath,
			&job.ErrorMessage,
			&job.TokensUsed,
			&job.RetryCount,
			&job.MaxRetries,
			&job.CreatedByUserID,
			&job.CreatedAt,
			&job.StartedAt,
			&job.CompletedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to claim next queued job: %w", err)
		}
		job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
		job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
		return job, nil
	})
}

// ClaimJobByID atomically claims a specific job by ID for processing.
// Returns the job if successfully claimed, nil if already processed/claimed.
// Uses RLS with superadmin context to access jobs across all tenants.
func (r *GenerationJobRepository) ClaimJobByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.GenerationJob, error) {
		// Atomic claim: UPDATE only if status is 'queued'
		// This ensures idempotency - if job is already claimed, we get no rows
		query := `
			UPDATE generation_jobs
			SET status = 'processing', started_at = NOW()
			WHERE id = $1 AND status = 'queued'
			RETURNING id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
		`
		job := &entity.GenerationJob{}
		var typeStr, statusStr string
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&job.ID,
			&job.TenantID,
			&typeStr,
			&statusStr,
			&job.CourseID,
			&job.LessonID,
			&job.OutlineLessonID,
			&job.SMETaskID,
			&job.SubmissionID,
			&job.ParentJobID,
			&job.ProgressPercent,
			&job.ProgressMessage,
			&job.ResultPath,
			&job.ErrorMessage,
			&job.TokensUsed,
			&job.RetryCount,
			&job.MaxRetries,
			&job.CreatedByUserID,
			&job.CreatedAt,
			&job.StartedAt,
			&job.CompletedAt,
		)
		if err == sql.ErrNoRows {
			// Job doesn't exist or is not in 'queued' status (already claimed/processed)
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to claim job by ID: %w", err)
		}
		job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
		job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
		return job, nil
	})
}

// ListByParentID retrieves all child jobs for a parent job.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) ListByParentID(ctx context.Context, parentID uuid.UUID) ([]*entity.GenerationJob, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.GenerationJob, error) {
		query := `
			SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
			FROM generation_jobs
			WHERE parent_job_id = $1
			ORDER BY created_at ASC
		`
		rows, err := tx.QueryContext(ctx, query, parentID)
		if err != nil {
			return nil, fmt.Errorf("failed to list child jobs: %w", err)
		}
		defer rows.Close()

		var jobs []*entity.GenerationJob
		for rows.Next() {
			job := &entity.GenerationJob{}
			var typeStr, statusStr string
			if err := rows.Scan(
				&job.ID,
				&job.TenantID,
				&typeStr,
				&statusStr,
				&job.CourseID,
				&job.LessonID,
				&job.OutlineLessonID,
				&job.SMETaskID,
				&job.SubmissionID,
				&job.ParentJobID,
				&job.ProgressPercent,
				&job.ProgressMessage,
				&job.ResultPath,
				&job.ErrorMessage,
				&job.TokensUsed,
				&job.RetryCount,
				&job.MaxRetries,
				&job.CreatedByUserID,
				&job.CreatedAt,
				&job.StartedAt,
				&job.CompletedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan child job: %w", err)
			}
			job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
			job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
			jobs = append(jobs, job)
		}
		return jobs, nil
	})
}

// CheckAllChildrenComplete checks if all child jobs of a parent are completed.
// Uses RLS to ensure proper tenant isolation.
func (r *GenerationJobRepository) CheckAllChildrenComplete(ctx context.Context, parentID uuid.UUID) (bool, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (bool, error) {
		query := `
			SELECT COUNT(*) = 0
			FROM generation_jobs
			WHERE parent_job_id = $1
			  AND status NOT IN ('completed', 'failed', 'cancelled')
		`
		var allComplete bool
		err := tx.QueryRowContext(ctx, query, parentID).Scan(&allComplete)
		if err != nil {
			return false, fmt.Errorf("failed to check children completion: %w", err)
		}
		return allComplete, nil
	})
}

// TryFinalizeParentJob atomically checks if all children are complete and returns stats.
// Uses SELECT FOR UPDATE to prevent race conditions when multiple children complete simultaneously.
// Properly respects RLS tenant isolation by using the RLSQuery helper.
func (r *GenerationJobRepository) TryFinalizeParentJob(ctx context.Context, parentID uuid.UUID) (*repository.ParentJobFinalizationResult, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*repository.ParentJobFinalizationResult, error) {
		// Lock the parent job row to prevent concurrent finalization attempts
		// Using FOR UPDATE ensures only one worker can proceed at a time
		var parentStatus string
		lockQuery := `
			SELECT status FROM generation_jobs
			WHERE id = $1
			FOR UPDATE
		`
		if err := tx.QueryRowContext(ctx, lockQuery, parentID).Scan(&parentStatus); err != nil {
			if err == sql.ErrNoRows {
				return nil, nil
			}
			return nil, fmt.Errorf("failed to lock parent job: %w", err)
		}

		// If parent is already finalized, return early
		if parentStatus == "completed" || parentStatus == "failed" || parentStatus == "cancelled" {
			return &repository.ParentJobFinalizationResult{
				WasFinalized: false,
				AllComplete:  true,
			}, nil
		}

		// Get child job statistics in a single query
		statsQuery := `
			SELECT
				COUNT(*) as total,
				COUNT(*) FILTER (WHERE status = 'completed') as completed,
				COUNT(*) FILTER (WHERE status = 'failed') as failed,
				COUNT(*) FILTER (WHERE status NOT IN ('completed', 'failed', 'cancelled')) as pending,
				COALESCE(SUM(tokens_used), 0) as total_tokens
			FROM generation_jobs
			WHERE parent_job_id = $1
		`

		var total, completed, failed, pending int
		var totalTokens int64
		if err := tx.QueryRowContext(ctx, statsQuery, parentID).Scan(&total, &completed, &failed, &pending, &totalTokens); err != nil {
			return nil, fmt.Errorf("failed to get child stats: %w", err)
		}

		result := &repository.ParentJobFinalizationResult{
			WasFinalized:   false,
			AllComplete:    pending == 0,
			CompletedCount: completed,
			FailedCount:    failed,
			TotalCount:     total,
			TotalTokens:    totalTokens,
		}

		// If there are still pending jobs, just return the stats without finalizing
		if pending > 0 {
			return result, nil
		}

		// All children are complete - we're the one to finalize the parent
		result.WasFinalized = true

		return result, nil
	})
}
