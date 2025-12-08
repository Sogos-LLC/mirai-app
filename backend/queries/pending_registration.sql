-- Pending Registration CRUD operations
-- Schema: pending_registrations table (accessible only to superadmins)

-- name: CreatePendingRegistration :one
INSERT INTO pending_registrations (
    checkout_session_id, email, password_encrypted, first_name, last_name,
    company_name, industry, team_size, plan, seat_count, status
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetPendingRegistrationByID :one
SELECT * FROM pending_registrations WHERE id = $1;

-- name: GetPendingRegistrationByCheckoutSessionID :one
SELECT * FROM pending_registrations WHERE checkout_session_id = $1;

-- name: GetPendingRegistrationByEmail :one
SELECT * FROM pending_registrations
WHERE email = $1 AND status IN ('pending', 'paid')
ORDER BY created_at DESC
LIMIT 1;

-- name: ListPendingRegistrationsByStatus :many
SELECT * FROM pending_registrations
WHERE status = $1 AND expires_at > NOW()
ORDER BY created_at ASC;

-- name: FindStuckPaidRegistrations :many
-- Find registrations stuck in "paid" status older than cutoff time
SELECT * FROM pending_registrations
WHERE status = 'paid' AND updated_at < $1
ORDER BY updated_at ASC;

-- name: UpdatePendingRegistration :one
UPDATE pending_registrations
SET status = $1, stripe_customer_id = $2, stripe_subscription_id = $3,
    seat_count = $4, error_message = $5, updated_at = NOW()
WHERE id = $6
RETURNING *;

-- name: DeletePendingRegistration :exec
DELETE FROM pending_registrations WHERE id = $1;

-- name: DeleteExpiredPendingRegistrations :execrows
DELETE FROM pending_registrations WHERE expires_at < NOW() AND status = 'pending';

-- name: ExistsPendingRegistrationByEmail :one
SELECT EXISTS(SELECT 1 FROM pending_registrations WHERE email = $1 AND status IN ('pending', 'paid') AND expires_at > NOW()) as exists;
