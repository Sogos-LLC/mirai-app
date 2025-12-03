package connect

import (
	"context"
	"encoding/json"
	"io"
	"net/http"

	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/worker"
	"github.com/stripe/stripe-go/v76"
)

// WebhookHandler handles Stripe webhook callbacks.
type WebhookHandler struct {
	billingService *service.BillingService
	pendingRegRepo repository.PendingRegistrationRepository
	payments       domainservice.PaymentProvider
	workerClient   *worker.Client
	logger         domainservice.Logger
}

// NewWebhookHandler creates a new webhook handler.
func NewWebhookHandler(
	billingService *service.BillingService,
	pendingRegRepo repository.PendingRegistrationRepository,
	payments domainservice.PaymentProvider,
	workerClient *worker.Client,
	logger domainservice.Logger,
) *WebhookHandler {
	return &WebhookHandler{
		billingService: billingService,
		pendingRegRepo: pendingRegRepo,
		payments:       payments,
		workerClient:   workerClient,
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

		// Check if this is a new registration (no company_id or nil UUID means pending registration flow)
		// The checkout session metadata may have empty string or "00000000-0000-0000-0000-000000000000" (nil UUID)
		isNewRegistration := companyID == "" || companyID == "00000000-0000-0000-0000-000000000000"
		if isNewRegistration {
			h.handlePendingRegistrationPayment(ctx, checkoutSession.ID, customerID, subscriptionID)
		} else {
			// Existing company flow (e.g., onboarding or plan upgrade)
			h.billingService.HandleCheckoutCompleted(ctx, companyID, plan, customerID, subscriptionID)
		}

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

// handlePendingRegistrationPayment marks a pending registration as paid after successful checkout
// and enqueues a provisioning task for background processing.
func (h *WebhookHandler) handlePendingRegistrationPayment(ctx context.Context, checkoutSessionID, customerID, subscriptionID string) {
	log := h.logger.With("checkoutSessionID", checkoutSessionID)

	// Look up pending registration by checkout session ID
	pending, err := h.pendingRegRepo.GetByCheckoutSessionID(ctx, checkoutSessionID)
	if err != nil {
		log.Error("failed to get pending registration", "error", err)
		return
	}
	if pending == nil {
		log.Warn("no pending registration found for checkout session")
		return
	}

	log = log.With("email", pending.Email, "company", pending.CompanyName)

	// Get seat count from subscription (if available)
	seatCount := 0
	if subscriptionID != "" && h.payments != nil {
		sub, err := h.payments.GetSubscription(ctx, subscriptionID)
		if err == nil && sub != nil && sub.SeatCount > 0 {
			seatCount = sub.SeatCount
			log.Info("captured seat count from subscription", "seatCount", seatCount)
		}
	}

	// Mark as paid with Stripe details
	pending.MarkAsPaid(customerID, subscriptionID, seatCount)
	if err := h.pendingRegRepo.Update(ctx, pending); err != nil {
		log.Error("failed to mark pending registration as paid", "error", err)
		return
	}

	log.Info("pending registration marked as paid", "seatCount", pending.SeatCount)

	// Enqueue provisioning task for background processing
	if h.workerClient != nil {
		if err := h.workerClient.EnqueueStripeProvision(checkoutSessionID, customerID, subscriptionID); err != nil {
			log.Error("failed to enqueue provisioning task", "error", err)
			// Don't return error - the registration is marked as paid and can still be
			// picked up by the background worker if it falls back to polling
		}
	}
}
