package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// AuthService handles authentication and registration business logic.
type AuthService struct {
	userRepo              repository.UserRepository
	companyRepo           repository.CompanyRepository
	invitationRepo        repository.InvitationRepository
	pendingRegRepo        repository.PendingRegistrationRepository
	identity              service.IdentityProvider
	payments              service.PaymentProvider
	logger                service.Logger
	frontendURL           string
	marketingURL          string // Marketing site URL for checkout success redirects
	backendURL            string
}

// NewAuthService creates a new auth service.
func NewAuthService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	invitationRepo repository.InvitationRepository,
	pendingRegRepo repository.PendingRegistrationRepository,
	identity service.IdentityProvider,
	payments service.PaymentProvider,
	logger service.Logger,
	frontendURL, marketingURL, backendURL string,
) *AuthService {
	return &AuthService{
		userRepo:       userRepo,
		companyRepo:    companyRepo,
		invitationRepo: invitationRepo,
		pendingRegRepo: pendingRegRepo,
		identity:       identity,
		payments:       payments,
		logger:         logger,
		frontendURL:    frontendURL,
		marketingURL:   marketingURL,
		backendURL:     backendURL,
	}
}

// CheckEmailExists checks if an email is already registered.
func (s *AuthService) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	exists, err := s.identity.CheckEmailExists(ctx, email)
	if err != nil {
		s.logger.Error("failed to check email exists", "email", email, "error", err)
		return false, domainerrors.ErrExternalService.WithCause(err)
	}
	return exists, nil
}

