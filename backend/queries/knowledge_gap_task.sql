-- Knowledge Gap Task CRUD operations
-- Schema: knowledge_gap_tasks table with RLS isolation by tenant_id
-- Note: User names/emails come from Kratos identity, not the users table

-- name: CreateGapTask :one
INSERT INTO knowledge_gap_tasks (
    tenant_id, course_id, gap_description,
    assigned_to_user_id, assigned_by_user_id, target_team_id, status
) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
RETURNING *;

-- name: ListGapTasksByUser :many
SELECT * FROM knowledge_gap_tasks
WHERE assigned_to_user_id = $1
    AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC;

-- name: ListGapTasksByCourse :many
SELECT * FROM knowledge_gap_tasks
WHERE course_id = $1
ORDER BY created_at DESC;

-- name: GetGapTaskByID :one
SELECT * FROM knowledge_gap_tasks
WHERE id = $1;

-- name: CompleteGapTask :one
UPDATE knowledge_gap_tasks
SET status = 'completed',
    knowledge_source_id = $2,
    completion_notes = $3,
    completed_at = NOW(),
    updated_at = NOW()
WHERE id = $1
RETURNING *;

-- name: CountPendingGapTasksByCourse :one
SELECT COUNT(*)::int as count
FROM knowledge_gap_tasks
WHERE course_id = $1 AND status != 'completed';
