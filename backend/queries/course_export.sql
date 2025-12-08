-- Course Export CRUD operations
-- Schema: course_exports table with RLS isolation by tenant_id

-- name: CreateCourseExport :one
INSERT INTO course_exports (tenant_id, course_id, format, created_by_user_id)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetCourseExportByID :one
SELECT * FROM course_exports WHERE id = $1;

-- name: ListCourseExportsByCourseID :many
SELECT * FROM course_exports
WHERE course_id = $1
ORDER BY created_at DESC;

-- name: UpdateCourseExportProgress :exec
UPDATE course_exports
SET progress_percent = $1, progress_message = $2
WHERE id = $3;

-- name: UpdateCourseExportProcessing :exec
UPDATE course_exports
SET status = 'processing', started_at = NOW(), progress_percent = $1, progress_message = $2
WHERE id = $3;

-- name: UpdateCourseExportComplete :exec
UPDATE course_exports
SET status = 'completed', file_path = $1, file_size_bytes = $2,
    progress_percent = 100, progress_message = 'Export complete', completed_at = NOW()
WHERE id = $3;

-- name: UpdateCourseExportFailed :exec
UPDATE course_exports
SET status = 'failed', error_message = $1, completed_at = NOW()
WHERE id = $2;

-- name: ClaimPendingExport :one
-- Atomic claim using FOR UPDATE SKIP LOCKED to prevent race conditions
UPDATE course_exports
SET status = 'processing', started_at = NOW()
WHERE id = (
    SELECT id FROM course_exports
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
)
RETURNING *;

-- name: ClaimExportByID :one
-- Claim a specific export by ID, only if pending
UPDATE course_exports
SET status = 'processing', started_at = NOW()
WHERE id = $1 AND status = 'pending'
RETURNING *;

-- name: CountExportsByStatus :one
SELECT
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    COUNT(*) FILTER (WHERE status = 'processing') as processing,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed
FROM course_exports
WHERE course_id = $1;
