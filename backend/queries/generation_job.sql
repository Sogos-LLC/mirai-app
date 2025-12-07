-- Generation Job CRUD operations
-- Schema: generation_jobs table with RLS isolation by tenant_id

-- name: CreateGenerationJob :one
INSERT INTO generation_jobs (tenant_id, type, status, course_id, lesson_id, outline_lesson_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
RETURNING *;

-- name: CreateGenerationJobWithID :exec
INSERT INTO generation_jobs (id, tenant_id, type, status, course_id, lesson_id, outline_lesson_id, parent_job_id, progress_percent, progress_message, result_path, error_message, tokens_used, retry_count, max_retries, created_by_user_id, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW());

-- name: GetGenerationJobByID :one
SELECT * FROM generation_jobs WHERE id = $1;

-- name: ListGenerationJobs :many
SELECT * FROM generation_jobs
WHERE (sqlc.narg('type')::text IS NULL OR type::text = sqlc.narg('type'))
  AND (sqlc.narg('status')::text IS NULL OR status::text = sqlc.narg('status'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR course_id = sqlc.narg('course_id'))
ORDER BY created_at DESC;

-- name: UpdateGenerationJob :exec
UPDATE generation_jobs
SET status = $1, progress_percent = $2, progress_message = $3, result_path = $4, error_message = $5, tokens_used = $6, retry_count = $7, started_at = $8, completed_at = $9
WHERE id = $10;

-- name: ListGenerationJobsByParentID :many
SELECT * FROM generation_jobs
WHERE parent_job_id = $1
ORDER BY created_at ASC;

-- name: CheckAllChildrenComplete :one
SELECT COUNT(*) = 0 as all_complete
FROM generation_jobs
WHERE parent_job_id = $1
  AND status NOT IN ('completed', 'failed', 'cancelled');

-- name: GetChildJobStats :one
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'failed', 'cancelled')) as pending,
    COALESCE(SUM(tokens_used), 0) as total_tokens
FROM generation_jobs
WHERE parent_job_id = $1;

-- name: GetParentJobStatus :one
SELECT id, status FROM generation_jobs WHERE id = $1 FOR UPDATE;

-- name: FinalizeParentJob :exec
UPDATE generation_jobs
SET status = $1, progress_percent = 100, progress_message = $2,
    tokens_used = $3, completed_at = NOW(), error_message = $4
WHERE id = $5;

-- name: ClaimQueuedJob :one
-- Atomic claim: UPDATE with subquery SELECT FOR UPDATE SKIP LOCKED
-- This ensures only one worker can claim each job
UPDATE generation_jobs
SET status = 'processing', started_at = NOW(), retry_count = retry_count + CASE WHEN status = 'processing' THEN 1 ELSE 0 END
WHERE id = (
    SELECT id FROM generation_jobs
    WHERE (status = 'queued' AND type != 'full_course')
       OR (status = 'processing' AND started_at < NOW() - INTERVAL '30 minutes' AND type != 'full_course')
    ORDER BY
        CASE WHEN status = 'queued' THEN 0 ELSE 1 END,
        created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: ClaimJobByID :one
-- Claim a specific job by ID, only if queued
UPDATE generation_jobs
SET status = 'processing', started_at = NOW()
WHERE id = $1 AND status = 'queued'
RETURNING *;
