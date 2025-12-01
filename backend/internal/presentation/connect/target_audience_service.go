package connect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TargetAudienceServiceServer implements the TargetAudienceService Connect handler.
type TargetAudienceServiceServer struct {
	miraiv1connect.UnimplementedTargetAudienceServiceHandler
	audienceService *service.TargetAudienceService
}

// NewTargetAudienceServiceServer creates a new TargetAudienceServiceServer.
func NewTargetAudienceServiceServer(audienceService *service.TargetAudienceService) *TargetAudienceServiceServer {
	return &TargetAudienceServiceServer{audienceService: audienceService}
}

// CreateTemplate creates a new target audience template.
func (s *TargetAudienceServiceServer) CreateTemplate(
	ctx context.Context,
	req *connect.Request[v1.CreateTemplateRequest],
) (*connect.Response[v1.CreateTemplateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	createReq := service.CreateTargetAudienceRequest{
		Name:              req.Msg.Name,
		Description:       req.Msg.Description,
		Role:              req.Msg.Role,
		ExperienceLevel:   protoToExperienceLevel(req.Msg.ExperienceLevel),
		LearningGoals:     req.Msg.LearningGoals,
		Prerequisites:     req.Msg.Prerequisites,
		Challenges:        req.Msg.Challenges,
		Motivations:       req.Msg.Motivations,
		IndustryContext:   req.Msg.IndustryContext,
		TypicalBackground: req.Msg.TypicalBackground,
	}

	audience, err := s.audienceService.CreateTargetAudience(ctx, kratosID, createReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateTemplateResponse{
		Template: targetAudienceToProto(audience),
	}), nil
}

// GetTemplate returns a specific target audience by ID.
func (s *TargetAudienceServiceServer) GetTemplate(
	ctx context.Context,
	req *connect.Request[v1.GetTemplateRequest],
) (*connect.Response[v1.GetTemplateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	audienceID, err := parseUUID(req.Msg.TemplateId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	audience, err := s.audienceService.GetTargetAudience(ctx, kratosID, audienceID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetTemplateResponse{
		Template: targetAudienceToProto(audience),
	}), nil
}

// ListTemplates returns all target audiences for the company.
func (s *TargetAudienceServiceServer) ListTemplates(
	ctx context.Context,
	req *connect.Request[v1.ListTemplatesRequest],
) (*connect.Response[v1.ListTemplatesResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	audiences, err := s.audienceService.ListTargetAudiences(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoAudiences := make([]*v1.TargetAudienceTemplate, len(audiences))
	for i, aud := range audiences {
		protoAudiences[i] = targetAudienceToProto(aud)
	}

	return connect.NewResponse(&v1.ListTemplatesResponse{
		Templates: protoAudiences,
	}), nil
}

// UpdateTemplate updates a target audience template.
func (s *TargetAudienceServiceServer) UpdateTemplate(
	ctx context.Context,
	req *connect.Request[v1.UpdateTemplateRequest],
) (*connect.Response[v1.UpdateTemplateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	audienceID, err := parseUUID(req.Msg.TemplateId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	updateReq := service.UpdateTargetAudienceRequest{
		LearningGoals: req.Msg.LearningGoals,
		Prerequisites: req.Msg.Prerequisites,
		Challenges:    req.Msg.Challenges,
		Motivations:   req.Msg.Motivations,
	}

	if req.Msg.Name != nil {
		updateReq.Name = req.Msg.Name
	}
	if req.Msg.Description != nil {
		updateReq.Description = req.Msg.Description
	}
	if req.Msg.Role != nil {
		updateReq.Role = req.Msg.Role
	}
	if req.Msg.ExperienceLevel != nil {
		level := protoToExperienceLevel(*req.Msg.ExperienceLevel)
		updateReq.ExperienceLevel = &level
	}
	if req.Msg.IndustryContext != nil {
		updateReq.IndustryContext = req.Msg.IndustryContext
	}
	if req.Msg.TypicalBackground != nil {
		updateReq.TypicalBackground = req.Msg.TypicalBackground
	}

	audience, err := s.audienceService.UpdateTargetAudience(ctx, kratosID, audienceID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateTemplateResponse{
		Template: targetAudienceToProto(audience),
	}), nil
}

// DeleteTemplate deletes a target audience template.
func (s *TargetAudienceServiceServer) DeleteTemplate(
	ctx context.Context,
	req *connect.Request[v1.DeleteTemplateRequest],
) (*connect.Response[v1.DeleteTemplateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	audienceID, err := parseUUID(req.Msg.TemplateId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.audienceService.DeleteTargetAudience(ctx, kratosID, audienceID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteTemplateResponse{}), nil
}

// Helper functions for proto conversion

func targetAudienceToProto(aud *entity.TargetAudienceTemplate) *v1.TargetAudienceTemplate {
	if aud == nil {
		return nil
	}

	var industryContext, typicalBackground *string
	if aud.IndustryContext != nil {
		industryContext = aud.IndustryContext
	}
	if aud.TypicalBackground != nil {
		typicalBackground = aud.TypicalBackground
	}

	return &v1.TargetAudienceTemplate{
		Id:                aud.ID.String(),
		TenantId:          aud.TenantID.String(),
		CompanyId:         aud.CompanyID.String(),
		Name:              aud.Name,
		Description:       aud.Description,
		Role:              aud.Role,
		ExperienceLevel:   experienceLevelToProto(aud.ExperienceLevel),
		LearningGoals:     aud.LearningGoals,
		Prerequisites:     aud.Prerequisites,
		Challenges:        aud.Challenges,
		Motivations:       aud.Motivations,
		IndustryContext:   industryContext,
		TypicalBackground: typicalBackground,
		CreatedByUserId:   aud.CreatedByUserID.String(),
		CreatedAt:         timestamppb.New(aud.CreatedAt),
		UpdatedAt:         timestamppb.New(aud.UpdatedAt),
	}
}

func experienceLevelToProto(level valueobject.ExperienceLevel) v1.ExperienceLevel {
	switch level {
	case valueobject.ExperienceLevelBeginner:
		return v1.ExperienceLevel_EXPERIENCE_LEVEL_BEGINNER
	case valueobject.ExperienceLevelIntermediate:
		return v1.ExperienceLevel_EXPERIENCE_LEVEL_INTERMEDIATE
	case valueobject.ExperienceLevelAdvanced:
		return v1.ExperienceLevel_EXPERIENCE_LEVEL_ADVANCED
	case valueobject.ExperienceLevelExpert:
		return v1.ExperienceLevel_EXPERIENCE_LEVEL_EXPERT
	default:
		return v1.ExperienceLevel_EXPERIENCE_LEVEL_UNSPECIFIED
	}
}

func protoToExperienceLevel(level v1.ExperienceLevel) valueobject.ExperienceLevel {
	switch level {
	case v1.ExperienceLevel_EXPERIENCE_LEVEL_BEGINNER:
		return valueobject.ExperienceLevelBeginner
	case v1.ExperienceLevel_EXPERIENCE_LEVEL_INTERMEDIATE:
		return valueobject.ExperienceLevelIntermediate
	case v1.ExperienceLevel_EXPERIENCE_LEVEL_ADVANCED:
		return valueobject.ExperienceLevelAdvanced
	case v1.ExperienceLevel_EXPERIENCE_LEVEL_EXPERT:
		return valueobject.ExperienceLevelExpert
	default:
		return valueobject.ExperienceLevelBeginner
	}
}
