package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// PaymentProvider abstracts Stripe payment operations.
type PaymentProvider interface {
	// CreateCustomer creates a new Stripe customer.
	CreateCustomer(ctx context.Context, req CreateCustomerRequest) (*Customer, error)

	// CreateCheckoutSession creates a Stripe checkout session.
	CreateCheckoutSession(ctx context.Context, req CheckoutRequest) (*CheckoutSession, error)

	// CreatePortalSession creates a Stripe customer portal session.
	CreatePortalSession(ctx context.Context, customerID, returnURL string) (*PortalSession, error)

	// GetSubscription retrieves a subscription by ID.
	GetSubscription(ctx context.Context, subscriptionID string) (*Subscription, error)

	// UpdateSubscriptionQuantity updates the seat count on a subscription.
	UpdateSubscriptionQuantity(ctx context.Context, subscriptionID string, quantity int) error

	// GetCheckoutSession retrieves a checkout session by ID.
	GetCheckoutSession(ctx context.Context, sessionID string) (*CheckoutSession, error)

	// VerifyWebhook verifies a webhook signature and parses the event.
	VerifyWebhook(payload []byte, signature string) (*WebhookEvent, error)
}

// CreateCustomerRequest contains data for creating a Stripe customer.
type CreateCustomerRequest struct {
	Email     string
	Name      string
	CompanyID uuid.UUID
}

// Customer represents a Stripe customer.
type Customer struct {
	ID string
}

// CheckoutRequest contains data for creating a checkout session.
type CheckoutRequest struct {
	CustomerID uuid.UUID
	CompanyID  uuid.UUID
	Email      string
	Plan       valueobject.Plan
	SeatCount  int
	SuccessURL string
	CancelURL  string
}

// CheckoutSession represents a Stripe checkout session.
type CheckoutSession struct {
	ID             string
	URL            string
	CustomerID     string
	SubscriptionID string
	CompanyID      uuid.UUID
	Plan           valueobject.Plan
}

// PortalSession represents a Stripe customer portal session.
type PortalSession struct {
	URL string
}

// Subscription represents a Stripe subscription.
type Subscription struct {
	ID                string
	CustomerID        string
	Status            valueobject.SubscriptionStatus
	Plan              valueobject.Plan
	CurrentPeriodEnd  int64
	CancelAtPeriodEnd bool
	SeatCount         int
	ItemID            string // First subscription item ID
}

// WebhookEvent represents a parsed Stripe webhook event.
type WebhookEvent struct {
	Type string
	Data WebhookEventData
}

// WebhookEventData contains the data for a webhook event.
type WebhookEventData struct {
	Raw             []byte // Raw JSON for the event object
	CheckoutSession *CheckoutSession
	Subscription    *Subscription
}

// BillingInfo contains the current billing status for a company.
type BillingInfo struct {
	Plan              valueobject.Plan
	Status            valueobject.SubscriptionStatus
	SeatCount         int
	PricePerSeat      int
	CurrentPeriodEnd  *int64
	CancelAtPeriodEnd bool
}

// CompanyWithOwner combines company data with owner info for registration response.
type CompanyWithOwner struct {
	Company *entity.Company
	Owner   *entity.User
}
