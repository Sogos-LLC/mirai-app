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
func (r *GenerationJobRepository) Create(ctx context.Context, job *entity.GenerationJob) error {
	query := `
		INSERT INTO generation_jobs (tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query,
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
}

// GetByID retrieves a job by its ID.
func (r *GenerationJobRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error) {
	query := `
		SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
		FROM generation_jobs
		WHERE id = $1
	`
	job := &entity.GenerationJob{}
	var typeStr, statusStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
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
}

// List retrieves jobs with optional filtering.
func (r *GenerationJobRepository) List(ctx context.Context, opts entity.GenerationJobListOptions) ([]*entity.GenerationJob, error) {
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

	rows, err := r.db.QueryContext(ctx, query, args...)
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
}

// Update updates a job.
func (r *GenerationJobRepository) Update(ctx context.Context, job *entity.GenerationJob) error {
	query := `
		UPDATE generation_jobs
		SET status = $1, progress_percent = $2, progress_message = $3, result_path = $4, error_message = $5, tokens_used = $6, retry_count = $7, started_at = $8, completed_at = $9
		WHERE id = $10
	`
	_, err := r.db.ExecContext(ctx, query,
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
}

// GetNextQueued retrieves the next queued job for processing.
func (r *GenerationJobRepository) GetNextQueued(ctx context.Context) (*entity.GenerationJob, error) {
	query := `
		SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
		FROM generation_jobs
		WHERE status = 'queued'
		ORDER BY created_at ASC
		LIMIT 1
		FOR UPDATE SKIP LOCKED
	`
	job := &entity.GenerationJob{}
	var typeStr, statusStr string
	err := r.db.QueryRowContext(ctx, query).Scan(
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
		return nil, fmt.Errorf("failed to get next queued job: %w", err)
	}
	job.Type, _ = valueobject.ParseGenerationJobType(typeStr)
	job.Status, _ = valueobject.ParseGenerationJobStatus(statusStr)
	return job, nil
}

// ListByParentID retrieves all child jobs for a parent job.
func (r *GenerationJobRepository) ListByParentID(ctx context.Context, parentID uuid.UUID) ([]*entity.GenerationJob, error) {
	query := `
		SELECT id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, sme_task_id, submission_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at, started_at, completed_at
		FROM generation_jobs
		WHERE parent_job_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.QueryContext(ctx, query, parentID)
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
}

// CheckAllChildrenComplete checks if all child jobs of a parent are completed.
func (r *GenerationJobRepository) CheckAllChildrenComplete(ctx context.Context, parentID uuid.UUID) (bool, error) {
	query := `
		SELECT COUNT(*) = 0
		FROM generation_jobs
		WHERE parent_job_id = $1
		  AND status NOT IN ('completed', 'failed', 'cancelled')
	`
	var allComplete bool
	err := r.db.QueryRowContext(ctx, query, parentID).Scan(&allComplete)
	if err != nil {
		return false, fmt.Errorf("failed to check children completion: %w", err)
	}
	return allComplete, nil
}
