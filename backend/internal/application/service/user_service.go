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

// UserService handles user-related business logic.
type UserService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
	identity    service.IdentityProvider
	payments    service.PaymentProvider
	logger      service.Logger
	frontendURL string
}

// NewUserService creates a new user service.
func NewUserService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	identity service.IdentityProvider,
	payments service.PaymentProvider,
	logger service.Logger,
	frontendURL string,
) *UserService {
	return &UserService{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		identity:    identity,
		payments:    payments,
		logger:      logger,
		frontendURL: frontendURL,
	}
}

// GetCurrentUser retrieves the current user with their company.
func (s *UserService) GetCurrentUser(ctx context.Context, kratosID uuid.UUID) (*dto.UserWithCompanyResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		s.logger.Error("failed to get user", "kratosID", kratosID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Fetch identity data from Kratos for name/email
	var email, firstName, lastName string
	identity, err := s.identity.GetIdentity(ctx, user.KratosID.String())
	if err != nil {
		s.logger.Warn("failed to get identity from Kratos", "kratosID", user.KratosID, "error", err)
	} else if identity != nil {
		email = identity.Email
		firstName = identity.FirstName
		lastName = identity.LastName
	}

	response := &dto.UserWithCompanyResponse{
		User: dto.FromUserWithIdentity(user, email, firstName, lastName),
	}

	// Get company if user has one
	if user.CompanyID != nil {
		company, err := s.companyRepo.GetByID(ctx, *user.CompanyID)
		if err != nil {
			s.logger.Warn("failed to get company", "companyID", user.CompanyID, "error", err)
		} else if company != nil {
			response.Company = dto.FromCompany(company)
		}
	}

	return response, nil
}

// Onboard handles user onboarding (for users who registered but need to set up company).
func (s *UserService) Onboard(ctx context.Context, kratosID uuid.UUID, req dto.OnboardRequest, email string) (*dto.OnboardResponse, error) {
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

// GetUserByID retrieves a user by their ID.
func (s *UserService) GetUserByID(ctx context.Context, id uuid.UUID) (*dto.UserResponse, error) {
	user, err := s.userRepo.GetByID(ctx, id)
	if err != nil {
		s.logger.Error("failed to get user", "id", id, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Fetch identity data from Kratos
	identity, err := s.identity.GetIdentity(ctx, user.KratosID.String())
	if err != nil {
		s.logger.Warn("failed to get identity from Kratos", "kratosID", user.KratosID, "error", err)
		return dto.FromUser(user), nil
	}
	if identity == nil {
		return dto.FromUser(user), nil
	}

	return dto.FromUserWithIdentity(user, identity.Email, identity.FirstName, identity.LastName), nil
}

// ListUsersByCompany retrieves all users in a company.
func (s *UserService) ListUsersByCompany(ctx context.Context, kratosID uuid.UUID) ([]*dto.UserResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	users, err := s.userRepo.ListByCompanyID(ctx, *user.CompanyID)
	if err != nil {
		s.logger.Error("failed to list users", "companyID", user.CompanyID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	responses := make([]*dto.UserResponse, len(users))
	for i, u := range users {
		// Fetch identity data from Kratos for each user
		identity, err := s.identity.GetIdentity(ctx, u.KratosID.String())
		if err != nil {
			s.logger.Warn("failed to get identity from Kratos", "kratosID", u.KratosID, "error", err)
			responses[i] = dto.FromUser(u)
			continue
		}
		if identity == nil {
			responses[i] = dto.FromUser(u)
			continue
		}
		responses[i] = dto.FromUserWithIdentity(u, identity.Email, identity.FirstName, identity.LastName)
	}
	return responses, nil
}
