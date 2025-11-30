package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CompanyRepository implements repository.CompanyRepository using PostgreSQL.
type CompanyRepository struct {
	db *sql.DB
}

// NewCompanyRepository creates a new PostgreSQL company repository.
func NewCompanyRepository(db *sql.DB) repository.CompanyRepository {
	return &CompanyRepository{db: db}
}

// Create creates a new company.
func (r *CompanyRepository) Create(ctx context.Context, company *entity.Company) error {
	query := `
		INSERT INTO companies (name, industry, team_size, plan, subscription_status, stripe_customer_id, stripe_subscription_id, seat_count)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query,
		company.Name,
		company.Industry,
		company.TeamSize,
		company.Plan.String(),
		company.SubscriptionStatus.String(),
		company.StripeCustomerID,
		company.StripeSubscriptionID,
		company.SeatCount,
	).Scan(&company.ID, &company.CreatedAt, &company.UpdatedAt)
	if err != nil {
		return err
	}
	return nil
}

// GetByID retrieves a company by its ID.
func (r *CompanyRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Company, error) {
	query := `
		SELECT id, name, industry, team_size, plan, stripe_customer_id, stripe_subscription_id, subscription_status, seat_count, created_at, updated_at
		FROM companies
		WHERE id = $1
	`
	company := &entity.Company{}
	var planStr, statusStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&company.ID,
		&company.Name,
		&company.Industry,
		&company.TeamSize,
		&planStr,
		&company.StripeCustomerID,
		&company.StripeSubscriptionID,
		&statusStr,
		&company.SeatCount,
		&company.CreatedAt,
		&company.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get company: %w", err)
	}
	company.Plan = valueobject.Plan(planStr)
	company.SubscriptionStatus = valueobject.SubscriptionStatus(statusStr)
	return company, nil
}

// GetByStripeCustomerID retrieves a company by its Stripe customer ID.
func (r *CompanyRepository) GetByStripeCustomerID(ctx context.Context, stripeCustomerID string) (*entity.Company, error) {
	query := `
		SELECT id, name, industry, team_size, plan, stripe_customer_id, stripe_subscription_id, subscription_status, seat_count, created_at, updated_at
		FROM companies
		WHERE stripe_customer_id = $1
	`
	company := &entity.Company{}
	var planStr, statusStr string
	err := r.db.QueryRowContext(ctx, query, stripeCustomerID).Scan(
		&company.ID,
		&company.Name,
		&company.Industry,
		&company.TeamSize,
		&planStr,
		&company.StripeCustomerID,
		&company.StripeSubscriptionID,
		&statusStr,
		&company.SeatCount,
		&company.CreatedAt,
		&company.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get company by stripe customer id: %w", err)
	}
	company.Plan = valueobject.Plan(planStr)
	company.SubscriptionStatus = valueobject.SubscriptionStatus(statusStr)
	return company, nil
}

// Update updates a company.
func (r *CompanyRepository) Update(ctx context.Context, company *entity.Company) error {
	query := `
		UPDATE companies
		SET name = $1, industry = $2, team_size = $3, plan = $4, updated_at = NOW()
		WHERE id = $5
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query, company.Name, company.Industry, company.TeamSize, company.Plan.String(), company.ID).
		Scan(&company.UpdatedAt)
}

// UpdateStripeFields updates only Stripe-related fields.
func (r *CompanyRepository) UpdateStripeFields(ctx context.Context, id uuid.UUID, fields entity.StripeFields) error {
	query := `
		UPDATE companies
		SET stripe_customer_id = $1, stripe_subscription_id = $2, subscription_status = $3, plan = $4, seat_count = $5, updated_at = NOW()
		WHERE id = $6
	`
	result, err := r.db.ExecContext(ctx, query, fields.CustomerID, fields.SubscriptionID, fields.Status.String(), fields.Plan.String(), fields.SeatCount, id)
	if err != nil {
		return fmt.Errorf("failed to update stripe fields: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("company not found")
	}
	return nil
}

// CountUsersByCompanyID counts the number of users in a company.
func (r *CompanyRepository) CountUsersByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM users WHERE company_id = $1`
	var count int
	err := r.db.QueryRowContext(ctx, query, companyID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return count, nil
}

// Delete deletes a company.
func (r *CompanyRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM companies WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete company: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("company not found")
	}
	return nil
}
