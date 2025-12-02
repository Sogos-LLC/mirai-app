package connect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamServiceServer implements the TeamService Connect handler.
type TeamServiceServer struct {
	miraiv1connect.UnimplementedTeamServiceHandler
	teamService *service.TeamService
}

// NewTeamServiceServer creates a new TeamServiceServer.
func NewTeamServiceServer(teamService *service.TeamService) *TeamServiceServer {
	return &TeamServiceServer{teamService: teamService}
}

// ListTeams returns all teams for the current user's company.
func (s *TeamServiceServer) ListTeams(
	ctx context.Context,
	req *connect.Request[v1.ListTeamsRequest],
) (*connect.Response[v1.ListTeamsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teams, err := s.teamService.ListTeams(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoTeams := make([]*v1.Team, len(teams))
	for i, t := range teams {
		protoTeams[i] = teamToProto(t)
	}

	return connect.NewResponse(&v1.ListTeamsResponse{
		Teams: protoTeams,
	}), nil
}

// GetTeam returns a specific team by ID.
func (s *TeamServiceServer) GetTeam(
	ctx context.Context,
	req *connect.Request[v1.GetTeamRequest],
) (*connect.Response[v1.GetTeamResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	team, err := s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetTeamResponse{
		Team: teamToProto(team),
	}), nil
}

// CreateTeam creates a new team.
func (s *TeamServiceServer) CreateTeam(
	ctx context.Context,
	req *connect.Request[v1.CreateTeamRequest],
) (*connect.Response[v1.CreateTeamResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	createReq := dto.CreateTeamRequest{
		Name:        req.Msg.Name,
		Description: derefString(req.Msg.Description),
	}

	team, err := s.teamService.CreateTeam(ctx, kratosID, createReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateTeamResponse{
		Team: teamToProto(team),
	}), nil
}

// UpdateTeam updates team information.
func (s *TeamServiceServer) UpdateTeam(
	ctx context.Context,
	req *connect.Request[v1.UpdateTeamRequest],
) (*connect.Response[v1.UpdateTeamResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	updateReq := dto.UpdateTeamRequest{
		Name:        derefString(req.Msg.Name),
		Description: derefString(req.Msg.Description),
	}

	team, err := s.teamService.UpdateTeam(ctx, kratosID, teamID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateTeamResponse{
		Team: teamToProto(team),
	}), nil
}

// DeleteTeam deletes a team.
func (s *TeamServiceServer) DeleteTeam(
	ctx context.Context,
	req *connect.Request[v1.DeleteTeamRequest],
) (*connect.Response[v1.DeleteTeamResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.teamService.DeleteTeam(ctx, kratosID, teamID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteTeamResponse{}), nil
}

// ListTeamMembers returns all members of a team.
func (s *TeamServiceServer) ListTeamMembers(
	ctx context.Context,
	req *connect.Request[v1.ListTeamMembersRequest],
) (*connect.Response[v1.ListTeamMembersResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	members, err := s.teamService.ListMembers(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoMembers := make([]*v1.TeamMember, len(members))
	for i, m := range members {
		protoMembers[i] = teamMemberToProto(m)
	}

	return connect.NewResponse(&v1.ListTeamMembersResponse{
		Members: protoMembers,
	}), nil
}

// AddTeamMember adds a user to a team.
func (s *TeamServiceServer) AddTeamMember(
	ctx context.Context,
	req *connect.Request[v1.AddTeamMemberRequest],
) (*connect.Response[v1.AddTeamMemberResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	userID, err := parseUUID(req.Msg.UserId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	addReq := dto.AddTeamMemberRequest{
		UserID: userID,
		Role:   teamRoleFromProto(req.Msg.Role),
	}

	member, err := s.teamService.AddMember(ctx, kratosID, teamID, addReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.AddTeamMemberResponse{
		Member: teamMemberToProto(member),
	}), nil
}

// RemoveTeamMember removes a user from a team.
func (s *TeamServiceServer) RemoveTeamMember(
	ctx context.Context,
	req *connect.Request[v1.RemoveTeamMemberRequest],
) (*connect.Response[v1.RemoveTeamMemberResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	userID, err := parseUUID(req.Msg.UserId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.teamService.RemoveMember(ctx, kratosID, teamID, userID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RemoveTeamMemberResponse{}), nil
}

// Helper functions

func teamToProto(t *dto.TeamResponse) *v1.Team {
	if t == nil {
		return nil
	}
	return &v1.Team{
		Id:          t.ID.String(),
		CompanyId:   t.CompanyID.String(),
		Name:        t.Name,
		Description: t.Description,
		CreatedAt:   timestamppb.New(t.CreatedAt),
		UpdatedAt:   timestamppb.New(t.UpdatedAt),
	}
}

func teamMemberToProto(m *dto.TeamMemberResponse) *v1.TeamMember {
	if m == nil {
		return nil
	}
	return &v1.TeamMember{
		Id:        m.ID.String(),
		TeamId:    m.TeamID.String(),
		UserId:    m.UserID.String(),
		Role:      teamRoleToProto(m.Role),
		CreatedAt: timestamppb.New(m.CreatedAt),
		User:      userToProto(m.User),
	}
}

func teamRoleToProto(r valueobject.TeamRole) v1.TeamRole {
	switch r {
	case valueobject.TeamRoleLead:
		return v1.TeamRole_TEAM_ROLE_LEAD
	case valueobject.TeamRoleMember:
		return v1.TeamRole_TEAM_ROLE_MEMBER
	default:
		return v1.TeamRole_TEAM_ROLE_UNSPECIFIED
	}
}

func teamRoleFromProto(r v1.TeamRole) valueobject.TeamRole {
	switch r {
	case v1.TeamRole_TEAM_ROLE_LEAD:
		return valueobject.TeamRoleLead
	case v1.TeamRole_TEAM_ROLE_MEMBER:
		return valueobject.TeamRoleMember
	default:
		return valueobject.TeamRoleMember
	}
}
