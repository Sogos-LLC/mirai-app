package repository

import (
	"context"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// WizardStateRepository manages wizard state persistence.
type WizardStateRepository interface {
	// GetByUserID retrieves the wizard state for a user. Returns (nil, nil) if none exists.
	GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.WizardState, error)

	// Upsert creates or updates wizard state for a user (one per tenant+user).
	Upsert(ctx context.Context, state *entity.WizardState) (*entity.WizardState, error)

	// Delete removes wizard state for a user.
	Delete(ctx context.Context, userID uuid.UUID) error
}
