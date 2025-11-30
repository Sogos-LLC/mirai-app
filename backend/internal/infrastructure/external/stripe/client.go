package stripe

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/stripe/stripe-go/v76"
	billingportalsession "github.com/stripe/stripe-go/v76/billingportal/session"
	"github.com/stripe/stripe-go/v76/checkout/session"
	"github.com/stripe/stripe-go/v76/customer"
	"github.com/stripe/stripe-go/v76/subscription"
	"github.com/stripe/stripe-go/v76/webhook"
)

// Client implements service.PaymentProvider using Stripe.
type Client struct {
	secretKey        string
	webhookSecret    string
	starterPriceID   string
	proPriceID       string
	frontendURL      string
	backendURL       string
}

// NewClient creates a new Stripe client.
func NewClient(secretKey, webhookSecret, starterPriceID, proPriceID, frontendURL, backendURL string) service.PaymentProvider {
	// Set the global Stripe key
	stripe.Key = secretKey

	return &Client{
		secretKey:      secretKey,
		webhookSecret:  webhookSecret,
		starterPriceID: starterPriceID,
		proPriceID:     proPriceID,
		frontendURL:    frontendURL,
		backendURL:     backendURL,
	}
}

// CreateCustomer creates a new Stripe customer.
func (c *Client) CreateCustomer(ctx context.Context, req service.CreateCustomerRequest) (*service.Customer, error) {
	params := &stripe.CustomerParams{
		Email: stripe.String(req.Email),
		Name:  stripe.String(req.Name),
		Metadata: map[string]string{
			"company_id": req.CompanyID.String(),
		},
	}

	cust, err := customer.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create Stripe customer: %w", err)
	}

	return &service.Customer{ID: cust.ID}, nil
}

// CreateCheckoutSession creates a Stripe checkout session.
func (c *Client) CreateCheckoutSession(ctx context.Context, req service.CheckoutRequest) (*service.CheckoutSession, error) {
	// Determine price ID based on plan
	var priceID string
	switch req.Plan {
	case valueobject.PlanStarter:
		priceID = c.starterPriceID
	case valueobject.PlanPro:
		priceID = c.proPriceID
	default:
		return nil, fmt.Errorf("invalid plan for checkout: %s", req.Plan)
	}

	if priceID == "" {
		return nil, fmt.Errorf("no price ID configured for plan: %s", req.Plan)
	}

	// Use minimum 1 seat
	seatCount := req.SeatCount
	if seatCount < 1 {
		seatCount = 1
	}

	// Determine success URL
	successURL := req.SuccessURL
	if successURL == "" {
		// Default: redirect to backend complete-checkout endpoint
		successURL = c.backendURL + "/api/v1/auth/complete-checkout?session_id={CHECKOUT_SESSION_ID}"
	}

	cancelURL := req.CancelURL
	if cancelURL == "" {
		cancelURL = c.frontendURL + "/auth/registration?checkout=canceled"
	}

	// First, create or get customer
	var customerID string
	if req.CustomerID != uuid.Nil {
		customerID = req.CustomerID.String()
	} else {
		// Create new customer
		cust, err := c.CreateCustomer(ctx, service.CreateCustomerRequest{
			Email:     req.Email,
			Name:      "", // Will be set from company later
			CompanyID: req.CompanyID,
		})
		if err != nil {
			return nil, err
		}
		customerID = cust.ID
	}

	params := &stripe.CheckoutSessionParams{
		Customer: stripe.String(customerID),
		Mode:     stripe.String(string(stripe.CheckoutSessionModeSubscription)),
		LineItems: []*stripe.CheckoutSessionLineItemParams{
			{
				Price:    stripe.String(priceID),
				Quantity: stripe.Int64(int64(seatCount)),
			},
		},
		SuccessURL: stripe.String(successURL),
		CancelURL:  stripe.String(cancelURL),
		Metadata: map[string]string{
			"company_id": req.CompanyID.String(),
			"plan":       req.Plan.String(),
		},
		SubscriptionData: &stripe.CheckoutSessionSubscriptionDataParams{
			Metadata: map[string]string{
				"company_id": req.CompanyID.String(),
				"plan":       req.Plan.String(),
			},
		},
	}

	sess, err := session.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create checkout session: %w", err)
	}

	return &service.CheckoutSession{
		ID:         sess.ID,
		URL:        sess.URL,
		CustomerID: customerID,
		CompanyID:  req.CompanyID,
		Plan:       req.Plan,
	}, nil
}

// CreatePortalSession creates a Stripe customer portal session.
func (c *Client) CreatePortalSession(ctx context.Context, customerID, returnURL string) (*service.PortalSession, error) {
	if returnURL == "" {
		returnURL = c.frontendURL + "/settings?tab=billing"
	}

	params := &stripe.BillingPortalSessionParams{
		Customer:  stripe.String(customerID),
		ReturnURL: stripe.String(returnURL),
	}

	sess, err := billingportalsession.New(params)
	if err != nil {
		return nil, fmt.Errorf("failed to create portal session: %w", err)
	}

	return &service.PortalSession{URL: sess.URL}, nil
}

