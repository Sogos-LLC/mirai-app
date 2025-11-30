package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/dto"
	"github.com/sogos/mirai-backend/internal/application/service"
)

// CompanyServiceServer implements the CompanyService Connect handler.
type CompanyServiceServer struct {
	miraiv1connect.UnimplementedCompanyServiceHandler
	companyService *service.CompanyService
}

// NewCompanyServiceServer creates a new CompanyServiceServer.
func NewCompanyServiceServer(companyService *service.CompanyService) *CompanyServiceServer {
	return &CompanyServiceServer{companyService: companyService}
}

// GetCompany returns a specific company by ID.
func (s *CompanyServiceServer) GetCompany(
	ctx context.Context,
	req *connect.Request[v1.GetCompanyRequest],
) (*connect.Response[v1.GetCompanyResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	company, err := s.companyService.GetCompany(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetCompanyResponse{
		Company: companyToProto(company),
	}), nil
}

// UpdateCompany updates company information.
func (s *CompanyServiceServer) UpdateCompany(
	ctx context.Context,
	req *connect.Request[v1.UpdateCompanyRequest],
) (*connect.Response[v1.UpdateCompanyResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	updateReq := dto.UpdateCompanyRequest{
		Name:     derefString(req.Msg.Name),
		Industry: derefString(req.Msg.Industry),
		TeamSize: derefString(req.Msg.TeamSize),
	}

	company, err := s.companyService.UpdateCompany(ctx, kratosID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateCompanyResponse{
		Company: companyToProto(company),
	}), nil
}
