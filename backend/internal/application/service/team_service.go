package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// TeamService handles team-related business logic.
type TeamService struct {
	userRepo    repository.UserRepository
	companyRepo repository.CompanyRepository
	teamRepo    repository.TeamRepository
	logger      service.Logger
}

// NewTeamService creates a new team service.
func NewTeamService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	teamRepo repository.TeamRepository,
	logger service.Logger,
) *TeamService {
	return &TeamService{
		userRepo:    userRepo,
		companyRepo: companyRepo,
		teamRepo:    teamRepo,
		logger:      logger,
	}
}

// ListTeams retrieves all teams for the current user's company.
func (s *TeamService) ListTeams(ctx context.Context, kratosID uuid.UUID) ([]*dto.TeamResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	teams, err := s.teamRepo.ListByCompanyID(ctx, *user.CompanyID)
	if err != nil {
		s.logger.Error("failed to list teams", "companyID", user.CompanyID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	responses := make([]*dto.TeamResponse, len(teams))
	for i, t := range teams {
		responses[i] = dto.FromTeam(t)
	}
	return responses, nil
}

// CreateTeam creates a new team.
func (s *TeamService) CreateTeam(ctx context.Context, kratosID uuid.UUID, req dto.CreateTeamRequest) (*dto.TeamResponse, error) {
	log := s.logger.With("kratosID", kratosID, "teamName", req.Name)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Check permissions
	if !user.CanManageTeams() {
		return nil, domainerrors.ErrForbidden.WithMessage("only owners and admins can create teams")
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	var description *string
	if req.Description != "" {
		description = &req.Description
	}

	team := &entity.Team{
		CompanyID:   *user.CompanyID,
		Name:        req.Name,
		Description: description,
	}

	if err := s.teamRepo.Create(ctx, team); err != nil {
		log.Error("failed to create team", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("team created", "teamID", team.ID)
	return dto.FromTeam(team), nil
}

// GetTeam retrieves a team by ID.
func (s *TeamService) GetTeam(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID) (*dto.TeamResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return nil, domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	return dto.FromTeam(team), nil
}

// UpdateTeam updates a team.
func (s *TeamService) UpdateTeam(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID, req dto.UpdateTeamRequest) (*dto.TeamResponse, error) {
	log := s.logger.With("kratosID", kratosID, "teamID", teamID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Check permissions
	if !user.CanManageTeams() {
		return nil, domainerrors.ErrForbidden.WithMessage("only owners and admins can update teams")
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return nil, domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	// Apply updates
	if req.Name != "" {
		team.Name = req.Name
	}
	if req.Description != "" {
		team.Description = &req.Description
	}

	if err := s.teamRepo.Update(ctx, team); err != nil {
		log.Error("failed to update team", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("team updated")
	return dto.FromTeam(team), nil
}

// DeleteTeam deletes a team.
func (s *TeamService) DeleteTeam(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "teamID", teamID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	// Check permissions
	if !user.CanManageTeams() {
		return domainerrors.ErrForbidden.WithMessage("only owners and admins can delete teams")
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return domainerrors.ErrForbidden
	}

	if err := s.teamRepo.Delete(ctx, teamID); err != nil {
		log.Error("failed to delete team", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("team deleted")
	return nil
}

// ListMembers retrieves all members of a team.
func (s *TeamService) ListMembers(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID) ([]*dto.TeamMemberResponse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return nil, domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	members, err := s.teamRepo.ListMembers(ctx, teamID)
	if err != nil {
		s.logger.Error("failed to list team members", "teamID", teamID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	responses := make([]*dto.TeamMemberResponse, len(members))
	for i, m := range members {
		responses[i] = dto.FromTeamMember(m)
	}
	return responses, nil
}

// AddMember adds a member to a team.
func (s *TeamService) AddMember(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID, req dto.AddTeamMemberRequest) (*dto.TeamMemberResponse, error) {
	log := s.logger.With("kratosID", kratosID, "teamID", teamID, "userID", req.UserID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Check permissions (owner, admin, or team lead)
	canManage := user.CanManageTeams()
	if !canManage {
		// Check if user is team lead
		member, _ := s.teamRepo.GetMember(ctx, teamID, user.ID)
		if member != nil && member.CanManageTeam() {
			canManage = true
		}
	}
	if !canManage {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to add team members")
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return nil, domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return nil, domainerrors.ErrForbidden
	}

	// Verify target user exists and is in same company
	targetUser, err := s.userRepo.GetByID(ctx, req.UserID)
	if err != nil || targetUser == nil {
		return nil, domainerrors.ErrUserNotFound
	}
	if targetUser.CompanyID == nil || *targetUser.CompanyID != *user.CompanyID {
		return nil, domainerrors.ErrUserNotInCompany
	}

	// Check if already a member
	existing, _ := s.teamRepo.GetMember(ctx, teamID, req.UserID)
	if existing != nil {
		return nil, domainerrors.ErrUserAlreadyInTeam
	}

	member := &entity.TeamMember{
		TeamID: teamID,
		UserID: req.UserID,
		Role:   req.Role,
	}

	if err := s.teamRepo.AddMember(ctx, member); err != nil {
		log.Error("failed to add team member", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("team member added")
	return dto.FromTeamMember(member), nil
}

// RemoveMember removes a member from a team.
func (s *TeamService) RemoveMember(ctx context.Context, kratosID uuid.UUID, teamID uuid.UUID, userID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "teamID", teamID, "userID", userID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	// Check permissions (owner, admin, or team lead)
	canManage := user.CanManageTeams()
	if !canManage {
		member, _ := s.teamRepo.GetMember(ctx, teamID, user.ID)
		if member != nil && member.CanManageTeam() {
			canManage = true
		}
	}
	if !canManage {
		return domainerrors.ErrForbidden.WithMessage("insufficient permissions to remove team members")
	}

	team, err := s.teamRepo.GetByID(ctx, teamID)
	if err != nil || team == nil {
		return domainerrors.ErrTeamNotFound
	}

	// Verify team belongs to user's company
	if user.CompanyID == nil || team.CompanyID != *user.CompanyID {
		return domainerrors.ErrForbidden
	}

	if err := s.teamRepo.RemoveMember(ctx, teamID, userID); err != nil {
		log.Error("failed to remove team member", "error", err)
		return domainerrors.ErrTeamMemberNotFound
	}

	log.Info("team member removed")
	return nil
}
