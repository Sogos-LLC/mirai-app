package tenant

import (
	"context"

	"github.com/google/uuid"
)

// Context keys for tenant information
type tenantIDKey struct{}
type superAdminKey struct{}

// WithTenantID adds a tenant ID to the context.
// This should be called after authenticating a user to enable RLS filtering.
func WithTenantID(ctx context.Context, tenantID uuid.UUID) context.Context {
	return context.WithValue(ctx, tenantIDKey{}, tenantID)
}

// FromContext extracts the tenant ID from the context.
// Returns the tenant ID and true if present, or uuid.Nil and false if not.
func FromContext(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(tenantIDKey{}).(uuid.UUID)
	return id, ok
}

// MustFromContext extracts the tenant ID from the context.
// Panics if the tenant ID is not present.
func MustFromContext(ctx context.Context) uuid.UUID {
	id, ok := FromContext(ctx)
	if !ok {
		panic("tenant ID not found in context")
	}
	return id
}

// WithSuperAdmin marks the context as having super admin privileges.
// This bypasses RLS policies for administrative operations.
func WithSuperAdmin(ctx context.Context, isSuperAdmin bool) context.Context {
	return context.WithValue(ctx, superAdminKey{}, isSuperAdmin)
}

// IsSuperAdmin returns true if the context has super admin privileges.
func IsSuperAdmin(ctx context.Context) bool {
	val, ok := ctx.Value(superAdminKey{}).(bool)
	return ok && val
}
