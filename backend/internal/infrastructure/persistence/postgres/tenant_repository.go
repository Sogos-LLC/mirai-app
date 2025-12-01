package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
)

// TenantRepository implements repository.TenantRepository using PostgreSQL.
type TenantRepository struct {
	db *sql.DB
}

// NewTenantRepository creates a new PostgreSQL tenant repository.
func NewTenantRepository(db *sql.DB) repository.TenantRepository {
	return &TenantRepository{db: db}
}

// Create creates a new tenant.
// Note: Tenant creation does not use RLS as tenants are the root of the isolation boundary.
func (r *TenantRepository) Create(ctx context.Context, t *entity.Tenant) error {
	query := `
		INSERT INTO tenants (name, slug, status)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`
	err := r.db.QueryRowContext(ctx, query, t.Name, t.Slug, t.Status.String()).
		Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return fmt.Errorf("failed to create tenant: %w", err)
	}
	return nil
}

// GetByID retrieves a tenant by its ID.
func (r *TenantRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Tenant, error) {
	query := `
		SELECT id, name, slug, status, created_at, updated_at
		FROM tenants
		WHERE id = $1
	`
	t := &entity.Tenant{}
	var statusStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&t.ID,
		&t.Name,
		&t.Slug,
		&statusStr,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant: %w", err)
	}
	t.Status = entity.TenantStatus(statusStr)
	return t, nil
}

// GetBySlug retrieves a tenant by its slug.
func (r *TenantRepository) GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error) {
	query := `
		SELECT id, name, slug, status, created_at, updated_at
		FROM tenants
		WHERE slug = $1
	`
	t := &entity.Tenant{}
	var statusStr string
	err := r.db.QueryRowContext(ctx, query, slug).Scan(
		&t.ID,
		&t.Name,
		&t.Slug,
		&statusStr,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get tenant by slug: %w", err)
	}
	t.Status = entity.TenantStatus(statusStr)
	return t, nil
}

// Update updates a tenant.
func (r *TenantRepository) Update(ctx context.Context, t *entity.Tenant) error {
	query := `
		UPDATE tenants
		SET name = $1, slug = $2, status = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING updated_at
	`
	err := r.db.QueryRowContext(ctx, query, t.Name, t.Slug, t.Status.String(), t.ID).
		Scan(&t.UpdatedAt)
	if err == sql.ErrNoRows {
		return fmt.Errorf("tenant not found")
	}
	if err != nil {
		return fmt.Errorf("failed to update tenant: %w", err)
	}
	return nil
}

// Delete deletes a tenant.
func (r *TenantRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM tenants WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete tenant: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("tenant not found")
	}
	return nil
}
