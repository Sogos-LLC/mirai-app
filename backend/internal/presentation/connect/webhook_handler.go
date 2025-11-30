package connect

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/sogos/mirai-backend/internal/application/service"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/stripe/stripe-go/v76"
)

// WebhookHandler handles Stripe webhook callbacks.
type WebhookHandler struct {
	billingService *service.BillingService
	payments       domainservice.PaymentProvider
	logger         domainservice.Logger
}

// NewWebhookHandler creates a new webhook handler.
func NewWebhookHandler(
	billingService *service.BillingService,
	payments domainservice.PaymentProvider,
	logger domainservice.Logger,
) *WebhookHandler {
	return &WebhookHandler{
		billingService: billingService,
		payments:       payments,
		logger:         logger,
	}
}

// HandleStripeWebhook handles POST /api/v1/webhooks/stripe.
func (h *WebhookHandler) HandleStripeWebhook(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	payload, err := io.ReadAll(r.Body)
	if err != nil {
		h.logger.Error("failed to read webhook body", "error", err)
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	sigHeader := r.Header.Get("Stripe-Signature")
	event, err := h.payments.VerifyWebhook(payload, sigHeader)
	if err != nil {
		h.logger.Error("webhook signature verification failed", "error", err)
		http.Error(w, "invalid signature", http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	switch event.Type {
	case "checkout.session.completed":
		var checkoutSession stripe.CheckoutSession
		if err := json.Unmarshal(event.Data.Raw, &checkoutSession); err != nil {
			h.logger.Error("failed to unmarshal checkout session", "error", err)
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		companyID := checkoutSession.Metadata["company_id"]
		plan := checkoutSession.Metadata["plan"]
		customerID := ""
		subscriptionID := ""
		if checkoutSession.Customer != nil {
			customerID = checkoutSession.Customer.ID
		}
		if checkoutSession.Subscription != nil {
			subscriptionID = checkoutSession.Subscription.ID
		}
		h.billingService.HandleCheckoutCompleted(ctx, companyID, plan, customerID, subscriptionID)

	case "customer.subscription.updated":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			h.logger.Error("failed to unmarshal subscription", "error", err)
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		fullSub, err := h.payments.GetSubscription(ctx, sub.ID)
		if err == nil && fullSub != nil {
			h.billingService.HandleSubscriptionUpdated(ctx, sub.Customer.ID, fullSub)
		}

	case "customer.subscription.deleted":
		var sub stripe.Subscription
		if err := json.Unmarshal(event.Data.Raw, &sub); err != nil {
			h.logger.Error("failed to unmarshal subscription", "error", err)
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}
		h.billingService.HandleSubscriptionDeleted(ctx, sub.Customer.ID)

	default:
		h.logger.Info("unhandled webhook event", "type", event.Type)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]bool{"received": true})
}
