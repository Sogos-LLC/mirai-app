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
	userRepo       repository.UserRepository
	companyRepo    repository.CompanyRepository
	invitationRepo repository.InvitationRepository
	identity       service.IdentityProvider
	payments       service.PaymentProvider
	logger         service.Logger
	frontendURL    string
	backendURL     string
}

// NewAuthService creates a new auth service.
func NewAuthService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	invitationRepo repository.InvitationRepository,
	identity service.IdentityProvider,
	payments service.PaymentProvider,
	logger service.Logger,
	frontendURL, backendURL string,
) *AuthService {
	return &AuthService{
		userRepo:       userRepo,
		companyRepo:    companyRepo,
		invitationRepo: invitationRepo,
		identity:       identity,
		payments:       payments,
		logger:         logger,
		frontendURL:    frontendURL,
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

	// Step 4: Create user with company and role from invitation
	user := &entity.User{
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
