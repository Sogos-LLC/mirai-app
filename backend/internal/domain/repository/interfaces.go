package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TenantRepository defines the interface for tenant data access.
type TenantRepository interface {
	// Create creates a new tenant.
	Create(ctx context.Context, tenant *entity.Tenant) error

	// GetByID retrieves a tenant by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Tenant, error)

	// GetBySlug retrieves a tenant by its slug.
	GetBySlug(ctx context.Context, slug string) (*entity.Tenant, error)

	// Update updates a tenant.
	Update(ctx context.Context, tenant *entity.Tenant) error

	// Delete deletes a tenant.
	Delete(ctx context.Context, id uuid.UUID) error
}

// UserRepository defines the interface for user data access.
type UserRepository interface {
	// Create creates a new user.
	Create(ctx context.Context, user *entity.User) error

	// GetByID retrieves a user by their ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error)

	// GetByKratosID retrieves a user by their Kratos identity ID.
	GetByKratosID(ctx context.Context, kratosID uuid.UUID) (*entity.User, error)

	// GetOwnerByCompanyID retrieves the owner user of a company.
	GetOwnerByCompanyID(ctx context.Context, companyID uuid.UUID) (*entity.User, error)

	// ListByCompanyID retrieves all users in a company.
	ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.User, error)

	// Update updates a user.
	Update(ctx context.Context, user *entity.User) error
}

// CompanyRepository defines the interface for company data access.
type CompanyRepository interface {
	// Create creates a new company.
	Create(ctx context.Context, company *entity.Company) error

	// GetByID retrieves a company by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Company, error)

	// GetByStripeCustomerID retrieves a company by its Stripe customer ID.
	GetByStripeCustomerID(ctx context.Context, stripeCustomerID string) (*entity.Company, error)

	// Update updates a company.
	Update(ctx context.Context, company *entity.Company) error

	// UpdateStripeFields updates only Stripe-related fields.
	UpdateStripeFields(ctx context.Context, id uuid.UUID, fields entity.StripeFields) error

	// CountUsersByCompanyID counts the number of users in a company.
	CountUsersByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error)

	// Delete deletes a company.
	Delete(ctx context.Context, id uuid.UUID) error
}

// TeamRepository defines the interface for team data access.
type TeamRepository interface {
	// Create creates a new team.
	Create(ctx context.Context, team *entity.Team) error

	// GetByID retrieves a team by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Team, error)

	// ListByCompanyID retrieves all teams in a company.
	ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.Team, error)

	// Update updates a team.
	Update(ctx context.Context, team *entity.Team) error

	// Delete deletes a team.
	Delete(ctx context.Context, id uuid.UUID) error

	// AddMember adds a member to a team.
	AddMember(ctx context.Context, member *entity.TeamMember) error

	// RemoveMember removes a member from a team.
	RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error

	// ListMembers retrieves all members of a team.
	ListMembers(ctx context.Context, teamID uuid.UUID) ([]*entity.TeamMember, error)

	// GetMember retrieves a specific team member.
	GetMember(ctx context.Context, teamID, userID uuid.UUID) (*entity.TeamMember, error)
}

// InvitationRepository defines the interface for invitation data access.
type InvitationRepository interface {
	// Create creates a new invitation.
	Create(ctx context.Context, invitation *entity.Invitation) error

	// GetByID retrieves an invitation by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.Invitation, error)

	// GetByToken retrieves an invitation by its token.
	GetByToken(ctx context.Context, token string) (*entity.Invitation, error)

	// GetByEmailAndCompanyID retrieves a pending invitation by email and company.
	GetByEmailAndCompanyID(ctx context.Context, email string, companyID uuid.UUID) (*entity.Invitation, error)

	// ListByCompanyID retrieves all invitations for a company with optional status filters.
	ListByCompanyID(ctx context.Context, companyID uuid.UUID, statusFilters ...valueobject.InvitationStatus) ([]*entity.Invitation, error)

	// Update updates an invitation.
	Update(ctx context.Context, invitation *entity.Invitation) error

	// CountPendingByCompanyID counts pending invitations for a company.
	CountPendingByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error)
}

// PendingRegistrationRepository defines the interface for pending registration data access.
type PendingRegistrationRepository interface {
	// Create creates a new pending registration.
	Create(ctx context.Context, pr *entity.PendingRegistration) error

	// GetByID retrieves a pending registration by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.PendingRegistration, error)

	// GetByCheckoutSessionID retrieves a pending registration by Stripe checkout session ID.
	GetByCheckoutSessionID(ctx context.Context, sessionID string) (*entity.PendingRegistration, error)

	// GetByEmail retrieves a pending registration by email.
	GetByEmail(ctx context.Context, email string) (*entity.PendingRegistration, error)

	// ListByStatus retrieves all pending registrations with a given status.
	ListByStatus(ctx context.Context, status valueobject.PendingRegistrationStatus) ([]*entity.PendingRegistration, error)

	// Update updates a pending registration.
	Update(ctx context.Context, pr *entity.PendingRegistration) error

	// Delete deletes a pending registration.
	Delete(ctx context.Context, id uuid.UUID) error

	// DeleteExpired deletes all expired pending registrations and returns the count.
	DeleteExpired(ctx context.Context) (int64, error)

	// ExistsByEmail checks if a pending registration exists for the given email.
	ExistsByEmail(ctx context.Context, email string) (bool, error)
}
