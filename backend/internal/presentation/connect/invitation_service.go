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

// InvitationServiceServer implements the InvitationService Connect handler.
type InvitationServiceServer struct {
	miraiv1connect.UnimplementedInvitationServiceHandler
	invitationService *service.InvitationService
}

// NewInvitationServiceServer creates a new InvitationServiceServer.
func NewInvitationServiceServer(invitationService *service.InvitationService) *InvitationServiceServer {
	return &InvitationServiceServer{invitationService: invitationService}
}

// CreateInvitation creates a new invitation and sends an email.
func (s *InvitationServiceServer) CreateInvitation(
	ctx context.Context,
	req *connect.Request[v1.CreateInvitationRequest],
) (*connect.Response[v1.CreateInvitationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	dtoReq := dto.CreateInvitationRequest{
		Email: req.Msg.Email,
		Role:  roleFromProto(req.Msg.Role),
	}

	invitation, err := s.invitationService.CreateInvitation(ctx, kratosID, dtoReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateInvitationResponse{
		Invitation: invitationToProto(invitation),
	}), nil
}

// ListInvitations returns all invitations for the user's company.
func (s *InvitationServiceServer) ListInvitations(
	ctx context.Context,
	req *connect.Request[v1.ListInvitationsRequest],
) (*connect.Response[v1.ListInvitationsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Convert proto status filters to domain statuses
	var statusFilters []valueobject.InvitationStatus
	for _, protoStatus := range req.Msg.StatusFilter {
		if status := invitationStatusFromProto(protoStatus); status != "" {
			statusFilters = append(statusFilters, status)
		}
	}

	invitations, err := s.invitationService.ListInvitations(ctx, kratosID, statusFilters...)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoInvitations := make([]*v1.Invitation, len(invitations))
	for i, inv := range invitations {
		protoInvitations[i] = invitationToProto(inv)
	}

	return connect.NewResponse(&v1.ListInvitationsResponse{
		Invitations: protoInvitations,
	}), nil
}

// GetInvitation returns a specific invitation by ID.
func (s *InvitationServiceServer) GetInvitation(
	ctx context.Context,
	req *connect.Request[v1.GetInvitationRequest],
) (*connect.Response[v1.GetInvitationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	invitationID, err := parseUUID(req.Msg.InvitationId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	invitation, err := s.invitationService.GetInvitation(ctx, kratosID, invitationID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetInvitationResponse{
		Invitation: invitationToProto(invitation),
	}), nil
}

// GetInvitationByToken returns invitation details for the accept flow (public).
func (s *InvitationServiceServer) GetInvitationByToken(
	ctx context.Context,
	req *connect.Request[v1.GetInvitationByTokenRequest],
) (*connect.Response[v1.GetInvitationByTokenResponse], error) {
	result, err := s.invitationService.GetInvitationByToken(ctx, req.Msg.Token)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetInvitationByTokenResponse{
		Invitation: invitationToProto(result.Invitation),
		Company:    companyToProto(result.Company),
	}), nil
}

// RevokeInvitation revokes a pending invitation.
func (s *InvitationServiceServer) RevokeInvitation(
	ctx context.Context,
	req *connect.Request[v1.RevokeInvitationRequest],
) (*connect.Response[v1.RevokeInvitationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	invitationID, err := parseUUID(req.Msg.InvitationId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	invitation, err := s.invitationService.RevokeInvitation(ctx, kratosID, invitationID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RevokeInvitationResponse{
		Invitation: invitationToProto(invitation),
	}), nil
}

// AcceptInvitation accepts an invitation after user registration.
func (s *InvitationServiceServer) AcceptInvitation(
	ctx context.Context,
	req *connect.Request[v1.AcceptInvitationRequest],
) (*connect.Response[v1.AcceptInvitationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Get user's email from context
	userEmail, _ := ctx.Value(emailKey{}).(string)
	if userEmail == "" {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	result, err := s.invitationService.AcceptInvitation(ctx, kratosID, req.Msg.Token, userEmail)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.AcceptInvitationResponse{
		Invitation: invitationToProto(result.Invitation),
		User:       userToProto(result.User),
		Company:    companyToProto(result.Company),
	}), nil
}

// ResendInvitation resends the invitation email.
func (s *InvitationServiceServer) ResendInvitation(
	ctx context.Context,
	req *connect.Request[v1.ResendInvitationRequest],
) (*connect.Response[v1.ResendInvitationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	invitationID, err := parseUUID(req.Msg.InvitationId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	invitation, err := s.invitationService.ResendInvitation(ctx, kratosID, invitationID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ResendInvitationResponse{
		Invitation: invitationToProto(invitation),
	}), nil
}

// GetSeatInfo returns seat usage information for the user's company.
func (s *InvitationServiceServer) GetSeatInfo(
	ctx context.Context,
	req *connect.Request[v1.GetSeatInfoRequest],
) (*connect.Response[v1.GetSeatInfoResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	seatInfo, err := s.invitationService.GetSeatInfo(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetSeatInfoResponse{
		SeatInfo: &v1.SeatInfo{
			TotalSeats:         int32(seatInfo.TotalSeats),
			UsedSeats:          int32(seatInfo.UsedSeats),
			PendingInvitations: int32(seatInfo.PendingInvitations),
			AvailableSeats:     int32(seatInfo.AvailableSeats),
		},
	}), nil
}

// Helper functions for proto conversion

func invitationToProto(inv *dto.InvitationResponse) *v1.Invitation {
	if inv == nil {
		return nil
	}
	return &v1.Invitation{
		Id:               inv.ID.String(),
		CompanyId:        inv.CompanyID.String(),
		Email:            inv.Email,
		Role:             roleToProto(inv.Role),
		Status:           invitationStatusToProto(inv.Status),
		InvitedByUserId:  inv.InvitedByUserID.String(),
		AcceptedByUserId: uuidPtrToString(inv.AcceptedByUserID),
		ExpiresAt:        timestamppb.New(inv.ExpiresAt),
		CreatedAt:        timestamppb.New(inv.CreatedAt),
		UpdatedAt:        timestamppb.New(inv.UpdatedAt),
	}
}

func invitationStatusToProto(s valueobject.InvitationStatus) v1.InvitationStatus {
	switch s {
	case valueobject.InvitationStatusPending:
		return v1.InvitationStatus_INVITATION_STATUS_PENDING
	case valueobject.InvitationStatusAccepted:
		return v1.InvitationStatus_INVITATION_STATUS_ACCEPTED
	case valueobject.InvitationStatusExpired:
		return v1.InvitationStatus_INVITATION_STATUS_EXPIRED
	case valueobject.InvitationStatusRevoked:
		return v1.InvitationStatus_INVITATION_STATUS_REVOKED
	default:
		return v1.InvitationStatus_INVITATION_STATUS_UNSPECIFIED
	}
}

func invitationStatusFromProto(s v1.InvitationStatus) valueobject.InvitationStatus {
	switch s {
	case v1.InvitationStatus_INVITATION_STATUS_PENDING:
		return valueobject.InvitationStatusPending
	case v1.InvitationStatus_INVITATION_STATUS_ACCEPTED:
		return valueobject.InvitationStatusAccepted
	case v1.InvitationStatus_INVITATION_STATUS_EXPIRED:
		return valueobject.InvitationStatusExpired
	case v1.InvitationStatus_INVITATION_STATUS_REVOKED:
		return valueobject.InvitationStatusRevoked
	default:
		return ""
	}
}

func roleFromProto(r v1.Role) valueobject.Role {
	switch r {
	case v1.Role_ROLE_OWNER:
		return valueobject.RoleOwner
	case v1.Role_ROLE_ADMIN:
		return valueobject.RoleAdmin
	case v1.Role_ROLE_MEMBER:
		return valueobject.RoleMember
	default:
		return valueobject.RoleMember
	}
}
