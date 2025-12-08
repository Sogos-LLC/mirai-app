package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/crypto"
)

// ProvisioningService handles background provisioning of paid registrations.
type ProvisioningService struct {
	pendingRegRepo repository.PendingRegistrationRepository
	tenantRepo     repository.TenantRepository
	userRepo       repository.UserRepository
	companyRepo    repository.CompanyRepository
	identity       service.IdentityProvider
	email          service.EmailProvider
	encryptor      *crypto.Encryptor
	logger         service.Logger
	frontendURL    string
}

// NewProvisioningService creates a new provisioning service.
func NewProvisioningService(
	pendingRegRepo repository.PendingRegistrationRepository,
	tenantRepo repository.TenantRepository,
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	identity service.IdentityProvider,
	email service.EmailProvider,
	encryptor *crypto.Encryptor,
	logger service.Logger,
	frontendURL string,
) *ProvisioningService {
	return &ProvisioningService{
		pendingRegRepo: pendingRegRepo,
		tenantRepo:     tenantRepo,
		userRepo:       userRepo,
		companyRepo:    companyRepo,
		identity:       identity,
		email:          email,
		encryptor:      encryptor,
		logger:         logger,
		frontendURL:    frontendURL,
	}
}

// ProcessPaidRegistrations finds all paid pending registrations and provisions accounts.
// This should be called periodically (e.g., every 10 seconds) by a background job.
func (s *ProvisioningService) ProcessPaidRegistrations(ctx context.Context) error {
	log := s.logger.With("job", "provisioning")

	// Get all pending registrations with status = "paid"
	registrations, err := s.pendingRegRepo.ListByStatus(ctx, valueobject.PendingRegistrationStatusPaid)
	if err != nil {
		log.Error("failed to list paid registrations", "error", err)
		return err
	}

	if len(registrations) == 0 {
		return nil
	}

	log.Info("processing paid registrations", "count", len(registrations))

	for _, reg := range registrations {
		if err := s.provisionAccount(ctx, reg); err != nil {
			log.Error("failed to provision account",
				"checkoutSessionID", reg.CheckoutSessionID,
				"email", reg.Email,
				"error", err,
			)
			// Mark as failed so we don't retry forever
			reg.MarkAsFailed(err.Error())
			if updateErr := s.pendingRegRepo.Update(ctx, reg); updateErr != nil {
				log.Error("failed to mark registration as failed", "error", updateErr)
			}
			continue
		}
	}

	return nil
}

// ProvisionByCheckoutSession provisions a single account by checkout session ID.
// This is used by the Asynq worker to process a specific registration.
func (s *ProvisioningService) ProvisionByCheckoutSession(ctx context.Context, checkoutSessionID string) error {
	log := s.logger.With("checkoutSessionID", checkoutSessionID)

	// Fetch the pending registration
	reg, err := s.pendingRegRepo.GetByCheckoutSessionID(ctx, checkoutSessionID)
	if err != nil {
		log.Error("failed to get pending registration", "error", err)
		return err
	}

	// Check if already provisioned (registration deleted) or failed
	if reg == nil {
		log.Info("pending registration not found, may already be provisioned")
		return nil
	}

	// Only process if status is "paid" - skip if already provisioning/failed
	if reg.Status != valueobject.PendingRegistrationStatusPaid {
		log.Info("registration not in paid status, skipping",
			"status", reg.Status,
		)
		return nil
	}

	// Provision the account
	if err := s.provisionAccount(ctx, reg); err != nil {
		log.Error("failed to provision account", "error", err)
		// Mark as failed so we don't retry forever
		reg.MarkAsFailed(err.Error())
		if updateErr := s.pendingRegRepo.Update(ctx, reg); updateErr != nil {
			log.Error("failed to mark registration as failed", "error", updateErr)
		}
		return err
	}

	return nil
}

