package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// Company represents an organization in the system.
type Company struct {
	ID                   uuid.UUID
	Name                 string
	Industry             *string
	TeamSize             *string
	Plan                 valueobject.Plan
	StripeCustomerID     *string
	StripeSubscriptionID *string
	SubscriptionStatus   valueobject.SubscriptionStatus
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// HasStripeCustomer returns true if the company has a Stripe customer.
func (c *Company) HasStripeCustomer() bool {
	return c.StripeCustomerID != nil && *c.StripeCustomerID != ""
}

// HasActiveSubscription returns true if the company has an active subscription.
func (c *Company) HasActiveSubscription() bool {
	return c.StripeSubscriptionID != nil && *c.StripeSubscriptionID != "" &&
		c.SubscriptionStatus.IsActive()
}

// HasPaidAccess returns true if the company should have access to paid features.
func (c *Company) HasPaidAccess() bool {
	return c.SubscriptionStatus.HasAccess()
}

// RequiresPayment returns true if the company's plan requires payment.
func (c *Company) RequiresPayment() bool {
	return c.Plan.RequiresPayment()
}

// StripeFields contains updateable Stripe-related fields.
type StripeFields struct {
	CustomerID     *string
	SubscriptionID *string
	Status         valueobject.SubscriptionStatus
	Plan           valueobject.Plan
}
