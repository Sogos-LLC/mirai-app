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
)

// TenantRepository implements repository.TenantRepository using sqlc-generated code.
type TenantRepository struct {
	db *sql.DB
}

// NewTenantRepository creates a new sqlc-based tenant repository.
func NewTenantRepository(db *sql.DB) repository.TenantRepository {
	return &TenantRepository{db: db}
}

// Create creates a new tenant.
func (r *TenantRepository) Create(ctx context.Context, tenant *entity.Tenant) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Tenant, error) {
		return q.CreateTenant(ctx, gen.CreateTenantParams{
			Name:   tenant.Name,
			Slug:   tenant.Slug,
			Status: tenant.Status.String(),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create tenant: %w", err)
	}

	tenant.ID = result.ID
	tenant.CreatedAt = result.CreatedAt
	tenant.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a tenant by its ID.
func (r *TenantRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Tenant, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Tenant, error) {
		return q.GetTenantByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant: %w", err)
	}
	return toTenantEntity(&result), nil
}

// GetBySlug retrieves a tenant by its slug.
func (r *TenantRepository) GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Tenant, error) {
		return q.GetTenantBySlug(ctx, slug)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant by slug: %w", err)
	}
	return toTenantEntity(&result), nil
}

// Update updates a tenant.
func (r *TenantRepository) Update(ctx context.Context, tenant *entity.Tenant) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Tenant, error) {
		return q.UpdateTenant(ctx, gen.UpdateTenantParams{
			Name:   tenant.Name,
			Slug:   tenant.Slug,
			Status: tenant.Status.String(),
			ID:     tenant.ID,
		})
	})
	if err == sql.ErrNoRows {
		return fmt.Errorf("tenant not found")
	}
	if err != nil {
		return fmt.Errorf("failed to update tenant: %w", err)
	}

	tenant.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a tenant.
func (r *TenantRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteTenant(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete tenant: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toTenantEntity(t *gen.Tenant) *entity.Tenant {
	return &entity.Tenant{
		ID:        t.ID,
		Name:      t.Name,
		Slug:      t.Slug,
		Status:    entity.TenantStatus(t.Status),
		CreatedAt: t.CreatedAt,
		UpdatedAt: t.UpdatedAt,
	}
}
