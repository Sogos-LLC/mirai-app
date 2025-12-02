package dto

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// UserResponse represents a user in API responses.
type UserResponse struct {
	ID        uuid.UUID        `json:"id"`
	KratosID  uuid.UUID        `json:"kratos_id"`
	CompanyID *uuid.UUID       `json:"company_id,omitempty"`
	Role      valueobject.Role `json:"role"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
	Email     string           `json:"email,omitempty"`
	FirstName string           `json:"first_name,omitempty"`
	LastName  string           `json:"last_name,omitempty"`
}

// FromUser converts a domain entity to a response DTO.
func FromUser(u *entity.User) *UserResponse {
	if u == nil {
		return nil
	}
	return &UserResponse{
		ID:        u.ID,
		KratosID:  u.KratosID,
		CompanyID: u.CompanyID,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
	}
}

// FromUserWithIdentity converts a domain entity to a response DTO with identity data.
func FromUserWithIdentity(u *entity.User, email, firstName, lastName string) *UserResponse {
	if u == nil {
		return nil
	}
	return &UserResponse{
		ID:        u.ID,
		KratosID:  u.KratosID,
		CompanyID: u.CompanyID,
		Role:      u.Role,
		CreatedAt: u.CreatedAt,
		UpdatedAt: u.UpdatedAt,
		Email:     email,
		FirstName: firstName,
		LastName:  lastName,
	}
}

// CompanyResponse represents a company in API responses.
type CompanyResponse struct {
	ID                   uuid.UUID                      `json:"id"`
	Name                 string                         `json:"name"`
	Industry             *string                        `json:"industry,omitempty"`
	TeamSize             *string                        `json:"team_size,omitempty"`
	Plan                 valueobject.Plan               `json:"plan"`
	SubscriptionStatus   valueobject.SubscriptionStatus `json:"subscription_status"`
	StripeCustomerID     *string                        `json:"stripe_customer_id,omitempty"`
	StripeSubscriptionID *string                        `json:"stripe_subscription_id,omitempty"`
	SeatCount            int                            `json:"seat_count"`
	CreatedAt            time.Time                      `json:"created_at"`
	UpdatedAt            time.Time                      `json:"updated_at"`
}

// FromCompany converts a domain entity to a response DTO.
func FromCompany(c *entity.Company) *CompanyResponse {
	if c == nil {
		return nil
	}
	return &CompanyResponse{
		ID:                   c.ID,
		Name:                 c.Name,
		Industry:             c.Industry,
		TeamSize:             c.TeamSize,
		Plan:                 c.Plan,
		SubscriptionStatus:   c.SubscriptionStatus,
		StripeCustomerID:     c.StripeCustomerID,
		StripeSubscriptionID: c.StripeSubscriptionID,
		SeatCount:            c.SeatCount,
		CreatedAt:            c.CreatedAt,
		UpdatedAt:            c.UpdatedAt,
	}
}

// TeamResponse represents a team in API responses.
type TeamResponse struct {
	ID          uuid.UUID `json:"id"`
	CompanyID   uuid.UUID `json:"company_id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// FromTeam converts a domain entity to a response DTO.
func FromTeam(t *entity.Team) *TeamResponse {
	if t == nil {
		return nil
	}
	return &TeamResponse{
		ID:          t.ID,
		CompanyID:   t.CompanyID,
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}

// TeamMemberResponse represents a team member in API responses.
type TeamMemberResponse struct {
	ID        uuid.UUID            `json:"id"`
	TeamID    uuid.UUID            `json:"team_id"`
	UserID    uuid.UUID            `json:"user_id"`
	Role      valueobject.TeamRole `json:"role"`
	CreatedAt time.Time            `json:"created_at"`
	User      *UserResponse        `json:"user,omitempty"`
}

// FromTeamMember converts a domain entity to a response DTO.
func FromTeamMember(m *entity.TeamMember) *TeamMemberResponse {
	if m == nil {
		return nil
	}
	return &TeamMemberResponse{
		ID:        m.ID,
		TeamID:    m.TeamID,
		UserID:    m.UserID,
		Role:      m.Role,
		CreatedAt: m.CreatedAt,
	}
}

// UserWithCompanyResponse combines user and company data.
type UserWithCompanyResponse struct {
	User    *UserResponse    `json:"user"`
	Company *CompanyResponse `json:"company,omitempty"`
}

// RegisterResponse contains the result of registration.
// For paid plans, only CheckoutURL and Email are returned (account created after payment).
type RegisterResponse struct {
	User        *UserResponse    `json:"user,omitempty"`
	Company     *CompanyResponse `json:"company,omitempty"`
	CheckoutURL string           `json:"checkout_url,omitempty"`
	Email       string           `json:"email,omitempty"` // Email for confirmation messages
}

// OnboardResponse contains the onboarding result with optional checkout URL.
type OnboardResponse struct {
	User        *UserResponse    `json:"user"`
	Company     *CompanyResponse `json:"company,omitempty"`
	CheckoutURL string           `json:"checkout_url,omitempty"`
}

// CheckoutResponse contains the Stripe Checkout session URL.
type CheckoutResponse struct {
	URL string `json:"url"`
}

// PortalResponse contains the Stripe Customer Portal URL.
type PortalResponse struct {
	URL string `json:"url"`
}

// BillingInfoResponse contains the current billing status for a company.
type BillingInfoResponse struct {
	Plan              valueobject.Plan               `json:"plan"`
	Status            valueobject.SubscriptionStatus `json:"status"`
	SeatCount         int                            `json:"seat_count"`
	PricePerSeat      int                            `json:"price_per_seat"`
	CurrentPeriodEnd  *int64                         `json:"current_period_end,omitempty"`
	CancelAtPeriodEnd bool                           `json:"cancel_at_period_end"`
}

// EmailExistsResponse contains the result of email check.
type EmailExistsResponse struct {
	Exists bool `json:"exists"`
}

// InvitationResponse represents an invitation in API responses.
type InvitationResponse struct {
	ID               uuid.UUID                    `json:"id"`
	CompanyID        uuid.UUID                    `json:"company_id"`
	Email            string                       `json:"email"`
	Role             valueobject.Role             `json:"role"`
	Status           valueobject.InvitationStatus `json:"status"`
	InvitedByUserID  uuid.UUID                    `json:"invited_by_user_id"`
	AcceptedByUserID *uuid.UUID                   `json:"accepted_by_user_id,omitempty"`
	ExpiresAt        time.Time                    `json:"expires_at"`
	CreatedAt        time.Time                    `json:"created_at"`
	UpdatedAt        time.Time                    `json:"updated_at"`
}

// FromInvitation converts a domain entity to a response DTO.
func FromInvitation(i *entity.Invitation) *InvitationResponse {
	if i == nil {
		return nil
	}
	return &InvitationResponse{
		ID:               i.ID,
		CompanyID:        i.CompanyID,
		Email:            i.Email,
		Role:             i.Role,
		Status:           i.Status,
		InvitedByUserID:  i.InvitedByUserID,
		AcceptedByUserID: i.AcceptedByUserID,
		ExpiresAt:        i.ExpiresAt,
		CreatedAt:        i.CreatedAt,
		UpdatedAt:        i.UpdatedAt,
	}
}

// SeatInfoResponse contains seat usage information for a company.
type SeatInfoResponse struct {
	TotalSeats         int `json:"total_seats"`
	UsedSeats          int `json:"used_seats"`
	PendingInvitations int `json:"pending_invitations"`
	AvailableSeats     int `json:"available_seats"`
}

// InvitationWithCompanyResponse combines invitation and company data.
type InvitationWithCompanyResponse struct {
	Invitation *InvitationResponse `json:"invitation"`
	Company    *CompanyResponse    `json:"company"`
}

// AcceptInvitationResponse contains the result of accepting an invitation.
type AcceptInvitationResponse struct {
	Invitation *InvitationResponse `json:"invitation"`
	User       *UserResponse       `json:"user"`
	Company    *CompanyResponse    `json:"company"`
}

// RegisterWithInvitationResponse contains the result of invited user registration.
type RegisterWithInvitationResponse struct {
	User         *UserResponse    `json:"user"`
	Company      *CompanyResponse `json:"company"`
	SessionToken string           `json:"session_token"`
}
