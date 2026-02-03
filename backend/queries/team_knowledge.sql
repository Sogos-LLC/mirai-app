-- Team knowledge source operations
-- Schema: knowledge_sources table with team_id for team-level knowledge

-- name: CreateTeamKnowledgeSource :one
-- Create a team-level knowledge source
INSERT INTO knowledge_sources (
    id,
    tenant_id,
    team_id,
    type,
    status,
    name,
    file_path,
    mime_type,
    file_size_bytes,
    content_hash
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
RETURNING *;

-- name: GetKnowledgeSourceByIDForTeam :one
-- Get a knowledge source by ID (used for team knowledge operations)
SELECT * FROM knowledge_sources WHERE id = $1;

-- name: ListKnowledgeSourcesByTeam :many
-- List all knowledge sources for a team
SELECT * FROM knowledge_sources
WHERE team_id = $1
ORDER BY created_at DESC;

-- name: GetReadySourcesByTeam :many
-- Get only ready sources for a team
SELECT * FROM knowledge_sources
WHERE team_id = $1 AND status = 'ready'
ORDER BY created_at ASC;

-- name: CountKnowledgeSourcesByTeam :one
-- Count sources for a team
SELECT COUNT(*)::int as count FROM knowledge_sources WHERE team_id = $1;

-- name: SumTokenCountByTeam :one
-- Sum token count for all ready sources in a team
SELECT COALESCE(SUM(token_count), 0)::bigint as total
FROM knowledge_sources
WHERE team_id = $1 AND status = 'ready';

-- name: DeleteKnowledgeSourcesByTeam :exec
-- Delete all knowledge sources for a team
DELETE FROM knowledge_sources WHERE team_id = $1;

-- name: ListGlobalKnowledgeSources :many
-- List all global knowledge sources (team_id IS NULL)
SELECT * FROM knowledge_sources
WHERE team_id IS NULL
ORDER BY created_at DESC;

-- name: GetReadyGlobalSources :many
-- Get only ready global sources (team_id IS NULL)
SELECT * FROM knowledge_sources
WHERE team_id IS NULL AND status = 'ready'
ORDER BY created_at ASC;

-- name: SumTokenCountGlobal :one
-- Sum token count for all ready global sources
SELECT COALESCE(SUM(token_count), 0)::bigint as total
FROM knowledge_sources
WHERE team_id IS NULL AND status = 'ready';

-- name: FindKnowledgeSourceByContentHash :one
-- Find a knowledge source by content hash (for duplicate detection)
-- Returns the first match across all scopes (global and team)
SELECT * FROM knowledge_sources
WHERE content_hash = $1
LIMIT 1;

-- name: UpdateKnowledgeSourceContentHash :exec
-- Update the content hash for a knowledge source
UPDATE knowledge_sources
SET content_hash = $2, updated_at = NOW()
WHERE id = $1;
