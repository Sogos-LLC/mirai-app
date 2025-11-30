package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
)

// BillingServiceServer implements the BillingService Connect handler.
type BillingServiceServer struct {
	miraiv1connect.UnimplementedBillingServiceHandler
	billingService *service.BillingService
}

// NewBillingServiceServer creates a new BillingServiceServer.
func NewBillingServiceServer(billingService *service.BillingService) *BillingServiceServer {
	return &BillingServiceServer{billingService: billingService}
}

// GetBillingInfo returns the current billing status for the user's company.
func (s *BillingServiceServer) GetBillingInfo(
	ctx context.Context,
	req *connect.Request[v1.GetBillingInfoRequest],
) (*connect.Response[v1.GetBillingInfoResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	info, err := s.billingService.GetBillingInfo(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	resp := &v1.GetBillingInfoResponse{
		Plan:              planToProto(info.Plan),
		Status:            subscriptionStatusToProto(info.Status),
		SeatCount:         int32(info.SeatCount),
		PricePerSeat:      int32(info.PricePerSeat),
		CancelAtPeriodEnd: info.CancelAtPeriodEnd,
	}
	if info.CurrentPeriodEnd != nil {
		resp.CurrentPeriodEnd = info.CurrentPeriodEnd
	}

	return connect.NewResponse(resp), nil
}

// CreateCheckoutSession creates a Stripe Checkout session for plan upgrade.
func (s *BillingServiceServer) CreateCheckoutSession(
	ctx context.Context,
	req *connect.Request[v1.CreateCheckoutSessionRequest],
) (*connect.Response[v1.CreateCheckoutSessionResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	email, _ := ctx.Value(emailKey{}).(string)
	plan := planFromProto(req.Msg.Plan)

	result, err := s.billingService.CreateCheckoutSession(ctx, kratosID, plan, email)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateCheckoutSessionResponse{
		Url: result.URL,
	}), nil
}

// CreatePortalSession creates a Stripe Customer Portal session.
func (s *BillingServiceServer) CreatePortalSession(
	ctx context.Context,
	req *connect.Request[v1.CreatePortalSessionRequest],
) (*connect.Response[v1.CreatePortalSessionResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.billingService.CreatePortalSession(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreatePortalSessionResponse{
		Url: result.URL,
	}), nil
}
