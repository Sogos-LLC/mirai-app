package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

const (
	// InvitationExpiryDuration is how long an invitation is valid
	InvitationExpiryDuration = 7 * 24 * time.Hour // 7 days
)

// InvitationService handles invitation-related business logic.
type InvitationService struct {
	userRepo       repository.UserRepository
	companyRepo    repository.CompanyRepository
	invitationRepo repository.InvitationRepository
	payments       service.PaymentProvider
	email          service.EmailProvider
	logger         service.Logger
	frontendURL    string
}

// NewInvitationService creates a new invitation service.
func NewInvitationService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	invitationRepo repository.InvitationRepository,
	payments service.PaymentProvider,
	email service.EmailProvider,
	logger service.Logger,
	frontendURL string,
) *InvitationService {
	return &InvitationService{
		userRepo:       userRepo,
		companyRepo:    companyRepo,
		invitationRepo: invitationRepo,
		payments:       payments,
		email:          email,
		logger:         logger,
		frontendURL:    frontendURL,
	}
}

// CreateInvitation creates a new invitation and sends an email.
func (s *InvitationService) CreateInvitation(
	ctx context.Context,
	kratosID uuid.UUID,
	req dto.CreateInvitationRequest,
) (*dto.InvitationResponse, error) {
	log := s.logger.With("kratosID", kratosID, "email", req.Email)

	// 1. Get current user and verify permissions
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		log.Error("failed to get user", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanInviteUsers() {
		return nil, domainerrors.ErrForbidden.WithMessage("only owners and admins can invite users")
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	companyID := *user.CompanyID

	// 2. Get company to check seats and get name for email
	company, err := s.companyRepo.GetByID(ctx, companyID)
	if err != nil {
		log.Error("failed to get company", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if company == nil {
		return nil, domainerrors.ErrCompanyNotFound
	}

	// 3. Check seat availability
	seatInfo, err := s.getSeatInfo(ctx, company)
	if err != nil {
		log.Error("failed to get seat info", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if seatInfo.AvailableSeats <= 0 {
		return nil, domainerrors.ErrSeatLimitExceeded
	}

	// 4. Check if email already has a pending invitation
	existingInv, err := s.invitationRepo.GetByEmailAndCompanyID(ctx, req.Email, companyID)
	if err != nil {
		log.Error("failed to check existing invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if existingInv != nil {
		return nil, domainerrors.ErrEmailAlreadyInvited
	}

	// 5. Generate invitation token
	// Note: Email duplicate check would need to be done via Kratos identity provider
	token, err := generateSecureToken()
	if err != nil {
		log.Error("failed to generate token", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// 7. Create invitation
	invitation := entity.NewInvitation(
		companyID,
		req.Email,
		req.Role,
		token,
		user.ID,
		InvitationExpiryDuration,
	)

	if err := s.invitationRepo.Create(ctx, invitation); err != nil {
		log.Error("failed to create invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// 8. Send invitation email (if email provider is configured)
	if s.email != nil {
		inviteURL := s.frontendURL + "/auth/accept-invite?token=" + token
		if err := s.email.SendInvitation(ctx, service.SendInvitationRequest{
			To:          req.Email,
			InviterName: "Team Admin", // Could be enhanced to use actual name from Kratos
			CompanyName: company.Name,
			InviteURL:   inviteURL,
			ExpiresAt:   invitation.ExpiresAt.Format("January 2, 2006"),
		}); err != nil {
			log.Warn("failed to send invitation email", "error", err)
			// Don't fail the request - invitation is created
		}
	}

	log.Info("invitation created", "invitationID", invitation.ID)
	return dto.FromInvitation(invitation), nil
}

// ListInvitations returns all invitations for the user's company.
func (s *InvitationService) ListInvitations(
	ctx context.Context,
	kratosID uuid.UUID,
	statusFilters ...valueobject.InvitationStatus,
) ([]*dto.InvitationResponse, error) {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		log.Error("failed to get user", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanInviteUsers() {
		return nil, domainerrors.ErrForbidden
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	invitations, err := s.invitationRepo.ListByCompanyID(ctx, *user.CompanyID, statusFilters...)
	if err != nil {
		log.Error("failed to list invitations", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	responses := make([]*dto.InvitationResponse, len(invitations))
	for i, inv := range invitations {
		responses[i] = dto.FromInvitation(inv)
	}
	return responses, nil
}

// GetInvitation returns a specific invitation by ID.
func (s *InvitationService) GetInvitation(
	ctx context.Context,
	kratosID uuid.UUID,
	invitationID uuid.UUID,
) (*dto.InvitationResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanInviteUsers() {
		return nil, domainerrors.ErrForbidden
	}

	invitation, err := s.invitationRepo.GetByID(ctx, invitationID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// Verify user has access to this invitation
	if user.CompanyID == nil || *user.CompanyID != invitation.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	return dto.FromInvitation(invitation), nil
}

// GetInvitationByToken returns invitation details for the accept flow (public).
func (s *InvitationService) GetInvitationByToken(
	ctx context.Context,
	token string,
) (*dto.InvitationWithCompanyResponse, error) {
	invitation, err := s.invitationRepo.GetByToken(ctx, token)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// Check if invitation is valid
	if !invitation.IsPending() {
		if invitation.IsExpired() {
			return nil, domainerrors.ErrInvitationExpired
		}
		if invitation.Status == valueobject.InvitationStatusAccepted {
			return nil, domainerrors.ErrInvitationAlreadyAccepted
		}
		if invitation.Status == valueobject.InvitationStatusRevoked {
			return nil, domainerrors.ErrInvitationRevoked
		}
	}

	company, err := s.companyRepo.GetByID(ctx, invitation.CompanyID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return &dto.InvitationWithCompanyResponse{
		Invitation: dto.FromInvitation(invitation),
		Company:    dto.FromCompany(company),
	}, nil
}

// RevokeInvitation revokes a pending invitation.
func (s *InvitationService) RevokeInvitation(
	ctx context.Context,
	kratosID uuid.UUID,
	invitationID uuid.UUID,
) (*dto.InvitationResponse, error) {
	log := s.logger.With("kratosID", kratosID, "invitationID", invitationID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanInviteUsers() {
		return nil, domainerrors.ErrForbidden
	}

	invitation, err := s.invitationRepo.GetByID(ctx, invitationID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// Verify user has access
	if user.CompanyID == nil || *user.CompanyID != invitation.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	if !invitation.CanBeRevoked() {
		return nil, domainerrors.ErrInvitationAlreadyAccepted
	}

	invitation.Revoke()
	if err := s.invitationRepo.Update(ctx, invitation); err != nil {
		log.Error("failed to revoke invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("invitation revoked")
	return dto.FromInvitation(invitation), nil
}

// AcceptInvitation accepts an invitation after user registration.
func (s *InvitationService) AcceptInvitation(
	ctx context.Context,
	kratosID uuid.UUID,
	token string,
	userEmail string,
) (*dto.AcceptInvitationResponse, error) {
	log := s.logger.With("kratosID", kratosID, "token", token[:8]+"...")

	// 1. Get invitation by token
	invitation, err := s.invitationRepo.GetByToken(ctx, token)
	if err != nil {
		log.Error("failed to get invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// 2. Validate invitation state
	if !invitation.CanBeAccepted() {
		if invitation.IsExpired() {
			return nil, domainerrors.ErrInvitationExpired
		}
		return nil, domainerrors.ErrInvitationAlreadyAccepted
	}

	// 3. Verify email matches
	if userEmail != invitation.Email {
		return nil, domainerrors.ErrInvitationEmailMismatch
	}

	// 4. Get accepting user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		log.Error("failed to get user", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// 5. Check user doesn't already belong to a company
	if user.CompanyID != nil {
		return nil, domainerrors.ErrForbidden.WithMessage("user already belongs to a company")
	}

	// 6. Update user with company and role
	user.CompanyID = &invitation.CompanyID
	user.Role = invitation.Role
	if err := s.userRepo.Update(ctx, user); err != nil {
		log.Error("failed to update user", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// 7. Mark invitation as accepted
	invitation.Accept(user.ID)
	if err := s.invitationRepo.Update(ctx, invitation); err != nil {
		log.Error("failed to update invitation", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// 8. Get company details
	company, err := s.companyRepo.GetByID(ctx, invitation.CompanyID)
	if err != nil {
		log.Error("failed to get company", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("invitation accepted", "userID", user.ID, "companyID", invitation.CompanyID)
	return &dto.AcceptInvitationResponse{
		Invitation: dto.FromInvitation(invitation),
		User:       dto.FromUser(user),
		Company:    dto.FromCompany(company),
	}, nil
}

// ResendInvitation resends an invitation email.
func (s *InvitationService) ResendInvitation(
	ctx context.Context,
	kratosID uuid.UUID,
	invitationID uuid.UUID,
) (*dto.InvitationResponse, error) {
	log := s.logger.With("kratosID", kratosID, "invitationID", invitationID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanInviteUsers() {
		return nil, domainerrors.ErrForbidden
	}

	invitation, err := s.invitationRepo.GetByID(ctx, invitationID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if invitation == nil {
		return nil, domainerrors.ErrInvitationNotFound
	}

	// Verify user has access
	if user.CompanyID == nil || *user.CompanyID != invitation.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	if !invitation.IsPending() {
		return nil, domainerrors.ErrInvitationExpired
	}

	// Get company for email
	company, err := s.companyRepo.GetByID(ctx, invitation.CompanyID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Send email
	if s.email != nil {
		inviteURL := s.frontendURL + "/auth/accept-invite?token=" + invitation.Token
		if err := s.email.SendInvitation(ctx, service.SendInvitationRequest{
			To:          invitation.Email,
			InviterName: "Team Admin",
			CompanyName: company.Name,
			InviteURL:   inviteURL,
			ExpiresAt:   invitation.ExpiresAt.Format("January 2, 2006"),
		}); err != nil {
			log.Error("failed to resend invitation email", "error", err)
			return nil, domainerrors.ErrExternalService.WithCause(err)
		}
	}

	log.Info("invitation resent")
	return dto.FromInvitation(invitation), nil
}

// GetSeatInfo returns seat usage information for the user's company.
func (s *InvitationService) GetSeatInfo(
	ctx context.Context,
	kratosID uuid.UUID,
) (*dto.SeatInfoResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	company, err := s.companyRepo.GetByID(ctx, *user.CompanyID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return s.getSeatInfo(ctx, company)
}

// getSeatInfo calculates seat usage for a company.
func (s *InvitationService) getSeatInfo(
	ctx context.Context,
	company *entity.Company,
) (*dto.SeatInfoResponse, error) {
	// Count active users
	users, err := s.userRepo.ListByCompanyID(ctx, company.ID)
	if err != nil {
		return nil, err
	}

	// Count pending invitations
	pendingCount, err := s.invitationRepo.CountPendingByCompanyID(ctx, company.ID)
	if err != nil {
		return nil, err
	}

	// Get total seats from Stripe subscription if available
	totalSeats := company.Plan.DefaultSeatLimit()
	if company.StripeSubscriptionID != nil && *company.StripeSubscriptionID != "" && s.payments != nil {
		sub, err := s.payments.GetSubscription(ctx, *company.StripeSubscriptionID)
		if err == nil && sub.SeatCount > 0 {
			totalSeats = sub.SeatCount
		}
		// If Stripe lookup fails, fall back to plan default (already set)
	}

	usedSeats := len(users)
	availableSeats := totalSeats - usedSeats - pendingCount
	if availableSeats < 0 {
		availableSeats = 0
	}

	return &dto.SeatInfoResponse{
		TotalSeats:         totalSeats,
		UsedSeats:          usedSeats,
		PendingInvitations: pendingCount,
		AvailableSeats:     availableSeats,
	}, nil
}

// generateSecureToken generates a cryptographically secure random token.
func generateSecureToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
