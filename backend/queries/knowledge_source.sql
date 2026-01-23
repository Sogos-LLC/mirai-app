-- Knowledge source CRUD operations
-- Schema: knowledge_sources table with RLS isolation by tenant_id

-- name: CreateKnowledgeSource :one
INSERT INTO knowledge_sources (
    id,
    tenant_id,
    course_id,
    type,
    status,
    name,
    file_path,
    mime_type,
    file_size_bytes
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9
)
RETURNING *;

-- name: GetKnowledgeSourceByID :one
SELECT * FROM knowledge_sources WHERE id = $1;

-- name: ListKnowledgeSourcesByCourse :many
SELECT * FROM knowledge_sources
WHERE course_id = $1
ORDER BY created_at DESC;

-- name: UpdateKnowledgeSourceStatus :one
UPDATE knowledge_sources SET
    status = $1,
    error_message = $2,
    chunk_count = $3,
    processed_at = CASE WHEN $1 = 'ready' THEN NOW() ELSE processed_at END,
    updated_at = NOW()
WHERE id = $4
RETURNING *;

-- name: UpdateKnowledgeSourceVideoURLs :one
UPDATE knowledge_sources SET
    video_urls = $1,
    updated_at = NOW()
WHERE id = $2
RETURNING *;

-- name: DeleteKnowledgeSource :exec
DELETE FROM knowledge_sources WHERE id = $1;

-- name: DeleteKnowledgeSourcesByCourse :exec
DELETE FROM knowledge_sources WHERE course_id = $1;

-- name: CountKnowledgeSourcesByCourse :one
SELECT COUNT(*)::int as count FROM knowledge_sources WHERE course_id = $1;

-- name: ListPendingKnowledgeSources :many
SELECT * FROM knowledge_sources
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT $1;

-- name: GetReadySourcesByCourse :many
SELECT * FROM knowledge_sources
WHERE course_id = $1 AND status = 'ready'
ORDER BY created_at ASC;
