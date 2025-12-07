-- Company CRUD operations
-- Schema: companies table with RLS isolation by tenant_id

-- name: CreateCompany :one
INSERT INTO companies (tenant_id, name, industry, team_size, plan, subscription_status, stripe_customer_id, stripe_subscription_id, seat_count)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: GetCompanyByID :one
SELECT * FROM companies WHERE id = $1;

-- name: GetCompanyByStripeCustomerID :one
SELECT * FROM companies WHERE stripe_customer_id = $1;

-- name: UpdateCompany :one
UPDATE companies
SET name = $1, industry = $2, team_size = $3, plan = $4, updated_at = NOW()
WHERE id = $5
RETURNING *;

-- name: UpdateCompanyStripeFields :exec
UPDATE companies
SET stripe_customer_id = $1, stripe_subscription_id = $2, subscription_status = $3, plan = $4, seat_count = $5, updated_at = NOW()
WHERE id = $6;

-- name: CountUsersByCompanyID :one
SELECT COUNT(*)::int as count FROM users WHERE company_id = $1;

-- name: DeleteCompany :exec
DELETE FROM companies WHERE id = $1;
