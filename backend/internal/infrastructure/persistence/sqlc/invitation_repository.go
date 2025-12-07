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

// InvitationRepository implements repository.InvitationRepository using sqlc-generated code.
type InvitationRepository struct {
	db *sql.DB
}

// NewInvitationRepository creates a new sqlc-based invitation repository.
func NewInvitationRepository(db *sql.DB) repository.InvitationRepository {
	return &InvitationRepository{db: db}
}

// Create creates a new invitation.
func (r *InvitationRepository) Create(ctx context.Context, inv *entity.Invitation) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Invitation, error) {
		return q.CreateInvitation(ctx, gen.CreateInvitationParams{
			TenantID:        inv.TenantID,
			CompanyID:       inv.CompanyID,
			Email:           inv.Email,
			Role:            inv.Role.String(),
			Status:          inv.Status.String(),
			Token:           inv.Token,
			InvitedByUserID: uuid.NullUUID{UUID: inv.InvitedByUserID, Valid: true},
			ExpiresAt:       inv.ExpiresAt,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create invitation: %w", err)
	}

	inv.ID = result.ID
	inv.CreatedAt = result.CreatedAt
	inv.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves an invitation by its ID.
func (r *InvitationRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Invitation, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Invitation, error) {
		return q.GetInvitationByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}
	return toInvitationEntity(&result), nil
}

// GetByToken retrieves an invitation by its token.
func (r *InvitationRepository) GetByToken(ctx context.Context, token string) (*entity.Invitation, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Invitation, error) {
		return q.GetInvitationByToken(ctx, token)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation by token: %w", err)
	}
	return toInvitationEntity(&result), nil
}

// GetByEmailAndCompanyID retrieves a pending invitation by email and company.
func (r *InvitationRepository) GetByEmailAndCompanyID(ctx context.Context, email string, companyID uuid.UUID) (*entity.Invitation, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Invitation, error) {
		return q.GetPendingInvitationByEmailAndCompanyID(ctx, gen.GetPendingInvitationByEmailAndCompanyIDParams{
			Email:     email,
			CompanyID: companyID,
		})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}
	return toInvitationEntity(&result), nil
}

// ListByCompanyID retrieves all invitations for a company with optional status filters.
func (r *InvitationRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID, statusFilters ...valueobject.InvitationStatus) ([]*entity.Invitation, error) {
	var results []gen.Invitation
	var err error

	if len(statusFilters) == 1 && statusFilters[0] == valueobject.InvitationStatusPending {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Invitation, error) {
			return q.ListPendingInvitationsByCompanyID(ctx, companyID)
		})
	} else {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Invitation, error) {
			return q.ListInvitationsByCompanyID(ctx, companyID)
		})
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list invitations: %w", err)
	}

	// Filter by status if multiple filters provided
	invitations := make([]*entity.Invitation, 0, len(results))
	statusSet := make(map[string]bool)
	for _, s := range statusFilters {
		statusSet[s.String()] = true
	}

	for i := range results {
		inv := toInvitationEntity(&results[i])
		if len(statusFilters) == 0 || statusSet[inv.Status.String()] {
			invitations = append(invitations, inv)
		}
	}
	return invitations, nil
}

// Update updates an invitation.
func (r *InvitationRepository) Update(ctx context.Context, inv *entity.Invitation) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Invitation, error) {
		return q.UpdateInvitation(ctx, gen.UpdateInvitationParams{
			Status:           inv.Status.String(),
			AcceptedByUserID: toNullUUID(inv.AcceptedByUserID),
			ID:               inv.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update invitation: %w", err)
	}

	inv.UpdatedAt = result.UpdatedAt
	return nil
}

// CountPendingByCompanyID counts pending invitations for a company.
func (r *InvitationRepository) CountPendingByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountPendingInvitationsByCompanyID(ctx, companyID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count pending invitations: %w", err)
	}
	return int(count), nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toInvitationEntity(i *gen.Invitation) *entity.Invitation {
	return &entity.Invitation{
		ID:               i.ID,
		TenantID:         i.TenantID,
		CompanyID:        i.CompanyID,
		Email:            i.Email,
		Role:             valueobject.Role(i.Role),
		Status:           valueobject.InvitationStatus(i.Status),
		Token:            i.Token,
		InvitedByUserID:  fromNullUUID(i.InvitedByUserID),
		AcceptedByUserID: fromNullUUIDPtr(i.AcceptedByUserID),
		ExpiresAt:        i.ExpiresAt,
		CreatedAt:        i.CreatedAt,
		UpdatedAt:        i.UpdatedAt,
	}
}
