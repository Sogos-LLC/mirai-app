-- Folder CRUD operations
-- Schema: folders table with RLS isolation by tenant_id

-- name: CreateFolder :one
INSERT INTO folders (tenant_id, name, parent_id, type, team_id, user_id)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetFolderByID :one
SELECT * FROM folders WHERE id = $1;

-- name: GetFolderByTeamID :one
SELECT * FROM folders
WHERE team_id = $1 AND type = 'TEAM';

-- name: GetFolderByUserID :one
SELECT * FROM folders
WHERE user_id = $1 AND type = 'PERSONAL';

-- name: GetSharedFolder :one
SELECT * FROM folders
WHERE tenant_id = $1 AND type = 'LIBRARY' AND parent_id IS NULL
LIMIT 1;

-- name: UpdateFolder :one
UPDATE folders
SET name = $1, parent_id = $2, type = $3, team_id = $4, user_id = $5, updated_at = NOW()
WHERE id = $6
RETURNING *;

-- name: DeleteFolder :exec
DELETE FROM folders WHERE id = $1;

-- name: ListFoldersByParentID :many
-- Defense-in-depth: explicit tenant_id filter in addition to RLS
SELECT * FROM folders
WHERE tenant_id = $1 AND parent_id = $2
ORDER BY name ASC;

-- name: ListRootFolders :many
-- Defense-in-depth: explicit tenant_id filter in addition to RLS
SELECT * FROM folders
WHERE tenant_id = $1 AND parent_id IS NULL
ORDER BY name ASC;

-- name: GetFolderHierarchy :many
-- Retrieves all folders visible to a user for building nested tree.
-- Filters PERSONAL folders to only show the user's own private folder.
-- Defense-in-depth: explicit tenant_id filter in addition to RLS
SELECT * FROM folders
WHERE tenant_id = $1
  AND (type != 'PERSONAL' OR (type = 'PERSONAL' AND user_id = $2))
ORDER BY
    CASE type
        WHEN 'LIBRARY' THEN 1
        WHEN 'TEAM' THEN 2
        WHEN 'PERSONAL' THEN 3
        ELSE 4
    END,
    name ASC;
