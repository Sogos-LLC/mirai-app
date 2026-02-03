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

-- name: CreateKnowledgeSourceWithSession :one
-- Create a knowledge source with session_id (for pre-course wizard flow)
INSERT INTO knowledge_sources (
    id,
    tenant_id,
    session_id,
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
    processed_at = CASE WHEN $1::text = 'ready' THEN NOW() ELSE processed_at END,
    updated_at = NOW()
WHERE id = $4
RETURNING *;

-- name: UpdateKnowledgeSourceWithSummary :one
-- Update status with RAG-generated summary and token count
UPDATE knowledge_sources SET
    status = $1,
    error_message = $2,
    chunk_count = $3,
    summary = $4,
    token_count = $5,
    processed_at = CASE WHEN $1::text = 'ready' THEN NOW() ELSE processed_at END,
    updated_at = NOW()
WHERE id = $6
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

-- name: ListKnowledgeSourcesBySession :many
-- List all sources for a session (pre-course wizard flow)
SELECT * FROM knowledge_sources
WHERE session_id = $1
ORDER BY created_at DESC;

-- name: GetReadySourcesBySession :many
-- Get only ready sources for a session
SELECT * FROM knowledge_sources
WHERE session_id = $1 AND status = 'ready'
ORDER BY created_at ASC;

-- name: LinkSessionToCourse :execrows
-- Link all sources from a session to a course
UPDATE knowledge_sources SET
    course_id = $2,
    updated_at = NOW()
WHERE session_id = $1 AND course_id IS NULL;

-- name: CountKnowledgeSourcesBySession :one
SELECT COUNT(*)::int as count FROM knowledge_sources WHERE session_id = $1;

-- name: UpdateKnowledgeSourceWithDocumentIndex :one
-- Update knowledge source with document index for Internal Data Only mode
UPDATE knowledge_sources SET
    status = $1,
    error_message = $2,
    chunk_count = $3,
    summary = $4,
    token_count = $5,
    document_index = $6,
    processed_at = CASE WHEN $1 = 'ready' THEN NOW() ELSE processed_at END,
    updated_at = NOW()
WHERE id = $7
RETURNING *;
