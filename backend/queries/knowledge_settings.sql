-- Tenant Knowledge Settings CRUD operations
-- Schema: tenant_knowledge_settings table with RLS isolation by tenant_id

-- name: GetTenantKnowledgeSettings :one
SELECT * FROM tenant_knowledge_settings WHERE tenant_id = $1;

-- name: CreateTenantKnowledgeSettings :one
INSERT INTO tenant_knowledge_settings (
    tenant_id,
    allow_global_knowledge,
    low_grounding_threshold,
    enforce_internal_only,
    require_curriculum_approval,
    updated_by_user_id
)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateTenantKnowledgeSettings :one
UPDATE tenant_knowledge_settings
SET
    allow_global_knowledge = $1,
    low_grounding_threshold = $2,
    enforce_internal_only = $3,
    require_curriculum_approval = $4,
    updated_at = NOW(),
    updated_by_user_id = $5
WHERE tenant_id = $6
RETURNING *;
