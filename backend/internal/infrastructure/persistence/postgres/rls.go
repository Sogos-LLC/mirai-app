package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/sogos/mirai-backend/internal/domain/tenant"
)

// SetTenantContext sets PostgreSQL session variables for Row-Level Security.
// This should be called within a transaction to ensure the settings apply
// only to that transaction's queries (using SET LOCAL).
//
// The function sets:
// - app.tenant_id: The tenant ID for RLS filtering
// - app.is_superadmin: Whether to bypass RLS policies
//
// These variables are read by PostgreSQL RLS policy functions:
// - current_tenant_id() -> returns app.tenant_id
// - is_superadmin() -> returns app.is_superadmin
func SetTenantContext(ctx context.Context, tx *sql.Tx) error {
	// Set tenant ID if present in context
	if tenantID, ok := tenant.FromContext(ctx); ok {
		_, err := tx.ExecContext(ctx, fmt.Sprintf("SET LOCAL app.tenant_id = '%s'", tenantID.String()))
		if err != nil {
			return fmt.Errorf("failed to set tenant_id: %w", err)
		}
	}

	// Set superadmin flag if present
	if tenant.IsSuperAdmin(ctx) {
		_, err := tx.ExecContext(ctx, "SET LOCAL app.is_superadmin = 'true'")
		if err != nil {
			return fmt.Errorf("failed to set is_superadmin: %w", err)
		}
	}

	return nil
}

// RLSExec executes a function within a transaction with RLS context set.
// This is a convenience wrapper that handles transaction lifecycle and
// sets the tenant context before executing the provided function.
func RLSExec(ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) error) error {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := SetTenantContext(ctx, tx); err != nil {
		return err
	}

	if err := fn(tx); err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	return nil
}

// RLSQuery executes a query function within a transaction with RLS context set
// and returns a result. This is similar to RLSExec but allows returning a value.
func RLSQuery[T any](ctx context.Context, db *sql.DB, fn func(tx *sql.Tx) (T, error)) (T, error) {
	var result T

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return result, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	if err := SetTenantContext(ctx, tx); err != nil {
		return result, err
	}

	result, err = fn(tx)
	if err != nil {
		return result, err
	}

	if err := tx.Commit(); err != nil {
		return result, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return result, nil
}
