package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/dto"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// CompanyService handles company-related business logic.
type CompanyService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
	logger      service.Logger
}

// NewCompanyService creates a new company service.
func NewCompanyService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	logger service.Logger,
) *CompanyService {
	return &CompanyService{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		logger:      logger,
	}
}

// GetCompany retrieves the company for the current user.
func (s *CompanyService) GetCompany(ctx context.Context, kratosID uuid.UUID) (*dto.CompanyResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	company, err := s.companyRepo.GetByID(ctx, *user.CompanyID)
	if err != nil || company == nil {
		return nil, domainerrors.ErrCompanyNotFound
	}

	return dto.FromCompany(company), nil
}

// UpdateCompany updates the company for the current user.
func (s *CompanyService) UpdateCompany(ctx context.Context, kratosID uuid.UUID, req dto.UpdateCompanyRequest) (*dto.CompanyResponse, error) {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Check permissions
	if !user.CanManageCompany() {
		return nil, domainerrors.ErrForbidden.WithMessage("only owners and admins can update company settings")
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	company, err := s.companyRepo.GetByID(ctx, *user.CompanyID)
	if err != nil || company == nil {
		return nil, domainerrors.ErrCompanyNotFound
	}

	// Apply updates
	if req.Name != "" {
		company.Name = req.Name
	}
	if req.Industry != "" {
		company.Industry = &req.Industry
	}
	if req.TeamSize != "" {
		company.TeamSize = &req.TeamSize
	}

	if err := s.companyRepo.Update(ctx, company); err != nil {
		log.Error("failed to update company", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("company updated", "companyID", company.ID)
	return dto.FromCompany(company), nil
}
