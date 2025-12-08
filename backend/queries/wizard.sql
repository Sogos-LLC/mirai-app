-- Wizard state CRUD operations
-- Schema: wizard_states table with RLS isolation by tenant_id
-- Each user can have only one active wizard state at a time

-- name: GetWizardStateByUserID :one
-- Retrieves the wizard state for a specific user
SELECT * FROM wizard_states WHERE user_id = $1;

-- name: UpsertWizardState :one
-- Creates or updates wizard state for a user
-- Uses ON CONFLICT to handle the unique constraint on (tenant_id, user_id)
INSERT INTO wizard_states (id, tenant_id, user_id, current_step, data, created_at, updated_at)
VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
ON CONFLICT (tenant_id, user_id) DO UPDATE SET
    current_step = EXCLUDED.current_step,
    data = EXCLUDED.data,
    updated_at = NOW()
RETURNING *;

-- name: UpdateWizardState :one
-- Updates an existing wizard state
UPDATE wizard_states
SET current_step = $2,
    data = $3,
    updated_at = NOW()
WHERE user_id = $1
RETURNING *;

-- name: DeleteWizardState :exec
-- Removes wizard state for a user (called after course creation or cancellation)
DELETE FROM wizard_states WHERE user_id = $1;

-- name: DeleteWizardStateByID :exec
-- Removes wizard state by ID
DELETE FROM wizard_states WHERE id = $1;

-- name: ListWizardStatesByTenant :many
-- Admin query to list all wizard states for a tenant
SELECT * FROM wizard_states
WHERE tenant_id = $1
ORDER BY updated_at DESC;

-- name: CountActiveWizards :one
-- Count active wizards for a tenant (for analytics)
SELECT COUNT(*)::int as count FROM wizard_states
WHERE tenant_id = $1;
