-- Target Audience Template CRUD operations
-- Schema: target_audience_templates table with RLS isolation by tenant_id

-- name: CreateTargetAudienceTemplate :one
INSERT INTO target_audience_templates (tenant_id, company_id, name, description, role, experience_level, learning_goals, prerequisites, challenges, motivations, industry_context, typical_background, status, created_by_user_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
RETURNING *;

-- name: GetTargetAudienceTemplateByID :one
SELECT * FROM target_audience_templates WHERE id = $1;

-- name: ListTargetAudienceTemplates :many
SELECT * FROM target_audience_templates
ORDER BY name ASC;

-- name: UpdateTargetAudienceTemplate :one
UPDATE target_audience_templates
SET name = $1, description = $2, role = $3, experience_level = $4, learning_goals = $5, prerequisites = $6, challenges = $7, motivations = $8, industry_context = $9, typical_background = $10, status = $11, updated_at = NOW()
WHERE id = $12
RETURNING *;

-- name: DeleteTargetAudienceTemplate :exec
DELETE FROM target_audience_templates WHERE id = $1;
