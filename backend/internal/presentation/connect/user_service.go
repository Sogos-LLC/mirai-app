package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
)

// UserServiceServer implements the UserService Connect handler.
type UserServiceServer struct {
	miraiv1connect.UnimplementedUserServiceHandler
	userService *service.UserService
}

// NewUserServiceServer creates a new UserServiceServer.
func NewUserServiceServer(userService *service.UserService) *UserServiceServer {
	return &UserServiceServer{userService: userService}
}

// GetMe returns the currently authenticated user with their company.
func (s *UserServiceServer) GetMe(
	ctx context.Context,
	req *connect.Request[v1.GetMeRequest],
) (*connect.Response[v1.GetMeResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.userService.GetCurrentUser(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetMeResponse{
		User:    userToProto(result.User),
		Company: companyToProto(result.Company),
	}), nil
}

// GetUser returns a specific user by ID.
func (s *UserServiceServer) GetUser(
	ctx context.Context,
	req *connect.Request[v1.GetUserRequest],
) (*connect.Response[v1.GetUserResponse], error) {
	userID, err := parseUUID(req.Msg.UserId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	user, err := s.userService.GetUserByID(ctx, userID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetUserResponse{
		User: userToProto(user),
	}), nil
}

// UpdateUser updates user information.
func (s *UserServiceServer) UpdateUser(
	ctx context.Context,
	req *connect.Request[v1.UpdateUserRequest],
) (*connect.Response[v1.UpdateUserResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	userID, err := parseUUID(req.Msg.UserId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// For now, users can only update themselves
	// TODO: Add admin permission check for updating other users
	user, err := s.userService.GetCurrentUser(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	if user.User.ID != userID {
		return nil, connect.NewError(connect.CodePermissionDenied, errForbidden)
	}

	// TODO: Implement actual update logic when UserService.UpdateUser is available
	// For now, just return the current user
	return connect.NewResponse(&v1.UpdateUserResponse{
		User: userToProto(user.User),
	}), nil
}