// GetSubscription retrieves a subscription by ID.
func (c *Client) GetSubscription(ctx context.Context, subscriptionID string) (*service.Subscription, error) {
	sub, err := subscription.Get(subscriptionID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get subscription: %w", err)
	}

	// Get first item ID for seat updates
	var itemID string
	var seatCount int64
	if len(sub.Items.Data) > 0 {
		itemID = sub.Items.Data[0].ID
		seatCount = sub.Items.Data[0].Quantity
	}

	// Map Stripe status to our status
	status := mapStripeStatus(sub.Status)

	// Get plan from metadata
	plan := valueobject.PlanStarter // default
	if sub.Metadata != nil {
		if metaPlan, ok := sub.Metadata["plan"]; ok {
			if p, err := valueobject.ParsePlan(metaPlan); err == nil {
				plan = p
			}
		}
	}

	return &service.Subscription{
		ID:                sub.ID,
		CustomerID:        sub.Customer.ID,
		Status:            status,
		Plan:              plan,
		CurrentPeriodEnd:  sub.CurrentPeriodEnd,
		CancelAtPeriodEnd: sub.CancelAtPeriodEnd,
		SeatCount:         int(seatCount),
		ItemID:            itemID,
	}, nil
}

// UpdateSubscriptionQuantity updates the seat count on a subscription.
func (c *Client) UpdateSubscriptionQuantity(ctx context.Context, subscriptionID string, quantity int) error {
	// Get the subscription to find the item ID
	sub, err := subscription.Get(subscriptionID, nil)
	if err != nil {
		return fmt.Errorf("failed to get subscription: %w", err)
	}

	if len(sub.Items.Data) == 0 {
		return fmt.Errorf("subscription has no items")
	}

	itemID := sub.Items.Data[0].ID

	params := &stripe.SubscriptionParams{
		Items: []*stripe.SubscriptionItemsParams{
			{
				ID:       stripe.String(itemID),
				Quantity: stripe.Int64(int64(quantity)),
			},
		},
		ProrationBehavior: stripe.String("create_prorations"),
	}

	_, err = subscription.Update(subscriptionID, params)
	if err != nil {
		return fmt.Errorf("failed to update subscription: %w", err)
	}

	return nil
}

// GetCheckoutSession retrieves a checkout session by ID.
func (c *Client) GetCheckoutSession(ctx context.Context, sessionID string) (*service.CheckoutSession, error) {
	sess, err := session.Get(sessionID, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to get checkout session: %w", err)
	}

	// Parse company ID from metadata
	var companyID uuid.UUID
	if sess.Metadata != nil {
		if cidStr, ok := sess.Metadata["company_id"]; ok {
			companyID, _ = uuid.Parse(cidStr)
		}
	}

	// Parse plan from metadata
	plan := valueobject.PlanStarter
	if sess.Metadata != nil {
		if planStr, ok := sess.Metadata["plan"]; ok {
			if p, err := valueobject.ParsePlan(planStr); err == nil {
				plan = p
			}
		}
	}

	var subscriptionID string
	if sess.Subscription != nil {
		subscriptionID = sess.Subscription.ID
	}

	return &service.CheckoutSession{
		ID:             sess.ID,
		URL:            sess.URL,
		CustomerID:     sess.Customer.ID,
		SubscriptionID: subscriptionID,
		CompanyID:      companyID,
		Plan:           plan,
	}, nil
}

// VerifyWebhook verifies a webhook signature and parses the event.
func (c *Client) VerifyWebhook(payload []byte, signature string) (*service.WebhookEvent, error) {
	event, err := webhook.ConstructEventWithOptions(payload, signature, c.webhookSecret, webhook.ConstructEventOptions{
		IgnoreAPIVersionMismatch: true,
	})
	if err != nil {
		return nil, fmt.Errorf("invalid webhook signature: %w", err)
	}

	return &service.WebhookEvent{
		Type: string(event.Type),
		Data: service.WebhookEventData{
			Raw: event.Data.Raw, // Raw JSON of the event object for caller to unmarshal
		},
	}, nil
}

// mapStripeStatus maps Stripe subscription status to our domain status.
func mapStripeStatus(status stripe.SubscriptionStatus) valueobject.SubscriptionStatus {
	switch status {
	case stripe.SubscriptionStatusActive:
		return valueobject.SubscriptionStatusActive
	case stripe.SubscriptionStatusPastDue:
		return valueobject.SubscriptionStatusPastDue
	case stripe.SubscriptionStatusCanceled:
		return valueobject.SubscriptionStatusCanceled
	case stripe.SubscriptionStatusUnpaid:
		return valueobject.SubscriptionStatusPastDue
	default:
		return valueobject.SubscriptionStatusNone
	}
}