// Register creates a pending registration and returns the Stripe checkout URL.
// The actual account (Kratos identity, Company, User) is created after payment via webhook.
func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest) (*dto.RegisterResponse, error) {
	log := s.logger.With("email", req.Email, "company", req.CompanyName)

	// Step 1: Check if email already exists in Kratos
	exists, err := s.identity.CheckEmailExists(ctx, req.Email)
	if err != nil {
		log.Error("failed to check email exists in Kratos", "error", err)
		return nil, domainerrors.ErrExternalService.WithCause(err)
	}
	if exists {
		return nil, domainerrors.ErrEmailAlreadyExists
	}

	// Step 2: Check if email already has a pending registration
	pendingExists, err := s.pendingRegRepo.ExistsByEmail(ctx, req.Email)
	if err != nil {
		log.Error("failed to check pending registration", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if pendingExists {
		// Return a message that guides user to complete payment or wait
		return nil, domainerrors.ErrEmailAlreadyExists.WithMessage("a registration is already in progress for this email")
	}

	// Step 3: Validate plan requires payment (this flow is for paid plans only)
	if !req.Plan.RequiresPayment() {
		log.Error("Register() called for non-paid plan", "plan", req.Plan)
		return nil, domainerrors.ErrInvalidPlan.WithMessage("this registration flow requires a paid plan")
	}

	// Step 4: Hash password with bcrypt
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Error("failed to hash password", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to process credentials")
	}

	// Step 5: Create Stripe checkout session
	seatCount := req.SeatCount
	if seatCount < 1 {
		seatCount = 1
	}

	successURL := s.marketingURL + "/?checkout=success"
	log.Info("creating checkout session", "plan", req.Plan, "seats", seatCount, "successURL", successURL, "marketingURL", s.marketingURL)
	checkoutSession, err := s.payments.CreateCheckoutSession(ctx, service.CheckoutRequest{
		CompanyID:  uuid.Nil, // No company yet - will be created after payment
		Email:      req.Email,
		Plan:       req.Plan,
		SeatCount:  seatCount,
		SuccessURL: successURL,
		CancelURL:  s.frontendURL + "/auth/registration?checkout=canceled",
	})
	if err != nil {
		log.Error("failed to create checkout session", "error", err)
		return nil, domainerrors.ErrExternalService.WithMessage("failed to create payment session")
	}

	// Step 6: Store pending registration with checkout session ID
	var industry, teamSize *string
	if req.Industry != "" {
		industry = &req.Industry
	}
	if req.TeamSize != "" {
		teamSize = &req.TeamSize
	}

	pendingReg := &entity.PendingRegistration{
		CheckoutSessionID: checkoutSession.ID,
		Email:             req.Email,
		PasswordHash:      string(passwordHash),
		FirstName:         req.FirstName,
		LastName:          req.LastName,
		CompanyName:       req.CompanyName,
		Industry:          industry,
		TeamSize:          teamSize,
		Plan:              req.Plan,
		SeatCount:         seatCount,
		Status:            valueobject.PendingRegistrationStatusPending,
		ExpiresAt:         time.Now().Add(24 * time.Hour),
	}

	if err := s.pendingRegRepo.Create(ctx, pendingReg); err != nil {
		log.Error("failed to create pending registration", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to save registration")
	}

	log.Info("pending registration created", "checkoutSessionID", checkoutSession.ID)

	return &dto.RegisterResponse{
		CheckoutURL: checkoutSession.URL,
		Email:       req.Email,
		// User and Company are nil - they will be created after payment
	}, nil
}

// CompleteCheckoutResult contains the result of checkout completion.
type CompleteCheckoutResult struct {
	RedirectURL string
}

// CompleteCheckout handles post-checkout processing.
// Validates the Stripe session and redirects to the dashboard.
// The user should already have a valid session from registration (session token set as cookie before Stripe redirect).
func (s *AuthService) CompleteCheckout(ctx context.Context, sessionID string) (*CompleteCheckoutResult, error) {
	log := s.logger.With("sessionID", sessionID)

	// Fetch checkout session from Stripe to validate and get metadata
	sess, err := s.payments.GetCheckoutSession(ctx, sessionID)
	if err != nil {
		log.Error("failed to get Stripe session", "error", err)
		return &CompleteCheckoutResult{
			RedirectURL: s.frontendURL + "/auth/login?error=invalid_session",
		}, nil
	}

	if sess.CompanyID == uuid.Nil {
		log.Error("no company_id in session metadata")
		return &CompleteCheckoutResult{
			RedirectURL: s.frontendURL + "/auth/login?error=invalid_session",
		}, nil
	}

	// Verify the company owner exists and has correct role
	user, err := s.userRepo.GetOwnerByCompanyID(ctx, sess.CompanyID)
	if err != nil || user == nil {
		log.Error("failed to find company owner", "companyID", sess.CompanyID, "error", err)
		return &CompleteCheckoutResult{
			RedirectURL: s.frontendURL + "/auth/login?error=user_not_found",
		}, nil
	}

	// Verify user has owner role (tenant admin)
	if user.Role != valueobject.RoleOwner {
		log.Error("user is not company owner", "userID", user.ID, "role", user.Role)
		return &CompleteCheckoutResult{
			RedirectURL: s.frontendURL + "/auth/login?error=invalid_role",
		}, nil
	}

	log.Info("checkout completed, creating session for redirect",
		"userID", user.ID,
		"companyID", sess.CompanyID,
		"kratosID", user.KratosID,
	)

	// Create a fresh session token for the user.
	// The original session token from registration may not persist through Stripe's redirect,
	// so we create a new one using the Kratos admin API.
	sessionToken, err := s.identity.CreateSessionForIdentity(ctx, user.KratosID.String())
	if err != nil {
		log.Warn("failed to create session for checkout completion", "error", err)
		// Fall back to redirect without token - user can log in manually
		return &CompleteCheckoutResult{
			RedirectURL: s.frontendURL + "/dashboard?checkout=success",
		}, nil
	}

	log.Info("session created, redirecting to dashboard with auth token",
		"tokenLength", len(sessionToken.Token),
	)

	return &CompleteCheckoutResult{
		RedirectURL: s.frontendURL + "/dashboard?checkout=success&auth_token=" + sessionToken.Token,
	}, nil
}

// Onboard handles user onboarding (for users who registered but need to set up company).
func (s *AuthService) Onboard(ctx context.Context, kratosID uuid.UUID, req dto.OnboardRequest, email string) (*dto.OnboardResponse, error) {
	log := s.logger.With("kratosID", kratosID, "company", req.CompanyName)

	// Get user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Check if user is already onboarded
	if user.CompanyID != nil {
		return nil, domainerrors.ErrUserAlreadyOnboarded
	}

	// Create company
	var industry, teamSize *string
	if req.Industry != "" {
		industry = &req.Industry
	}
	if req.TeamSize != "" {
		teamSize = &req.TeamSize
	}

	company := &entity.Company{
		Name:               req.CompanyName,
		Industry:           industry,
		TeamSize:           teamSize,
		Plan:               req.Plan,
		SubscriptionStatus: valueobject.SubscriptionStatusNone,
	}

	if err := s.companyRepo.Create(ctx, company); err != nil {
		log.Error("failed to create company", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to create company")
	}

	// Update user with company and owner role
	user.CompanyID = &company.ID
	user.Role = valueobject.RoleOwner
	if err := s.userRepo.Update(ctx, user); err != nil {
		log.Error("failed to update user", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to update user")
	}

	response := &dto.OnboardResponse{
		User:    dto.FromUser(user),
		Company: dto.FromCompany(company),
	}

	// Create checkout session for paid plans
	if req.Plan.RequiresPayment() {
		seatCount := req.SeatCount
		if seatCount < 1 {
			seatCount = 1
		}

		sess, err := s.payments.CreateCheckoutSession(ctx, service.CheckoutRequest{
			CompanyID:  company.ID,
			Email:      email,
			Plan:       req.Plan,
			SeatCount:  seatCount,
			SuccessURL: s.frontendURL + "/dashboard?onboarding=complete",
			CancelURL:  s.frontendURL + "/onboarding?checkout=canceled",
		})
		if err != nil {
			log.Warn("failed to create checkout session", "error", err)
		} else {
			response.CheckoutURL = sess.URL
		}
	}

	log.Info("onboarding completed", "userID", user.ID, "companyID", company.ID)
	return response, nil
}

// SubmitEnterpriseContact handles enterprise contact form submissions.
// TODO: Store in database and send notification when infrastructure is ready.
func (s *AuthService) SubmitEnterpriseContact(ctx context.Context, req dto.EnterpriseContactRequest) error {
	s.logger.Info("enterprise contact submitted",
		"companyName", req.CompanyName,
		"industry", req.Industry,
		"teamSize", req.TeamSize,
		"name", req.Name,
		"email", req.Email,
		"phone", req.Phone,
		"message", req.Message,
	)
	// TODO: Store in database
	// TODO: Send notification to sales team
	return nil
}

// RegisterWithInvitation creates a new user account for an invited user.
// This is a simplified registration flow that skips company/plan selection.
// The user joins the inviting company with the role specified in the invitation.
func (s *AuthService) RegisterWithInvitation(ctx context.Context, req dto.RegisterWithInvitationRequest) (*dto.RegisterWithInvitationResponse, error) {
	log := s.logger.With("token", req.Token[:8]+"...")

	// Step 1: Get and validate invitation
	invitation, err := s.invitationRepo.GetByToken(ctx, req.Token)
	if err != nil {
		log.Error("failed to get invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// Step 2: Check invitation status
	if !invitation.CanBeAccepted() {
		if invitation.IsExpired() {
			return nil, domainerrors.ErrInvitationExpired
		}
		if invitation.Status == valueobject.InvitationStatusRevoked {
			return nil, domainerrors.ErrInvitationRevoked
		}
		if invitation.Status == valueobject.InvitationStatusAccepted {
			return nil, domainerrors.ErrInvitationAlreadyAccepted
		}
		return nil, domainerrors.ErrInvitationInvalid
	}

	log = log.With("email", invitation.Email)

	// Step 3: Create identity in Kratos
	identity, err := s.identity.CreateIdentity(ctx, service.CreateIdentityRequest{
		Email:     invitation.Email,
		Password:  req.Password,
		FirstName: req.FirstName,
		LastName:  req.LastName,
	})
	if err != nil {
		log.Error("failed to create Kratos identity", "error", err)
		if err.Error() == "an account with this email already exists" {
			return nil, domainerrors.ErrEmailAlreadyExists
		}
		return nil, domainerrors.ErrExternalService.WithMessage(err.Error())
	}

	kratosID, err := uuid.Parse(identity.ID)
	if err != nil {
		log.Error("failed to parse Kratos ID", "kratosID", identity.ID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Step 4: Create user with company, tenant, and role from invitation
	user := &entity.User{
		TenantID:  &invitation.TenantID,
		KratosID:  kratosID,
		CompanyID: &invitation.CompanyID,
		Role:      invitation.Role,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		log.Error("failed to create user", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to create user")
	}

	// Step 5: Mark invitation as accepted
	invitation.Accept(user.ID)
	if err := s.invitationRepo.Update(ctx, invitation); err != nil {
		log.Error("failed to update invitation", "error", err)
		// Don't fail - user is created, just log the error
	}

	// Step 6: Get company details
	company, err := s.companyRepo.GetByID(ctx, invitation.CompanyID)
	if err != nil {
		log.Error("failed to get company", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Step 7: Perform login to get a session token
	log.Info("performing login to create session")
	sessionToken, err := s.identity.PerformLogin(ctx, invitation.Email, req.Password)
	if err != nil {
		log.Error("failed to create session after registration", "error", err)
		return nil, domainerrors.ErrExternalService.WithMessage("registration succeeded but login failed")
	}

	log.Info("invited user registered successfully", "userID", user.ID, "companyID", invitation.CompanyID)
	return &dto.RegisterWithInvitationResponse{
		User:         dto.FromUser(user),
		Company:      dto.FromCompany(company),
		SessionToken: sessionToken.Token,
	}, nil
}
