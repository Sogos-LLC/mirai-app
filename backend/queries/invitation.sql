-- Invitation CRUD operations
-- Schema: invitations table with RLS isolation by tenant_id

-- name: CreateInvitation :one
INSERT INTO invitations (tenant_id, company_id, email, role, status, token, invited_by_user_id, expires_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING *;

-- name: GetInvitationByID :one
SELECT * FROM invitations WHERE id = $1;

-- name: GetInvitationByToken :one
SELECT * FROM invitations WHERE token = $1;

-- name: GetPendingInvitationByEmailAndCompanyID :one
SELECT * FROM invitations
WHERE email = $1 AND company_id = $2 AND status = 'pending' AND expires_at > NOW()
LIMIT 1;

-- name: ListInvitationsByCompanyID :many
SELECT * FROM invitations
WHERE company_id = $1
ORDER BY created_at DESC;

-- name: ListPendingInvitationsByCompanyID :many
SELECT * FROM invitations
WHERE company_id = $1 AND status = 'pending'
ORDER BY created_at DESC;

-- name: UpdateInvitation :one
UPDATE invitations
SET status = $1, accepted_by_user_id = $2, updated_at = NOW()
WHERE id = $3
RETURNING *;

-- name: CountPendingInvitationsByCompanyID :one
SELECT COUNT(*)::int as count FROM invitations
WHERE company_id = $1 AND status = 'pending' AND expires_at > NOW();
