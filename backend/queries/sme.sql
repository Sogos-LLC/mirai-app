-- Subject Matter Expert and related CRUD operations
-- Schema: subject_matter_experts, sme_team_access, sme_tasks, sme_task_submissions, sme_knowledge_chunks tables

-- ============================================================================
-- Subject Matter Experts
-- ============================================================================

-- name: CreateSME :one
INSERT INTO subject_matter_experts (tenant_id, company_id, name, description, domain, scope, status, knowledge_summary, knowledge_content_path, created_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetSMEByID :one
SELECT * FROM subject_matter_experts WHERE id = $1;

-- name: ListSMEs :many
SELECT DISTINCT s.* FROM subject_matter_experts s
LEFT JOIN sme_team_access sta ON s.id = sta.sme_id
WHERE (sqlc.narg('scope')::text IS NULL OR s.scope = sqlc.narg('scope'))
  AND (sqlc.narg('status')::text IS NULL OR s.status = sqlc.narg('status'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR s.scope = 'global' OR sta.team_id = sqlc.narg('team_id'))
ORDER BY s.created_at DESC;

-- name: UpdateSME :one
UPDATE subject_matter_experts
SET name = $1, description = $2, domain = $3, scope = $4, status = $5, knowledge_summary = $6, knowledge_content_path = $7, updated_at = NOW()
WHERE id = $8
RETURNING *;

-- name: DeleteSME :exec
DELETE FROM subject_matter_experts WHERE id = $1;

-- ============================================================================
-- SME Team Access
-- ============================================================================

-- name: AddSMETeamAccess :one
INSERT INTO sme_team_access (tenant_id, sme_id, team_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: RemoveSMETeamAccess :exec
DELETE FROM sme_team_access WHERE sme_id = $1 AND team_id = $2;

-- name: ListSMETeamAccess :many
SELECT * FROM sme_team_access WHERE sme_id = $1;

-- name: ListSMETeamIDsBySMEID :many
SELECT team_id FROM sme_team_access WHERE sme_id = $1;

-- ============================================================================
-- SME Tasks
-- ============================================================================

-- name: CreateSMETask :one
INSERT INTO sme_tasks (tenant_id, sme_id, title, description, expected_content_type, assigned_to_user_id, assigned_by_user_id, team_id, status, due_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetSMETaskByID :one
SELECT * FROM sme_tasks WHERE id = $1;

-- name: ListSMETasks :many
SELECT * FROM sme_tasks
WHERE (sqlc.narg('sme_id')::uuid IS NULL OR sme_id = sqlc.narg('sme_id'))
  AND (sqlc.narg('assigned_to_user_id')::uuid IS NULL OR assigned_to_user_id = sqlc.narg('assigned_to_user_id'))
  AND (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
ORDER BY created_at DESC;

-- name: UpdateSMETask :one
UPDATE sme_tasks
SET title = $1, description = $2, expected_content_type = $3, due_date = $4, status = $5, completed_at = $6, updated_at = NOW()
WHERE id = $7
RETURNING *;

-- name: CancelSMETask :exec
UPDATE sme_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending';

-- name: DeleteSMETask :exec
DELETE FROM sme_tasks WHERE id = $1;

-- ============================================================================
-- SME Task Submissions
-- ============================================================================

-- name: CreateSMESubmission :one
INSERT INTO sme_task_submissions (tenant_id, task_id, file_name, file_path, content_type, file_size_bytes, extracted_text, submitted_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetSMESubmissionByID :one
SELECT * FROM sme_task_submissions WHERE id = $1;

-- name: ListSMESubmissionsByTaskID :many
SELECT * FROM sme_task_submissions
WHERE task_id = $1
ORDER BY submitted_at DESC;

-- name: UpdateSMESubmission :exec
UPDATE sme_task_submissions
SET extracted_text = $1, ai_summary = $2, ingestion_error = $3, processed_at = $4,
    reviewer_notes = $5, approved_content = $6, is_approved = $7, approved_at = $8, approved_by_user_id = $9
WHERE id = $10;

-- ============================================================================
-- SME Knowledge Chunks
-- ============================================================================

-- name: CreateSMEKnowledgeChunk :one
INSERT INTO sme_knowledge_chunks (tenant_id, sme_id, submission_id, content, topic, keywords, relevance_score)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetSMEKnowledgeChunkByID :one
SELECT * FROM sme_knowledge_chunks WHERE id = $1;

-- name: ListSMEKnowledgeChunksBySMEID :many
SELECT * FROM sme_knowledge_chunks
WHERE sme_id = $1
ORDER BY relevance_score DESC;

-- name: SearchSMEKnowledgeChunks :many
SELECT * FROM sme_knowledge_chunks
WHERE sme_id = ANY(@sme_ids::uuid[])
AND (content ILIKE '%' || @query || '%' OR topic ILIKE '%' || @query || '%' OR @query = ANY(keywords))
ORDER BY relevance_score DESC
LIMIT @limit_count;

-- name: UpdateSMEKnowledgeChunk :exec
UPDATE sme_knowledge_chunks
SET content = $1, topic = $2, keywords = $3
WHERE id = $4;

-- name: DeleteSMEKnowledgeChunksBySMEID :exec
DELETE FROM sme_knowledge_chunks WHERE sme_id = $1;

-- name: DeleteSMEKnowledgeChunk :exec
DELETE FROM sme_knowledge_chunks WHERE id = $1;
