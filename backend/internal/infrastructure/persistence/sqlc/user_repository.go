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

// UserRepository implements repository.UserRepository using sqlc-generated code.
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new sqlc-based user repository.
func NewUserRepository(db *sql.DB) repository.UserRepository {
	return &UserRepository{db: db}
}

// Create creates a new user.
func (r *UserRepository) Create(ctx context.Context, user *entity.User) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.User, error) {
		return q.CreateUser(ctx, gen.CreateUserParams{
			TenantID:  ptrToUUID(user.TenantID),
			KratosID:  user.KratosID,
			CompanyID: toNullUUID(user.CompanyID),
			Role:      user.Role.String(),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}

	// Update entity with generated values
	user.ID = result.ID
	user.CreatedAt = result.CreatedAt
	user.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a user by their ID.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.User, error) {
		return q.GetUserByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return toUserEntity(&result), nil
}

// GetByKratosID retrieves a user by their Kratos identity ID.
// Note: This method is called by the auth interceptor with superadmin context
// to look up users before tenant context is established.
func (r *UserRepository) GetByKratosID(ctx context.Context, kratosID uuid.UUID) (*entity.User, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.User, error) {
		return q.GetUserByKratosID(ctx, kratosID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return toUserEntity(&result), nil
}

// GetOwnerByCompanyID retrieves the admin user of a company.
func (r *UserRepository) GetOwnerByCompanyID(ctx context.Context, companyID uuid.UUID) (*entity.User, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.User, error) {
		return q.GetOwnerByCompanyID(ctx, uuid.NullUUID{UUID: companyID, Valid: true})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get owner: %w", err)
	}
	return toUserEntity(&result), nil
}

// ListByCompanyID retrieves all users in a company.
func (r *UserRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.User, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.User, error) {
		return q.ListUsersByCompanyID(ctx, uuid.NullUUID{UUID: companyID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}

	users := make([]*entity.User, len(results))
	for i := range results {
		users[i] = toUserEntity(&results[i])
	}
	return users, nil
}

// Update updates a user.
func (r *UserRepository) Update(ctx context.Context, user *entity.User) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.User, error) {
		return q.UpdateUser(ctx, gen.UpdateUserParams{
			CompanyID: toNullUUID(user.CompanyID),
			Role:      user.Role.String(),
			ID:        user.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	// Update entity with new timestamp
	user.UpdatedAt = result.UpdatedAt
	return nil
}

// GetCRMContactID retrieves the CRM contact ID for a user.
func (r *UserRepository) GetCRMContactID(ctx context.Context, id uuid.UUID) (string, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (sql.NullString, error) {
		return q.GetUserCRMContactID(ctx, id)
	})
	if err != nil {
		return "", fmt.Errorf("failed to get CRM contact ID: %w", err)
	}
	if !result.Valid {
		return "", nil
	}
	return result.String, nil
}

// UpdateCRMContactID updates the CRM contact ID for a user.
func (r *UserRepository) UpdateCRMContactID(ctx context.Context, id uuid.UUID, crmContactID string) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateUserCRMContactID(ctx, gen.UpdateUserCRMContactIDParams{
			CrmContactID: sql.NullString{String: crmContactID, Valid: true},
			ID:           id,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update CRM contact ID: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

// toUserEntity converts a sqlc-generated User to a domain entity.
func toUserEntity(u *gen.User) *entity.User {
	return &entity.User{
		ID:        u.ID,
		TenantID:  &u.TenantID,
		KratosID:  u.KratosID,
		CompanyID: fromNullUUIDPtr(u.CompanyID),
		Role:      valueobject.Role(u.Role),
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

// ptrToUUID converts a *uuid.UUID to uuid.UUID, returning zero UUID if nil.
func ptrToUUID(u *uuid.UUID) uuid.UUID {
	if u == nil {
		return uuid.UUID{}
	}
	return *u
}
