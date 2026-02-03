-- Course Audit Log CRUD operations
-- Schema: course_audit_log table with RLS isolation by tenant_id

-- name: CreateAuditLogEntry :one
INSERT INTO course_audit_log (tenant_id, course_id, action, actor_id, metadata)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListAuditLogByCourse :many
SELECT * FROM course_audit_log
WHERE course_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: ListAuditLogByActor :many
SELECT * FROM course_audit_log
WHERE actor_id = $1
ORDER BY created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetAuditLogEntry :one
SELECT * FROM course_audit_log
WHERE id = $1;

-- name: CountAuditLogByCourse :one
SELECT COUNT(*) FROM course_audit_log
WHERE course_id = $1;
