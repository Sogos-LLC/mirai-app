-- Tenant CRUD operations
-- Schema: tenants table

-- name: CreateTenant :one
INSERT INTO tenants (name, slug, status)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetTenantByID :one
SELECT * FROM tenants WHERE id = $1;

-- name: GetTenantBySlug :one
SELECT * FROM tenants WHERE slug = $1;

-- name: UpdateTenant :one
UPDATE tenants
SET name = $1, slug = $2, status = $3, updated_at = NOW()
WHERE id = $4
RETURNING *;

-- name: DeleteTenant :exec
DELETE FROM tenants WHERE id = $1;
