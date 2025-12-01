package entity

import (
	"time"

	"github.com/google/uuid"
)

// TenantStatus represents the state of a tenant.
type TenantStatus string

const (
	TenantStatusActive    TenantStatus = "active"
	TenantStatusSuspended TenantStatus = "suspended"
)

// IsValid checks if the tenant status is a valid value.
func (s TenantStatus) IsValid() bool {
	switch s {
	case TenantStatusActive, TenantStatusSuspended:
		return true
	}
	return false
}

// String returns the string representation of the tenant status.
func (s TenantStatus) String() string {
	return string(s)
}

// Tenant represents a top-level organizational boundary.
// Multiple companies can belong to a single tenant.
type Tenant struct {
	ID        uuid.UUID
	Name      string
	Slug      string
	Status    TenantStatus
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IsActive returns true if the tenant is active.
func (t *Tenant) IsActive() bool {
	return t.Status == TenantStatusActive
}

// IsSuspended returns true if the tenant is suspended.
func (t *Tenant) IsSuspended() bool {
	return t.Status == TenantStatusSuspended
}
