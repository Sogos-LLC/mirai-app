-- User CRUD operations
-- Schema: users table with RLS isolation by tenant_id

-- name: CreateUser :one
INSERT INTO users (tenant_id, kratos_id, company_id, role)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByKratosID :one
SELECT * FROM users WHERE kratos_id = $1;

-- name: GetOwnerByCompanyID :one
-- Note: This looks for 'admin' role instead of deprecated 'owner'
SELECT * FROM users
WHERE company_id = $1 AND role = 'admin'
LIMIT 1;

-- name: ListUsersByCompanyID :many
SELECT * FROM users
WHERE company_id = $1
ORDER BY created_at DESC;

-- name: UpdateUser :one
UPDATE users
SET company_id = $1, role = $2, updated_at = NOW()
WHERE id = $3
RETURNING *;

-- name: GetUserCRMContactID :one
SELECT crm_contact_id FROM users WHERE id = $1;

-- name: UpdateUserCRMContactID :exec
UPDATE users SET crm_contact_id = $1, updated_at = NOW() WHERE id = $2;
