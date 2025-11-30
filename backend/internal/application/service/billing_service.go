package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// BillingService handles billing-related business logic.
type BillingService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
	payments    service.PaymentProvider
	logger      service.Logger
	frontendURL string
}

// NewBillingService creates a new billing service.
func NewBillingService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	payments service.PaymentProvider,
	logger service.Logger,
	frontendURL string,
) *BillingService {
	return &BillingService{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		payments:    payments,
		logger:      logger,
		frontendURL: frontendURL,
	}
}

// GetBillingInfo retrieves the current billing status for a user's company.
func (s *BillingService) GetBillingInfo(ctx context.Context, kratosID uuid.UUID) (*dto.BillingInfoResponse, error) {
	user, company, err := s.getUserAndCompany(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	// Count users in company for seat count
	seatCount, err := s.companyRepo.CountUsersByCompanyID(ctx, *user.CompanyID)
	if err != nil {
		s.logger.Error("failed to count users", "companyID", user.CompanyID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	info := &dto.BillingInfoResponse{
		Plan:              company.Plan,
		Status:            company.SubscriptionStatus,
		SeatCount:         seatCount,
		PricePerSeat:      company.Plan.PricePerSeatCents(),
		CancelAtPeriodEnd: false,
	}

	// If there's an active subscription, get more details from Stripe
	if company.StripeSubscriptionID != nil && *company.StripeSubscriptionID != "" {
		sub, err := s.payments.GetSubscription(ctx, *company.StripeSubscriptionID)
		if err == nil {
			info.CancelAtPeriodEnd = sub.CancelAtPeriodEnd
			info.CurrentPeriodEnd = &sub.CurrentPeriodEnd
		}
	}

	return info, nil
}

// CreateCheckoutSession creates a Stripe checkout session for plan upgrade/subscription.
func (s *BillingService) CreateCheckoutSession(ctx context.Context, kratosID uuid.UUID, plan valueobject.Plan, email string) (*dto.CheckoutResponse, error) {
	log := s.logger.With("kratosID", kratosID, "plan", plan)

	user, company, err := s.getUserAndCompany(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	// Only owners can manage billing
	if !user.CanManageBilling() {
		return nil, domainerrors.ErrForbidden.WithMessage("only company owners can manage billing")
	}

	// Validate plan
	if !plan.IsValid() || !plan.RequiresPayment() {
		return nil, domainerrors.ErrInvalidPlan
	}

	// Count users for seat quantity
	seatCount, err := s.companyRepo.CountUsersByCompanyID(ctx, *user.CompanyID)
	if err != nil {
		log.Error("failed to count users", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if seatCount < 1 {
		seatCount = 1
	}

	// Get or create customer ID
	var customerID uuid.UUID
	if company.HasStripeCustomer() {
		// Parse existing customer ID - we pass it as UUID to CheckoutRequest
		// but the actual Stripe customer ID is a string
	}

	sess, err := s.payments.CreateCheckoutSession(ctx, service.CheckoutRequest{
		CustomerID: customerID,
		CompanyID:  company.ID,
		Email:      email,
		Plan:       plan,
		SeatCount:  seatCount,
		SuccessURL: s.frontendURL + "/settings?tab=billing&checkout=success",
		CancelURL:  s.frontendURL + "/settings?tab=billing&checkout=canceled",
	})
	if err != nil {
		log.Error("failed to create checkout session", "error", err)
		return nil, domainerrors.ErrCheckoutFailed.WithCause(err)
	}

	// Save customer ID if new
	if !company.HasStripeCustomer() && sess.CustomerID != "" {
		if err := s.companyRepo.UpdateStripeFields(ctx, company.ID, entity.StripeFields{
			CustomerID: &sess.CustomerID,
			Status:     company.SubscriptionStatus,
			Plan:       company.Plan,
		}); err != nil {
			log.Warn("failed to save stripe customer ID", "error", err)
		}
	}

	return &dto.CheckoutResponse{URL: sess.URL}, nil
}

// CreatePortalSession creates a Stripe customer portal session.
func (s *BillingService) CreatePortalSession(ctx context.Context, kratosID uuid.UUID) (*dto.PortalResponse, error) {
	user, company, err := s.getUserAndCompany(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	// Only owners can access billing portal
	if !user.CanManageBilling() {
		return nil, domainerrors.ErrForbidden.WithMessage("only company owners can access billing")
	}

	if !company.HasStripeCustomer() {
		return nil, domainerrors.ErrNoBillingAccount
	}

	sess, err := s.payments.CreatePortalSession(ctx, *company.StripeCustomerID, "")
	if err != nil {
		s.logger.Error("failed to create portal session", "error", err)
		return nil, domainerrors.ErrExternalService.WithCause(err)
	}

	return &dto.PortalResponse{URL: sess.URL}, nil
}

// HandleCheckoutCompleted processes a checkout.session.completed webhook event.
func (s *BillingService) HandleCheckoutCompleted(ctx context.Context, companyIDStr, plan, customerID, subscriptionID string) error {
	log := s.logger.With("companyID", companyIDStr, "plan", plan)

	companyID, err := uuid.Parse(companyIDStr)
	if err != nil {
		log.Error("invalid company_id in metadata", "error", err)
		return domainerrors.ErrInvalidInput.WithMessage("invalid company_id")
	}

	// Default to starter if no plan specified
	parsedPlan, _ := valueobject.ParsePlan(plan)
	if !parsedPlan.IsValid() {
		parsedPlan = valueobject.PlanStarter
	}

	err = s.companyRepo.UpdateStripeFields(ctx, companyID, entity.StripeFields{
		CustomerID:     &customerID,
		SubscriptionID: &subscriptionID,
		Status:         valueobject.SubscriptionStatusActive,
		Plan:           parsedPlan,
	})
	if err != nil {
		log.Error("failed to update company stripe fields", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("checkout completed")
	return nil
}

// HandleSubscriptionUpdated processes a customer.subscription.updated webhook event.
func (s *BillingService) HandleSubscriptionUpdated(ctx context.Context, customerID string, sub *service.Subscription) error {
	log := s.logger.With("customerID", customerID)

	company, err := s.companyRepo.GetByStripeCustomerID(ctx, customerID)
	if err != nil || company == nil {
		log.Error("company not found for customer", "error", err)
		return domainerrors.ErrCompanyNotFound
	}

	plan := company.Plan
	if sub.Plan.IsValid() {
		plan = sub.Plan
	}

	subID := sub.ID
	err = s.companyRepo.UpdateStripeFields(ctx, company.ID, entity.StripeFields{
		CustomerID:     &customerID,
		SubscriptionID: &subID,
		Status:         sub.Status,
		Plan:           plan,
	})
	if err != nil {
		log.Error("failed to update subscription", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("subscription updated", "companyID", company.ID, "status", sub.Status, "plan", plan)
	return nil
}

// HandleSubscriptionDeleted processes a customer.subscription.deleted webhook event.
func (s *BillingService) HandleSubscriptionDeleted(ctx context.Context, customerID string) error {
	log := s.logger.With("customerID", customerID)

	company, err := s.companyRepo.GetByStripeCustomerID(ctx, customerID)
	if err != nil || company == nil {
		log.Error("company not found for customer", "error", err)
		return domainerrors.ErrCompanyNotFound
	}

	// Reset to starter plan
	err = s.companyRepo.UpdateStripeFields(ctx, company.ID, entity.StripeFields{
		CustomerID: &customerID,
		Status:     valueobject.SubscriptionStatusCanceled,
		Plan:       valueobject.PlanStarter,
	})
	if err != nil {
		log.Error("failed to handle subscription deletion", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("subscription deleted, reverted to starter", "companyID", company.ID)
	return nil
}

// UpdateSeatCount updates the Stripe subscription quantity when users are added/removed.
func (s *BillingService) UpdateSeatCount(ctx context.Context, companyID uuid.UUID, newCount int) error {
	company, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil || company == nil {
		return domainerrors.ErrCompanyNotFound
	}

	// Only update if there's an active subscription
	if company.StripeSubscriptionID == nil || *company.StripeSubscriptionID == "" {
		return nil
	}

	err = s.payments.UpdateSubscriptionQuantity(ctx, *company.StripeSubscriptionID, newCount)
	if err != nil {
		s.logger.Error("failed to update seat count", "companyID", companyID, "error", err)
		return domainerrors.ErrExternalService.WithCause(err)
	}

	s.logger.Info("updated seat count", "companyID", companyID, "newCount", newCount)
	return nil
}

// getUserAndCompany is a helper to get user and their company.
func (s *BillingService) getUserAndCompany(ctx context.Context, kratosID uuid.UUID) (*entity.User, *entity.Company, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, nil, domainerrors.ErrUserHasNoCompany
	}

	company, err := s.companyRepo.GetByID(ctx, *user.CompanyID)
	if err != nil || company == nil {
		return nil, nil, domainerrors.ErrCompanyNotFound
	}

	return user, company, nil
}
