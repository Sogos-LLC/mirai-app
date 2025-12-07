package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CompanyRepository implements repository.CompanyRepository using sqlc-generated code.
type CompanyRepository struct {
	db *sql.DB
}

// NewCompanyRepository creates a new sqlc-based company repository.
func NewCompanyRepository(db *sql.DB) repository.CompanyRepository {
	return &CompanyRepository{db: db}
}

// Create creates a new company.
func (r *CompanyRepository) Create(ctx context.Context, company *entity.Company) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Company, error) {
		return q.CreateCompany(ctx, gen.CreateCompanyParams{
			TenantID:             company.TenantID,
			Name:                 company.Name,
			Industry:             toNullString(company.Industry),
			TeamSize:             toNullString(company.TeamSize),
			Plan:                 company.Plan.String(),
			SubscriptionStatus:   company.SubscriptionStatus.String(),
			StripeCustomerID:     toNullString(company.StripeCustomerID),
			StripeSubscriptionID: toNullString(company.StripeSubscriptionID),
			SeatCount:            int32(company.SeatCount),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create company: %w", err)
	}

	// Update entity with generated values
	company.ID = result.ID
	company.CreatedAt = result.CreatedAt
	company.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a company by its ID.
func (r *CompanyRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Company, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Company, error) {
		return q.GetCompanyByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get company: %w", err)
	}
	return toCompanyEntity(&result), nil
}

// GetByStripeCustomerID retrieves a company by its Stripe customer ID.
// Note: This method is called from Stripe webhooks with superadmin context
// since the webhook doesn't have tenant context.
func (r *CompanyRepository) GetByStripeCustomerID(ctx context.Context, stripeCustomerID string) (*entity.Company, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Company, error) {
		return q.GetCompanyByStripeCustomerID(ctx, sql.NullString{String: stripeCustomerID, Valid: true})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get company by stripe customer id: %w", err)
	}
	return toCompanyEntity(&result), nil
}

// Update updates a company.
func (r *CompanyRepository) Update(ctx context.Context, company *entity.Company) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Company, error) {
		return q.UpdateCompany(ctx, gen.UpdateCompanyParams{
			Name:     company.Name,
			Industry: toNullString(company.Industry),
			TeamSize: toNullString(company.TeamSize),
			Plan:     company.Plan.String(),
			ID:       company.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update company: %w", err)
	}

	// Update entity with new timestamp
	company.UpdatedAt = result.UpdatedAt
	return nil
}

// UpdateStripeFields updates only Stripe-related fields.
// Note: This method is called from Stripe webhooks with superadmin context.
func (r *CompanyRepository) UpdateStripeFields(ctx context.Context, id uuid.UUID, fields entity.StripeFields) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCompanyStripeFields(ctx, gen.UpdateCompanyStripeFieldsParams{
			StripeCustomerID:     toNullString(fields.CustomerID),
			StripeSubscriptionID: toNullString(fields.SubscriptionID),
			SubscriptionStatus:   fields.Status.String(),
			Plan:                 fields.Plan.String(),
			SeatCount:            int32(fields.SeatCount),
			ID:                   id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update stripe fields: %w", err)
	}
	return nil
}

// CountUsersByCompanyID counts the number of users in a company.
func (r *CompanyRepository) CountUsersByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountUsersByCompanyID(ctx, uuid.NullUUID{UUID: companyID, Valid: true})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count users: %w", err)
	}
	return int(count), nil
}

// Delete deletes a company.
func (r *CompanyRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteCompany(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete company: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

// toCompanyEntity converts a sqlc-generated Company to a domain entity.
func toCompanyEntity(c *gen.Company) *entity.Company {
	return &entity.Company{
		ID:                   c.ID,
		TenantID:             c.TenantID,
		Name:                 c.Name,
		Industry:             fromNullStringPtr(c.Industry),
		TeamSize:             fromNullStringPtr(c.TeamSize),
		Plan:                 valueobject.Plan(c.Plan),
		StripeCustomerID:     fromNullStringPtr(c.StripeCustomerID),
		StripeSubscriptionID: fromNullStringPtr(c.StripeSubscriptionID),
		SubscriptionStatus:   valueobject.SubscriptionStatus(c.SubscriptionStatus),
		SeatCount:            int(c.SeatCount),
		CreatedAt:            c.CreatedAt,
		UpdatedAt:            c.UpdatedAt,
	}
}
