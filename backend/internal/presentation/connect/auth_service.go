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

// AuthServiceServer implements the AuthService Connect handler.
type AuthServiceServer struct {
	miraiv1connect.UnimplementedAuthServiceHandler
	authService *service.AuthService
}

// NewAuthServiceServer creates a new AuthServiceServer.
func NewAuthServiceServer(authService *service.AuthService) *AuthServiceServer {
	return &AuthServiceServer{authService: authService}
}

// CheckEmail checks if an email address is already registered.
func (s *AuthServiceServer) CheckEmail(
	ctx context.Context,
	req *connect.Request[v1.CheckEmailRequest],
) (*connect.Response[v1.CheckEmailResponse], error) {
	if req.Msg.Email == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errEmailRequired)
	}

	exists, err := s.authService.CheckEmailExists(ctx, req.Msg.Email)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CheckEmailResponse{
		Exists: exists,
	}), nil
}

// Register creates a new user account with company.
func (s *AuthServiceServer) Register(
	ctx context.Context,
	req *connect.Request[v1.RegisterRequest],
) (*connect.Response[v1.RegisterResponse], error) {
	// Convert proto request to DTO
	dtoReq := dto.RegisterRequest{
		Email:       req.Msg.Email,
		Password:    req.Msg.Password,
		FirstName:   req.Msg.FirstName,
		LastName:    req.Msg.LastName,
		CompanyName: req.Msg.CompanyName,
		Industry:    derefString(req.Msg.Industry),
		TeamSize:    derefString(req.Msg.TeamSize),
		Plan:        planFromProto(req.Msg.Plan),
		SeatCount:   int(req.Msg.GetSeatCount()),
	}

	result, err := s.authService.Register(ctx, dtoReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RegisterResponse{
		User:        userToProto(result.User),
		Company:     companyToProto(result.Company),
		CheckoutUrl: strPtr(result.CheckoutURL),
		Email:       strPtr(result.Email),
	}), nil
}

// Onboard completes onboarding for an authenticated user without a company.
func (s *AuthServiceServer) Onboard(
	ctx context.Context,
	req *connect.Request[v1.OnboardRequest],
) (*connect.Response[v1.OnboardResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	email, _ := ctx.Value(emailKey{}).(string)

	dtoReq := dto.OnboardRequest{
		CompanyName: req.Msg.CompanyName,
		Industry:    derefString(req.Msg.Industry),
		TeamSize:    derefString(req.Msg.TeamSize),
		Plan:        planFromProto(req.Msg.Plan),
		SeatCount:   int(req.Msg.GetSeatCount()),
	}

	result, err := s.authService.Onboard(ctx, kratosID, dtoReq, email)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.OnboardResponse{
		User:        userToProto(result.User),
		Company:     companyToProto(result.Company),
		CheckoutUrl: strPtr(result.CheckoutURL),
	}), nil
}

// EnterpriseContact handles enterprise contact form submissions.
func (s *AuthServiceServer) EnterpriseContact(
	ctx context.Context,
	req *connect.Request[v1.EnterpriseContactRequest],
) (*connect.Response[v1.EnterpriseContactResponse], error) {
	dtoReq := dto.EnterpriseContactRequest{
		CompanyName: req.Msg.CompanyName,
		Industry:    derefString(req.Msg.Industry),
		TeamSize:    derefString(req.Msg.TeamSize),
		Name:        req.Msg.Name,
		Email:       req.Msg.Email,
		Phone:       derefString(req.Msg.Phone),
		Message:     derefString(req.Msg.Message),
	}

	err := s.authService.SubmitEnterpriseContact(ctx, dtoReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.EnterpriseContactResponse{
		Success: true,
	}), nil
}