// ReconciliationResult contains the result of a reconciliation run.
type ReconciliationResult struct {
	// Stuck contains registrations stuck in "paid" status (>5 min) that need re-processing.
	Stuck []*entity.PendingRegistration
	// Warning contains registrations stuck for >15 minutes (first failure tier).
	Warning []*entity.PendingRegistration
	// Critical contains registrations stuck for >30 minutes (requires human intervention).
	Critical []*entity.PendingRegistration
}

// ReconcileStuckProvisioning finds registrations that are stuck in "paid" status
// and should have been provisioned. Returns tiered results:
// - Stuck (>5 min): re-enqueue for retry
// - Warning (>15 min): send warning alert, keep retrying
// - Critical (>30 min): send critical alert, human intervention needed
func (s *ProvisioningService) ReconcileStuckProvisioning(ctx context.Context) (*ReconciliationResult, error) {
	log := s.logger.With("job", "reconciliation")

	// Find registrations stuck for more than 5 minutes (needs re-enqueueing)
	stuck, err := s.pendingRegRepo.FindStuckPaid(ctx, 5*time.Minute)
	if err != nil {
		log.Error("failed to find stuck paid registrations", "error", err)
		return nil, err
	}

	// Find warning-level registrations (more than 15 minutes)
	warning, err := s.pendingRegRepo.FindStuckPaid(ctx, 15*time.Minute)
	if err != nil {
		log.Error("failed to find warning-level stuck registrations", "error", err)
		return nil, err
	}

	// Find critically stuck registrations (more than 30 minutes)
	critical, err := s.pendingRegRepo.FindStuckPaid(ctx, 30*time.Minute)
	if err != nil {
		log.Error("failed to find critically stuck registrations", "error", err)
		return nil, err
	}

	if len(stuck) > 0 {
		log.Warn("found stuck paid registrations", "count", len(stuck))
	}
	if len(warning) > 0 {
		log.Warn("found warning-level stuck registrations (>15min)", "count", len(warning))
	}
	if len(critical) > 0 {
		log.Error("found critically stuck registrations (>30min)", "count", len(critical))
	}

	return &ReconciliationResult{
		Stuck:    stuck,
		Warning:  warning,
		Critical: critical,
	}, nil
}

// SendWarningAlert sends a warning email about registrations stuck for >15 minutes.
// This is Tier 1 alerting - something is wrong but not catastrophic yet.
func (s *ProvisioningService) SendWarningAlert(ctx context.Context, registrations []*entity.PendingRegistration) error {
	if s.email == nil {
		s.logger.Warn("email provider not configured, cannot send warning alert")
		return nil
	}

	if len(registrations) == 0 {
		return nil
	}

	log := s.logger.With("job", "warning-alert", "count", len(registrations))
	log.Info("sending warning alert")

	// Build alert details with full metadata
	var details []string
	for _, reg := range registrations {
		stuckDuration := time.Since(reg.UpdatedAt).Round(time.Minute)
		errorMsg := "none"
		if reg.ErrorMessage != nil && *reg.ErrorMessage != "" {
			errorMsg = *reg.ErrorMessage
		}
		detail := "Registration ID: " + reg.ID.String() + "\n" +
			"  Email: " + reg.Email + "\n" +
			"  Company: " + reg.CompanyName + "\n" +
			"  Checkout Session: " + reg.CheckoutSessionID + "\n" +
			"  Stuck Duration: " + stuckDuration.String() + "\n" +
			"  Last Error: " + errorMsg
		details = append(details, detail)
	}

	err := s.email.SendAlert(ctx, service.SendAlertRequest{
		Subject: "[WARNING] Mirai: Provisioning Delayed - Action May Be Required",
		Body: "The following paid registrations have been stuck for over 15 minutes:\n\n" +
			strings.Join(details, "\n\n") +
			"\n\n" +
			"These users have been charged but provisioning is delayed.\n" +
			"The system is still retrying automatically.\n\n" +
			"If this persists for 30+ minutes, a CRITICAL alert will be sent.",
	})
	if err != nil {
		log.Error("failed to send warning alert", "error", err)
		return err
	}

	log.Info("warning alert sent")
	return nil
}

