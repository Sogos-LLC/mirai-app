package sqlc

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// PendingRegistrationRepository implements repository.PendingRegistrationRepository using sqlc-generated code.
type PendingRegistrationRepository struct {
	db *sql.DB
}

// NewPendingRegistrationRepository creates a new sqlc-based pending registration repository.
func NewPendingRegistrationRepository(db *sql.DB) repository.PendingRegistrationRepository {
	return &PendingRegistrationRepository{db: db}
}

// Create creates a new pending registration.
func (r *PendingRegistrationRepository) Create(ctx context.Context, pr *entity.PendingRegistration) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.PendingRegistration, error) {
		return q.CreatePendingRegistration(ctx, gen.CreatePendingRegistrationParams{
			CheckoutSessionID: pr.CheckoutSessionID,
			Email:             pr.Email,
			PasswordEncrypted: pr.PasswordEncrypted,
			FirstName:         pr.FirstName,
			LastName:          pr.LastName,
			CompanyName:       pr.CompanyName,
			Industry:          toNullString(pr.Industry),
			TeamSize:          toNullString(pr.TeamSize),
			Plan:              pr.Plan.String(),
			SeatCount:         int32(pr.SeatCount),
			Status:            pr.Status.String(),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create pending registration: %w", err)
	}

	pr.ID = result.ID
	pr.CreatedAt = result.CreatedAt
	pr.ExpiresAt = result.ExpiresAt
	pr.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a pending registration by its ID.
func (r *PendingRegistrationRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.PendingRegistration, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.PendingRegistration, error) {
		return q.GetPendingRegistrationByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get pending registration: %w", err)
	}
	return toPendingRegistrationEntity(&result), nil
}

// GetByCheckoutSessionID retrieves a pending registration by Stripe checkout session ID.
func (r *PendingRegistrationRepository) GetByCheckoutSessionID(ctx context.Context, sessionID string) (*entity.PendingRegistration, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.PendingRegistration, error) {
		return q.GetPendingRegistrationByCheckoutSessionID(ctx, sessionID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get pending registration: %w", err)
	}
	return toPendingRegistrationEntity(&result), nil
}

// GetByEmail retrieves a pending registration by email.
func (r *PendingRegistrationRepository) GetByEmail(ctx context.Context, email string) (*entity.PendingRegistration, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.PendingRegistration, error) {
		return q.GetPendingRegistrationByEmail(ctx, email)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get pending registration: %w", err)
	}
	return toPendingRegistrationEntity(&result), nil
}

// ListByStatus retrieves all pending registrations with a given status.
func (r *PendingRegistrationRepository) ListByStatus(ctx context.Context, status valueobject.PendingRegistrationStatus) ([]*entity.PendingRegistration, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.PendingRegistration, error) {
		return q.ListPendingRegistrationsByStatus(ctx, status.String())
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list pending registrations: %w", err)
	}

	prs := make([]*entity.PendingRegistration, len(results))
	for i := range results {
		prs[i] = toPendingRegistrationEntity(&results[i])
	}
	return prs, nil
}

// FindStuckPaid finds registrations that are stuck in "paid" status for longer than the given duration.
func (r *PendingRegistrationRepository) FindStuckPaid(ctx context.Context, olderThan time.Duration) ([]*entity.PendingRegistration, error) {
	cutoff := time.Now().Add(-olderThan)
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.PendingRegistration, error) {
		return q.FindStuckPaidRegistrations(ctx, cutoff)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to find stuck paid registrations: %w", err)
	}

	prs := make([]*entity.PendingRegistration, len(results))
	for i := range results {
		prs[i] = toPendingRegistrationEntity(&results[i])
	}
	return prs, nil
}

// Update updates a pending registration.
func (r *PendingRegistrationRepository) Update(ctx context.Context, pr *entity.PendingRegistration) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.PendingRegistration, error) {
		return q.UpdatePendingRegistration(ctx, gen.UpdatePendingRegistrationParams{
			Status:               pr.Status.String(),
			StripeCustomerID:     toNullString(pr.StripeCustomerID),
			StripeSubscriptionID: toNullString(pr.StripeSubscriptionID),
			SeatCount:            int32(pr.SeatCount),
			ErrorMessage:         toNullString(pr.ErrorMessage),
			ID:                   pr.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update pending registration: %w", err)
	}

	pr.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a pending registration.
func (r *PendingRegistrationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeletePendingRegistration(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete pending registration: %w", err)
	}
	return nil
}

// DeleteExpired deletes all expired pending registrations and returns the count.
func (r *PendingRegistrationRepository) DeleteExpired(ctx context.Context) (int64, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int64, error) {
		return q.DeleteExpiredPendingRegistrations(ctx)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to delete expired pending registrations: %w", err)
	}
	return count, nil
}

// ExistsByEmail checks if a pending registration exists for the given email.
func (r *PendingRegistrationRepository) ExistsByEmail(ctx context.Context, email string) (bool, error) {
	exists, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (bool, error) {
		return q.ExistsPendingRegistrationByEmail(ctx, email)
	})
	if err != nil {
		return false, fmt.Errorf("failed to check email existence: %w", err)
	}
	return exists, nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toPendingRegistrationEntity(pr *gen.PendingRegistration) *entity.PendingRegistration {
	return &entity.PendingRegistration{
		ID:                   pr.ID,
		CheckoutSessionID:    pr.CheckoutSessionID,
		Email:                pr.Email,
		PasswordEncrypted:    pr.PasswordEncrypted,
		FirstName:            pr.FirstName,
		LastName:             pr.LastName,
		CompanyName:          pr.CompanyName,
		Industry:             fromNullStringPtr(pr.Industry),
		TeamSize:             fromNullStringPtr(pr.TeamSize),
		Plan:                 valueobject.Plan(pr.Plan),
		SeatCount:            int(pr.SeatCount),
		Status:               valueobject.PendingRegistrationStatus(pr.Status),
		StripeCustomerID:     fromNullStringPtr(pr.StripeCustomerID),
		StripeSubscriptionID: fromNullStringPtr(pr.StripeSubscriptionID),
		ErrorMessage:         fromNullStringPtr(pr.ErrorMessage),
		CreatedAt:            pr.CreatedAt,
		ExpiresAt:            pr.ExpiresAt,
		UpdatedAt:            pr.UpdatedAt,
	}
}