// RegisterWithInvitation creates a new user account for an invited user.
// This is a public endpoint - no authentication required.
func (s *AuthServiceServer) RegisterWithInvitation(
	ctx context.Context,
	req *connect.Request[v1.RegisterWithInvitationRequest],
) (*connect.Response[v1.RegisterWithInvitationResponse], error) {
	// Validate request
	if req.Msg.Token == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errMissingToken)
	}
	if req.Msg.Password == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errPasswordRequired)
	}
	if req.Msg.FirstName == "" || req.Msg.LastName == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errNameRequired)
	}

	dtoReq := dto.RegisterWithInvitationRequest{
		Token:     req.Msg.Token,
		Password:  req.Msg.Password,
		FirstName: req.Msg.FirstName,
		LastName:  req.Msg.LastName,
	}

	result, err := s.authService.RegisterWithInvitation(ctx, dtoReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RegisterWithInvitationResponse{
		User:         userToProto(result.User),
		Company:      companyToProto(result.Company),
		SessionToken: result.SessionToken,
	}), nil
}

// Helper functions for proto conversion

func userToProto(u *dto.UserResponse) *v1.User {
	if u == nil {
		return nil
	}
	return &v1.User{
		Id:        u.ID.String(),
		KratosId:  u.KratosID.String(),
		CompanyId: uuidPtrToString(u.CompanyID),
		Role:      roleToProto(u.Role),
		CreatedAt: timestamppb.New(u.CreatedAt),
		UpdatedAt: timestamppb.New(u.UpdatedAt),
		Email:     strPtr(u.Email),
		FirstName: strPtr(u.FirstName),
		LastName:  strPtr(u.LastName),
	}
}

func companyToProto(c *dto.CompanyResponse) *v1.Company {
	if c == nil {
		return nil
	}
	return &v1.Company{
		Id:                   c.ID.String(),
		Name:                 c.Name,
		Industry:             c.Industry,
		TeamSize:             c.TeamSize,
		Plan:                 planToProto(c.Plan),
		SubscriptionStatus:   subscriptionStatusToProto(c.SubscriptionStatus),
		StripeCustomerId:     c.StripeCustomerID,
		StripeSubscriptionId: c.StripeSubscriptionID,
		CreatedAt:            timestamppb.New(c.CreatedAt),
		UpdatedAt:            timestamppb.New(c.UpdatedAt),
		SeatCount:            int32(c.SeatCount),
	}
}

func planToProto(p valueobject.Plan) v1.Plan {
	switch p {
	case valueobject.PlanStarter:
		return v1.Plan_PLAN_STARTER
	case valueobject.PlanPro:
		return v1.Plan_PLAN_PRO
	case valueobject.PlanEnterprise:
		return v1.Plan_PLAN_ENTERPRISE
	default:
		return v1.Plan_PLAN_UNSPECIFIED
	}
}

func planFromProto(p v1.Plan) valueobject.Plan {
	switch p {
	case v1.Plan_PLAN_STARTER:
		return valueobject.PlanStarter
	case v1.Plan_PLAN_PRO:
		return valueobject.PlanPro
	case v1.Plan_PLAN_ENTERPRISE:
		return valueobject.PlanEnterprise
	default:
		return valueobject.PlanStarter
	}
}

func roleToProto(r valueobject.Role) v1.Role {
	switch r {
	case valueobject.RoleOwner:
		return v1.Role_ROLE_OWNER
	case valueobject.RoleAdmin:
		return v1.Role_ROLE_ADMIN
	case valueobject.RoleMember:
		return v1.Role_ROLE_MEMBER
	default:
		return v1.Role_ROLE_UNSPECIFIED
	}
}

func subscriptionStatusToProto(s valueobject.SubscriptionStatus) v1.SubscriptionStatus {
	switch s {
	case valueobject.SubscriptionStatusNone:
		return v1.SubscriptionStatus_SUBSCRIPTION_STATUS_NONE
	case valueobject.SubscriptionStatusActive:
		return v1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE
	case valueobject.SubscriptionStatusPastDue:
		return v1.SubscriptionStatus_SUBSCRIPTION_STATUS_PAST_DUE
	case valueobject.SubscriptionStatusCanceled:
		return v1.SubscriptionStatus_SUBSCRIPTION_STATUS_CANCELED
	default:
		return v1.SubscriptionStatus_SUBSCRIPTION_STATUS_UNSPECIFIED
	}
}