// SendCriticalAlert sends a critical email about registrations stuck for >30 minutes.
// This is Tier 2 alerting - human intervention is required.
func (s *ProvisioningService) SendCriticalAlert(ctx context.Context, registrations []*entity.PendingRegistration) error {
	if s.email == nil {
		s.logger.Warn("email provider not configured, cannot send critical alert")
		return nil
	}

	if len(registrations) == 0 {
		return nil
	}

	log := s.logger.With("job", "critical-alert", "count", len(registrations))
	log.Info("sending critical alert")

	// Build alert details with full metadata
	var details []string
	for _, reg := range registrations {
		stuckDuration := time.Since(reg.UpdatedAt).Round(time.Minute)
		errorMsg := "none"
		if reg.ErrorMessage != nil && *reg.ErrorMessage != "" {
			errorMsg = *reg.ErrorMessage
		}
		detail := "Registration ID: " + reg.ID.String() + "\n" +
			"  Email: " + reg.Email + "\n" +
			"  Company: " + reg.CompanyName + "\n" +
			"  Checkout Session: " + reg.CheckoutSessionID + "\n" +
			"  Stuck Duration: " + stuckDuration.String() + "\n" +
			"  Last Error: " + errorMsg
		details = append(details, detail)
	}

	err := s.email.SendAlert(ctx, service.SendAlertRequest{
		Subject: "[CRITICAL] Mirai: Orphaned Payments - Human Intervention Required",
		Body: "URGENT: The following paid registrations have been stuck for over 30 minutes:\n\n" +
			strings.Join(details, "\n\n") +
			"\n\n" +
			"These users have been charged but do not have accounts.\n" +
			"Automated retries have not resolved the issue.\n\n" +
			"REQUIRED ACTIONS:\n" +
			"1. Check backend logs for provisioning errors\n" +
			"2. Verify Kratos identity service is healthy\n" +
			"3. Check database connectivity and constraints\n" +
			"4. Manually provision accounts if needed\n\n" +
			"The system will continue retrying, but manual investigation is required.",
	})
	if err != nil {
		log.Error("failed to send critical alert", "error", err)
		return err
	}

	log.Info("critical alert sent")
	return nil
}

