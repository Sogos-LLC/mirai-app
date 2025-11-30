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

// AuthService handles authentication and registration business logic.
type AuthService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
	identity    service.IdentityProvider
	payments    service.PaymentProvider
	logger      service.Logger
	frontendURL string
	backendURL  string
}

// NewAuthService creates a new auth service.
func NewAuthService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	identity service.IdentityProvider,
	payments service.PaymentProvider,
	logger service.Logger,
	frontendURL, backendURL string,
) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		identity:    identity,
		payments:    payments,
		logger:      logger,
		frontendURL: frontendURL,
		backendURL:  backendURL,
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

// Register creates a new user identity, company, and user record.
func (s *AuthService) Register(ctx context.Context, req dto.RegisterRequest) (*dto.RegisterResponse, error) {
	log := s.logger.With("email", req.Email, "company", req.CompanyName)

	// Step 1: Create identity in Kratos
	identity, err := s.identity.CreateIdentity(ctx, service.CreateIdentityRequest{
		Email:     req.Email,
		Password:  req.Password,
		FirstName: req.FirstName,
		LastName:  req.LastName,
	})
	if err != nil {
		log.Error("failed to create Kratos identity", "error", err)
		// Check if it's a duplicate email error
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

	// Step 2: Create company
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
		// TODO: Consider rolling back Kratos identity on failure
		return nil, domainerrors.ErrInternal.WithMessage("failed to create company")
	}

	// Step 3: Create user as owner
	user := &entity.User{
		KratosID:  kratosID,
		CompanyID: &company.ID,
		Role:      valueobject.RoleOwner,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		log.Error("failed to create user", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("failed to create user")
	}

	response := &dto.RegisterResponse{
		User:    dto.FromUser(user),
		Company: dto.FromCompany(company),
	}

	// Step 4: Perform login to get a session token
	// We do this while we still have the password, so the user has a session before Stripe checkout
	log.Info("performing login to create session")
	sessionToken, err := s.identity.PerformLogin(ctx, req.Email, req.Password)
	if err != nil {
		log.Warn("failed to create session after registration", "error", err)
		// Don't fail registration - user can log in manually
	} else {
		log.Info("session created for new user", "tokenLength", len(sessionToken.Token))
		response.SessionToken = sessionToken.Token
	}

	// Step 5: For non-enterprise plans, create Stripe checkout session
	log.Info("checking if plan requires payment", "plan", req.Plan, "requiresPayment", req.Plan.RequiresPayment())
	if req.Plan.RequiresPayment() {
		seatCount := req.SeatCount
		if seatCount < 1 {
			seatCount = 1
		}

		log.Info("creating checkout session", "plan", req.Plan, "seats", seatCount)
		checkoutSession, err := s.payments.CreateCheckoutSession(ctx, service.CheckoutRequest{
			CompanyID:  company.ID,
			Email:      req.Email,
			Plan:       req.Plan,
			SeatCount:  seatCount,
			SuccessURL: s.backendURL + "/api/v1/auth/complete-checkout?session_id={CHECKOUT_SESSION_ID}",
			CancelURL:  s.frontendURL + "/auth/registration?checkout=canceled",
		})
		if err != nil {
			log.Error("failed to create checkout session", "error", err)
			// Don't fail registration - just log and continue
		} else {
			log.Info("checkout session created", "url", checkoutSession.URL)
			response.CheckoutURL = checkoutSession.URL
		}
	} else {
		log.Info("plan does not require payment, skipping checkout")
	}

	log.Info("registration completed", "userID", user.ID, "companyID", company.ID)
	return response, nil
}

// CompleteCheckoutResult contains the result of checkout completion.
type CompleteCheckoutResult struct {
	RedirectURL string
}

// CompleteCheckout handles post-checkout processing.
// Validates the Stripe session and redirects to dashboard.
// Note: User session is created during registration (via PerformLogin), so the cookie
// should already be set in the browser before the Stripe redirect.
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

	log.Info("checkout completed, redirecting to dashboard",
		"userID", user.ID,
		"companyID", sess.CompanyID,
		"kratosID", user.KratosID,
	)

	// User's session was created during registration.
	// The frontend sets the session_token as a cookie before redirecting to Stripe.
	// That cookie should still be valid, so just redirect to dashboard.
	return &CompleteCheckoutResult{
		RedirectURL: s.frontendURL + "/dashboard?checkout=success",
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
