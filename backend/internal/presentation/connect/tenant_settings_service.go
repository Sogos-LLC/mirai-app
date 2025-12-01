package connect

import (
	"context"
	"errors"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

var errMissingAPIKey = errors.New("API key is required")

// TenantSettingsServiceServer implements the TenantSettingsService Connect handler.
type TenantSettingsServiceServer struct {
	miraiv1connect.UnimplementedTenantSettingsServiceHandler
	settingsService *service.TenantSettingsService
}

// NewTenantSettingsServiceServer creates a new TenantSettingsServiceServer.
func NewTenantSettingsServiceServer(settingsService *service.TenantSettingsService) *TenantSettingsServiceServer {
	return &TenantSettingsServiceServer{settingsService: settingsService}
}

// GetAISettings returns the current AI configuration.
func (s *TenantSettingsServiceServer) GetAISettings(
	ctx context.Context,
	req *connect.Request[v1.GetAISettingsRequest],
) (*connect.Response[v1.GetAISettingsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.settingsService.GetAISettings(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	settings := result.Settings
	return connect.NewResponse(&v1.GetAISettingsResponse{
		Settings: &v1.TenantAISettings{
			TenantId:          settings.TenantID.String(),
			Provider:          aiProviderToProto(settings.Provider),
			ApiKeyConfigured:  settings.EncryptedAPIKey != nil && len(settings.EncryptedAPIKey) > 0,
			TotalTokensUsed:   settings.TotalTokensUsed,
			MonthlyTokenLimit: settings.MonthlyTokenLimit,
			UpdatedAt:         timestamppb.New(settings.UpdatedAt),
			UpdatedByUserId:   uuidPtrToString(settings.UpdatedByUserID),
		},
	}), nil
}

// SetAPIKey sets the Gemini API key for the tenant.
func (s *TenantSettingsServiceServer) SetAPIKey(
	ctx context.Context,
	req *connect.Request[v1.SetAPIKeyRequest],
) (*connect.Response[v1.SetAPIKeyResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if req.Msg.ApiKey == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errMissingAPIKey)
	}

	provider := protoToAIProvider(req.Msg.Provider)
	if err := s.settingsService.SetAPIKey(ctx, kratosID, provider, req.Msg.ApiKey); err != nil {
		return nil, toConnectError(err)
	}

	// Fetch updated settings to return
	result, err := s.settingsService.GetAISettings(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	settings := result.Settings
	return connect.NewResponse(&v1.SetAPIKeyResponse{
		Settings: &v1.TenantAISettings{
			TenantId:          settings.TenantID.String(),
			Provider:          aiProviderToProto(settings.Provider),
			ApiKeyConfigured:  settings.EncryptedAPIKey != nil && len(settings.EncryptedAPIKey) > 0,
			TotalTokensUsed:   settings.TotalTokensUsed,
			MonthlyTokenLimit: settings.MonthlyTokenLimit,
			UpdatedAt:         timestamppb.New(settings.UpdatedAt),
			UpdatedByUserId:   uuidPtrToString(settings.UpdatedByUserID),
		},
	}), nil
}

// RemoveAPIKey removes the configured API key.
func (s *TenantSettingsServiceServer) RemoveAPIKey(
	ctx context.Context,
	req *connect.Request[v1.RemoveAPIKeyRequest],
) (*connect.Response[v1.RemoveAPIKeyResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := s.settingsService.RemoveAPIKey(ctx, kratosID); err != nil {
		return nil, toConnectError(err)
	}

	// Fetch updated settings to return
	result, err := s.settingsService.GetAISettings(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	settings := result.Settings
	return connect.NewResponse(&v1.RemoveAPIKeyResponse{
		Settings: &v1.TenantAISettings{
			TenantId:          settings.TenantID.String(),
			Provider:          aiProviderToProto(settings.Provider),
			ApiKeyConfigured:  settings.EncryptedAPIKey != nil && len(settings.EncryptedAPIKey) > 0,
			TotalTokensUsed:   settings.TotalTokensUsed,
			MonthlyTokenLimit: settings.MonthlyTokenLimit,
			UpdatedAt:         timestamppb.New(settings.UpdatedAt),
			UpdatedByUserId:   uuidPtrToString(settings.UpdatedByUserID),
		},
	}), nil
}

// TestAPIKey tests if the provided API key is valid.
func (s *TenantSettingsServiceServer) TestAPIKey(
	ctx context.Context,
	req *connect.Request[v1.TestAPIKeyRequest],
) (*connect.Response[v1.TestAPIKeyResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	var apiKey *string
	if req.Msg.ApiKey != "" {
		apiKey = &req.Msg.ApiKey
	}

	result, err := s.settingsService.TestAPIKey(ctx, kratosID, apiKey)
	if err != nil {
		return nil, toConnectError(err)
	}

	resp := &v1.TestAPIKeyResponse{
		Valid: result.Valid,
	}
	if !result.Valid && result.Message != "" {
		resp.ErrorMessage = &result.Message
	}
	return connect.NewResponse(resp), nil
}

// GetUsageStats returns AI usage statistics.
func (s *TenantSettingsServiceServer) GetUsageStats(
	ctx context.Context,
	req *connect.Request[v1.GetUsageStatsRequest],
) (*connect.Response[v1.GetUsageStatsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.settingsService.GetUsageStats(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetUsageStatsResponse{
		TotalTokensUsed: result.TotalTokensUsed,
		TokensThisMonth: 0, // TODO: Implement monthly token tracking
		MonthlyLimit:    result.MonthlyTokenLimit,
	}), nil
}

// Helper functions for proto conversion

func aiProviderToProto(p valueobject.AIProvider) v1.AIProvider {
	switch p {
	case valueobject.AIProviderGemini:
		return v1.AIProvider_AI_PROVIDER_GEMINI
	default:
		return v1.AIProvider_AI_PROVIDER_UNSPECIFIED
	}
}

func protoToAIProvider(p v1.AIProvider) valueobject.AIProvider {
	switch p {
	case v1.AIProvider_AI_PROVIDER_GEMINI:
		return valueobject.AIProviderGemini
	default:
		return valueobject.AIProviderGemini // Default to Gemini
	}
}
