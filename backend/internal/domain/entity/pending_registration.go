package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// PendingRegistration stores registration data until payment is confirmed.
// After successful Stripe payment, a background job provisions the account.
type PendingRegistration struct {
	ID                   uuid.UUID
	CheckoutSessionID    string
	Email                string
	PasswordEncrypted    []byte // AES-256-GCM encrypted password (NOT a hash)
	FirstName            string
	LastName             string
	CompanyName          string
	Industry             *string
	TeamSize             *string
	Plan                 valueobject.Plan
	SeatCount            int
	Status               valueobject.PendingRegistrationStatus
	StripeCustomerID     *string
	StripeSubscriptionID *string
	ErrorMessage         *string
	CreatedAt            time.Time
	ExpiresAt            time.Time
	UpdatedAt            time.Time
}

// IsExpired returns true if the pending registration has expired.
func (p *PendingRegistration) IsExpired() bool {
	return time.Now().After(p.ExpiresAt)
}

// IsReadyForProvisioning returns true if the registration is paid and ready to provision.
func (p *PendingRegistration) IsReadyForProvisioning() bool {
	return p.Status.IsReadyForProvisioning() && !p.IsExpired()
}

// MarkAsPaid updates the status to paid with Stripe details.
func (p *PendingRegistration) MarkAsPaid(customerID, subscriptionID string, seatCount int) {
	p.Status = valueobject.PendingRegistrationStatusPaid
	p.StripeCustomerID = &customerID
	p.StripeSubscriptionID = &subscriptionID
	if seatCount > 0 {
		p.SeatCount = seatCount
	}
	p.UpdatedAt = time.Now()
}

// MarkAsProvisioning updates the status to provisioning.
func (p *PendingRegistration) MarkAsProvisioning() {
	p.Status = valueobject.PendingRegistrationStatusProvisioning
	p.UpdatedAt = time.Now()
}

// MarkAsFailed updates the status to failed with an error message.
func (p *PendingRegistration) MarkAsFailed(errMsg string) {
	p.Status = valueobject.PendingRegistrationStatusFailed
	p.ErrorMessage = &errMsg
	p.UpdatedAt = time.Now()
}
