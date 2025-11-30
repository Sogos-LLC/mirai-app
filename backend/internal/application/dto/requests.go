package dto

import (
	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// RegisterRequest contains all data needed to register a new user and company.
type RegisterRequest struct {
	// User credentials
	Email     string `json:"email" binding:"required,email"`
	Password  string `json:"password" binding:"required,min=8"`
	FirstName string `json:"first_name" binding:"required,min=1"`
	LastName  string `json:"last_name" binding:"required,min=1"`

	// Company info
	CompanyName string `json:"company_name" binding:"required,min=1,max=200"`
	Industry    string `json:"industry,omitempty"`
	TeamSize    string `json:"team_size,omitempty"`

	// Plan selection
	Plan      valueobject.Plan `json:"plan" binding:"required"`
	SeatCount int              `json:"seat_count,omitempty"`
}

// OnboardRequest represents the onboarding payload.
type OnboardRequest struct {
	CompanyName string           `json:"company_name" binding:"required,min=1,max=200"`
	Industry    string           `json:"industry,omitempty"`
	TeamSize    string           `json:"team_size,omitempty"`
	Plan        valueobject.Plan `json:"plan" binding:"required"`
	SeatCount   int              `json:"seat_count,omitempty"`
}

// CheckoutRequest contains the plan to subscribe to.
type CheckoutRequest struct {
	Plan valueobject.Plan `json:"plan" binding:"required"`
}

// CreateTeamRequest represents the team creation payload.
type CreateTeamRequest struct {
	Name        string `json:"name" binding:"required,min=1,max=100"`
	Description string `json:"description,omitempty"`
}

// UpdateTeamRequest represents the team update payload.
type UpdateTeamRequest struct {
	Name        string `json:"name,omitempty" binding:"omitempty,min=1,max=100"`
	Description string `json:"description,omitempty"`
}

// AddTeamMemberRequest represents adding a member to a team.
type AddTeamMemberRequest struct {
	UserID uuid.UUID            `json:"user_id" binding:"required"`
	Role   valueobject.TeamRole `json:"role" binding:"required"`
}

// UpdateCompanyRequest represents the company update payload.
type UpdateCompanyRequest struct {
	Name     string `json:"name,omitempty" binding:"omitempty,min=1,max=200"`
	Industry string `json:"industry,omitempty"`
	TeamSize string `json:"team_size,omitempty"`
}

// EnterpriseContactRequest represents an enterprise sales inquiry.
type EnterpriseContactRequest struct {
	CompanyName string `json:"company_name" binding:"required"`
	Industry    string `json:"industry,omitempty"`
	TeamSize    string `json:"team_size,omitempty"`
	Name        string `json:"name" binding:"required"`
	Email       string `json:"email" binding:"required,email"`
	Phone       string `json:"phone,omitempty"`
	Message     string `json:"message,omitempty"`
}

// CreateInvitationRequest represents the invitation creation payload.
type CreateInvitationRequest struct {
	Email string           `json:"email" binding:"required,email"`
	Role  valueobject.Role `json:"role" binding:"required"`
}

// AcceptInvitationRequest represents the invitation acceptance payload.
type AcceptInvitationRequest struct {
	Token string `json:"token" binding:"required"`
}

// ListInvitationsRequest represents the invitation listing payload.
type ListInvitationsRequest struct {
	StatusFilters []valueobject.InvitationStatus `json:"status_filters,omitempty"`
}
