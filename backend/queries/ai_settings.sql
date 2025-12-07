-- Tenant AI Settings CRUD operations
-- Schema: tenant_ai_settings table with RLS isolation by tenant_id

-- name: GetTenantAISettings :one
SELECT * FROM tenant_ai_settings WHERE tenant_id = $1;

-- name: CreateTenantAISettings :one
INSERT INTO tenant_ai_settings (tenant_id, provider, encrypted_api_key, monthly_token_limit, updated_by_user_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpdateTenantAISettings :one
UPDATE tenant_ai_settings
SET provider = $1, encrypted_api_key = $2, monthly_token_limit = $3, updated_at = NOW(), updated_by_user_id = $4
WHERE tenant_id = $5
RETURNING *;

-- name: IncrementTenantAITokenUsage :exec
UPDATE tenant_ai_settings
SET total_tokens_used = total_tokens_used + $1, updated_at = NOW()
WHERE tenant_id = $2;
