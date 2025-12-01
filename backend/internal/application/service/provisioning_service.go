package service

import (
	"context"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// ProvisioningService handles background provisioning of paid registrations.
type ProvisioningService struct {
	pendingRegRepo repository.PendingRegistrationRepository
	tenantRepo     repository.TenantRepository
	userRepo       repository.UserRepository
	companyRepo    repository.CompanyRepository
	identity       service.IdentityProvider
	email          service.EmailProvider
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

	// Step 1: Create Kratos identity with pre-hashed password
	identity, err := s.identity.CreateIdentityWithHash(ctx, service.CreateIdentityWithHashRequest{
		Email:        reg.Email,
		PasswordHash: reg.PasswordHash,
		FirstName:    reg.FirstName,
		LastName:     reg.LastName,
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

	// Step 2: Create tenant for this organization
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

	// Step 3: Create company with subscription details and tenant reference
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

	// Step 4: Create user with admin role (owner of the organization)
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

	// Step 5: Delete the pending registration (successful provisioning)
	if err := s.pendingRegRepo.Delete(ctx, reg.ID); err != nil {
		log.Warn("failed to delete pending registration", "error", err)
		// Don't fail - account is created successfully
	}

	// Step 6: Send welcome email (async, don't fail if email fails)
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
