package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// WizardStateRepository defines the interface for wizard state data access.
type WizardStateRepository interface {
	// GetByUserID retrieves the wizard state for a specific user.
	// Returns nil, nil if no state exists.
	GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.WizardState, error)

	// Upsert creates or updates wizard state for a user.
	// Uses ON CONFLICT to handle the unique constraint on (tenant_id, user_id).
	Upsert(ctx context.Context, state *entity.WizardState) error

	// Update updates an existing wizard state.
	Update(ctx context.Context, state *entity.WizardState) error

	// Delete removes wizard state for a user.
	// Called after course creation or cancellation.
	Delete(ctx context.Context, userID uuid.UUID) error

	// DeleteByID removes wizard state by ID.
	DeleteByID(ctx context.Context, id uuid.UUID) error
}
