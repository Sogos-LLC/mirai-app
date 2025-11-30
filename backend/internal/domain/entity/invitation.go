package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// Invitation represents an invitation to join a company.
type Invitation struct {
	ID               uuid.UUID
	CompanyID        uuid.UUID
	Email            string
	Role             valueobject.Role
	Status           valueobject.InvitationStatus
	Token            string
	InvitedByUserID  uuid.UUID
	AcceptedByUserID *uuid.UUID
	ExpiresAt        time.Time
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// IsExpired returns true if the invitation has expired.
func (i *Invitation) IsExpired() bool {
	return time.Now().After(i.ExpiresAt)
}

// IsPending returns true if the invitation is still pending and not expired.
func (i *Invitation) IsPending() bool {
	return i.Status.IsPending() && !i.IsExpired()
}

// CanBeAccepted returns true if the invitation can be accepted.
func (i *Invitation) CanBeAccepted() bool {
	return i.IsPending()
}

// CanBeRevoked returns true if the invitation can be revoked.
func (i *Invitation) CanBeRevoked() bool {
	return i.Status.IsPending()
}

// Accept marks the invitation as accepted by the given user.
func (i *Invitation) Accept(userID uuid.UUID) {
	i.Status = valueobject.InvitationStatusAccepted
	i.AcceptedByUserID = &userID
	i.UpdatedAt = time.Now()
}

// Revoke marks the invitation as revoked.
func (i *Invitation) Revoke() {
	i.Status = valueobject.InvitationStatusRevoked
	i.UpdatedAt = time.Now()
}

// MarkExpired marks the invitation as expired.
func (i *Invitation) MarkExpired() {
	i.Status = valueobject.InvitationStatusExpired
	i.UpdatedAt = time.Now()
}

// NewInvitation creates a new invitation with default values.
func NewInvitation(
	companyID uuid.UUID,
	email string,
	role valueobject.Role,
	token string,
	invitedByUserID uuid.UUID,
	expiresIn time.Duration,
) *Invitation {
	now := time.Now()
	return &Invitation{
		CompanyID:       companyID,
		Email:           email,
		Role:            role,
		Status:          valueobject.InvitationStatusPending,
		Token:           token,
		InvitedByUserID: invitedByUserID,
		ExpiresAt:       now.Add(expiresIn),
		CreatedAt:       now,
		UpdatedAt:       now,
	}
}
