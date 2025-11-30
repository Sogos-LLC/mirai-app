package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
)

// HealthServiceServer implements the HealthService Connect handler.
type HealthServiceServer struct {
	miraiv1connect.UnimplementedHealthServiceHandler
}

// NewHealthServiceServer creates a new HealthServiceServer.
func NewHealthServiceServer() *HealthServiceServer {
	return &HealthServiceServer{}
}

// Check returns the health status of the service.
func (s *HealthServiceServer) Check(
	ctx context.Context,
	req *connect.Request[v1.CheckRequest],
) (*connect.Response[v1.CheckResponse], error) {
	return connect.NewResponse(&v1.CheckResponse{
		Status: "ok",
	}), nil
}
