-- Team and TeamMember CRUD operations
-- Schema: teams and team_members tables with RLS isolation by tenant_id

-- name: CreateTeam :one
INSERT INTO teams (tenant_id, company_id, name, description)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetTeamByID :one
SELECT * FROM teams WHERE id = $1;

-- name: ListTeamsByCompanyID :many
SELECT * FROM teams
WHERE company_id = $1
ORDER BY created_at DESC;

-- name: UpdateTeam :one
UPDATE teams
SET name = $1, description = $2, updated_at = NOW()
WHERE id = $3
RETURNING *;

-- name: DeleteTeam :exec
DELETE FROM teams WHERE id = $1;

-- Team Members

-- name: AddTeamMember :one
INSERT INTO team_members (tenant_id, team_id, user_id, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: RemoveTeamMember :exec
DELETE FROM team_members WHERE team_id = $1 AND user_id = $2;

-- name: ListTeamMembers :many
SELECT * FROM team_members
WHERE team_id = $1
ORDER BY created_at DESC;

-- name: GetTeamMember :one
SELECT * FROM team_members
WHERE team_id = $1 AND user_id = $2;