// provisionAccount creates the full account (identity, company, user) for a paid registration.
func (s *ProvisioningService) provisionAccount(ctx context.Context, reg *entity.PendingRegistration) error {
	log := s.logger.With(
		"checkoutSessionID", reg.CheckoutSessionID,
		"email", reg.Email,
		"company", reg.CompanyName,
	)

	// Mark as provisioning to prevent duplicate processing
	reg.MarkAsProvisioning()
	if err := s.pendingRegRepo.Update(ctx, reg); err != nil {
		return err
	}

	log.Info("provisioning account")

	// Step 1: Decrypt the password
	if s.encryptor == nil {
		return fmt.Errorf("encryptor not configured")
	}
	password, err := s.encryptor.DecryptString(reg.PasswordEncrypted)
	if err != nil {
		log.Error("failed to decrypt password", "error", err)
		return fmt.Errorf("failed to decrypt password: %w", err)
	}

	// Step 2: Create Kratos identity with plaintext password (Kratos will hash it)
	identity, err := s.identity.CreateIdentity(ctx, service.CreateIdentityRequest{
		Email:     reg.Email,
		Password:  password,
		FirstName: reg.FirstName,
		LastName:  reg.LastName,
	})
	if err != nil {
		log.Error("failed to create Kratos identity", "error", err)
		return err
	}

	kratosID, err := uuid.Parse(identity.ID)
	if err != nil {
		log.Error("failed to parse Kratos ID", "kratosID", identity.ID, "error", err)
		return err
	}

	log.Info("created Kratos identity", "kratosID", kratosID)

	// Step 3: Verify password works by performing a login
	// This ensures the password was correctly hashed and can be verified
	_, err = s.identity.PerformLogin(ctx, reg.Email, password)
	if err != nil {
		log.Error("password verification failed after identity creation", "error", err)
		return fmt.Errorf("password verification failed: %w", err)
	}
	log.Info("password verification successful")

	// Step 4: Create tenant for this organization
	tenant := &entity.Tenant{
		Name:   reg.CompanyName,
		Slug:   generateTenantSlug(reg.CompanyName),
		Status: entity.TenantStatusActive,
	}

	if err := s.tenantRepo.Create(ctx, tenant); err != nil {
		log.Error("failed to create tenant", "error", err)
		return err
	}

	log.Info("created tenant", "tenantID", tenant.ID, "slug", tenant.Slug)

	// Step 5: Create company with subscription details and tenant reference
	company := &entity.Company{
		TenantID:             tenant.ID,
		Name:                 reg.CompanyName,
		Industry:             reg.Industry,
		TeamSize:             reg.TeamSize,
		Plan:                 reg.Plan,
		SubscriptionStatus:   valueobject.SubscriptionStatusActive,
		StripeCustomerID:     reg.StripeCustomerID,
		StripeSubscriptionID: reg.StripeSubscriptionID,
		SeatCount:            reg.SeatCount,
	}

	if err := s.companyRepo.Create(ctx, company); err != nil {
		log.Error("failed to create company", "error", err)
		return err
	}

	log.Info("created company", "companyID", company.ID, "seatCount", company.SeatCount)

	// Step 6: Create user with admin role (owner of the organization)
	user := &entity.User{
		TenantID:  &tenant.ID,
		KratosID:  kratosID,
		CompanyID: &company.ID,
		Role:      valueobject.RoleAdmin,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		log.Error("failed to create user", "error", err)
		return err
	}

	log.Info("created user", "userID", user.ID)

	// Step 7: Delete the pending registration (successful provisioning)
	if err := s.pendingRegRepo.Delete(ctx, reg.ID); err != nil {
		log.Warn("failed to delete pending registration", "error", err)
		// Don't fail - account is created successfully
	}

	// Step 8: Send welcome email (async, don't fail if email fails)
	if s.email != nil {
		go s.sendWelcomeEmail(reg.Email, reg.FirstName, reg.CompanyName)
	}

	log.Info("account provisioned successfully",
		"userID", user.ID,
		"companyID", company.ID,
		"kratosID", kratosID,
	)

	return nil
}

// sendWelcomeEmail sends a welcome email to the new user.
func (s *ProvisioningService) sendWelcomeEmail(email, firstName, companyName string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	log := s.logger.With("email", email)

	err := s.email.SendWelcome(ctx, service.SendWelcomeRequest{
		To:          email,
		FirstName:   firstName,
		CompanyName: companyName,
		LoginURL:    s.frontendURL + "/auth/login",
	})

	if err != nil {
		log.Warn("failed to send welcome email", "error", err)
		return
	}

	log.Info("welcome email sent")
}

// RunBackground starts the background provisioning loop.
// This should be called as a goroutine.
func (s *ProvisioningService) RunBackground(ctx context.Context, interval time.Duration) {
	log := s.logger.With("job", "provisioning-loop")
	log.Info("starting provisioning background job", "interval", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info("provisioning background job stopped")
			return
		case <-ticker.C:
			if err := s.ProcessPaidRegistrations(ctx); err != nil {
				log.Error("provisioning job error", "error", err)
			}
		}
	}
}

// generateTenantSlug creates a URL-safe slug from a company name.
// Includes a short UUID suffix to ensure uniqueness.
func generateTenantSlug(companyName string) string {
	// Convert to lowercase
	slug := strings.ToLower(companyName)

	// Replace non-alphanumeric characters with hyphens
	reg := regexp.MustCompile(`[^a-z0-9]+`)
	slug = reg.ReplaceAllString(slug, "-")

	// Trim leading/trailing hyphens
	slug = strings.Trim(slug, "-")

	// Truncate if too long (max 50 chars for slug part)
	if len(slug) > 50 {
		slug = slug[:50]
	}

	// Add short UUID suffix for uniqueness
	shortID := uuid.New().String()[:8]
	return slug + "-" + shortID
}
