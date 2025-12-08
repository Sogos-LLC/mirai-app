package connect

import (
	"context"

	"connectrpc.com/connect"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// CourseWizardServiceServer implements the CourseWizardService Connect handler.
type CourseWizardServiceServer struct {
	miraiv1connect.UnimplementedCourseWizardServiceHandler
	wizardService *service.CourseWizardService
}

// NewCourseWizardServiceServer creates a new CourseWizardServiceServer.
func NewCourseWizardServiceServer(wizardService *service.CourseWizardService) *CourseWizardServiceServer {
	return &CourseWizardServiceServer{wizardService: wizardService}
}

// GenerateTitle improves the course name and generates a description.
func (s *CourseWizardServiceServer) GenerateTitle(
	ctx context.Context,
	req *connect.Request[v1.GenerateTitleRequest],
) (*connect.Response[v1.GenerateTitleResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.wizardService.GenerateTitle(ctx, kratosID, req.Msg.CourseName)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateTitleResponse{
		ImprovedTitle: result.ImprovedTitle,
		Description:   result.Description,
	}), nil
}

// GenerateSMEPersonas generates 3 diverse SME personas based on course topic.
func (s *CourseWizardServiceServer) GenerateSMEPersonas(
	ctx context.Context,
	req *connect.Request[v1.GenerateSMEPersonasRequest],
) (*connect.Response[v1.GenerateSMEPersonasResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	result, err := s.wizardService.GenerateSMEPersonas(ctx, kratosID, req.Msg.Title, req.Msg.Description)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Convert to proto types
	personas := make([]*v1.SMEPersona, len(result.Personas))
	for i, p := range result.Personas {
		personas[i] = smePersonaToProto(&p)
	}

	return connect.NewResponse(&v1.GenerateSMEPersonasResponse{
		Personas: personas,
	}), nil
}

// GenerateAudiencePersonas generates 3 diverse audience personas.
func (s *CourseWizardServiceServer) GenerateAudiencePersonas(
	ctx context.Context,
	req *connect.Request[v1.GenerateAudiencePersonasRequest],
) (*connect.Response[v1.GenerateAudiencePersonasResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Convert proto SME personas to entity types
	smePersonas := make([]entity.WizardSMEPersona, len(req.Msg.SelectedSmes))
	for i, p := range req.Msg.SelectedSmes {
		smePersonas[i] = protoToSMEPersona(p)
	}

	result, err := s.wizardService.GenerateAudiencePersonas(ctx, kratosID, service.GenerateAudiencePersonasRequest{
		Title:       req.Msg.Title,
		Description: req.Msg.Description,
		SMEPersonas: smePersonas,
	})
	if err != nil {
		return nil, toConnectError(err)
	}

	// Convert to proto types
	personas := make([]*v1.AudiencePersona, len(result.Personas))
	for i, p := range result.Personas {
		personas[i] = audiencePersonaToProto(&p)
	}

	return connect.NewResponse(&v1.GenerateAudiencePersonasResponse{
		Personas: personas,
	}), nil
}

// GenerateToneOptions generates 3 tone/style options for the course.
func (s *CourseWizardServiceServer) GenerateToneOptions(
	ctx context.Context,
	req *connect.Request[v1.GenerateToneOptionsRequest],
) (*connect.Response[v1.GenerateToneOptionsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Convert proto audience personas to entity types
	audiencePersonas := make([]entity.WizardAudiencePersona, len(req.Msg.SelectedAudiences))
	for i, p := range req.Msg.SelectedAudiences {
		audiencePersonas[i] = protoToAudiencePersona(p)
	}

	result, err := s.wizardService.GenerateToneOptions(ctx, kratosID, service.GenerateToneOptionsRequest{
		Title:            req.Msg.Title,
		Description:      req.Msg.Description,
		AudiencePersonas: audiencePersonas,
	})
	if err != nil {
		return nil, toConnectError(err)
	}

	// Convert to proto types
	options := make([]*v1.ToneOption, len(result.Options))
	for i, o := range result.Options {
		options[i] = toneOptionToProto(&o)
	}

	return connect.NewResponse(&v1.GenerateToneOptionsResponse{
		Options: options,
	}), nil
}

// SaveWizardState persists wizard progress for later resume.
func (s *CourseWizardServiceServer) SaveWizardState(
	ctx context.Context,
	req *connect.Request[v1.SaveWizardStateRequest],
) (*connect.Response[v1.SaveWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Convert proto wizard step data to entity
	var stepData *entity.WizardStepData
	if req.Msg.Data != nil {
		stepData = protoToWizardStepData(req.Msg.Data)
	}

	state, err := s.wizardService.SaveWizardState(ctx, kratosID, service.SaveWizardStateRequest{
		CurrentStep: req.Msg.CurrentStep,
		Data:        stepData,
	})
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.SaveWizardStateResponse{
		State: wizardStateToProto(state),
	}), nil
}

// GetWizardState retrieves saved wizard progress.
func (s *CourseWizardServiceServer) GetWizardState(
	ctx context.Context,
	req *connect.Request[v1.GetWizardStateRequest],
) (*connect.Response[v1.GetWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	state, err := s.wizardService.GetWizardState(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	var protoState *v1.WizardState
	if state != nil {
		protoState = wizardStateToProto(state)
	}

	return connect.NewResponse(&v1.GetWizardStateResponse{
		State: protoState,
	}), nil
}

// DeleteWizardState clears wizard state after completion or cancellation.
func (s *CourseWizardServiceServer) DeleteWizardState(
	ctx context.Context,
	req *connect.Request[v1.DeleteWizardStateRequest],
) (*connect.Response[v1.DeleteWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	if err := s.wizardService.DeleteWizardState(ctx, kratosID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteWizardStateResponse{}), nil
}

// CreateCourseFromOutline creates a course record after outline approval.
// TODO: Implement this method when course creation from outline is needed.
func (s *CourseWizardServiceServer) CreateCourseFromOutline(
	ctx context.Context,
	req *connect.Request[v1.CreateCourseFromOutlineRequest],
) (*connect.Response[v1.CreateCourseFromOutlineResponse], error) {
	// This will be implemented when we integrate with the outline approval flow
	return nil, connect.NewError(connect.CodeUnimplemented, nil)
}

// =============================================================================
// Proto <-> Entity Conversion Helpers
// =============================================================================

func smePersonaToProto(p *entity.WizardSMEPersona) *v1.SMEPersona {
	return &v1.SMEPersona{
		Id:          p.ID,
		JobTitle:    p.JobTitle,
		Description: p.Description,
		Skills:      p.Skills,
		Voice:       p.Voice,
	}
}

func protoToSMEPersona(p *v1.SMEPersona) entity.WizardSMEPersona {
	return entity.WizardSMEPersona{
		ID:          p.GetId(),
		JobTitle:    p.GetJobTitle(),
		Description: p.GetDescription(),
		Skills:      p.GetSkills(),
		Voice:       p.GetVoice(),
	}
}

func audiencePersonaToProto(p *entity.WizardAudiencePersona) *v1.AudiencePersona {
	return &v1.AudiencePersona{
		Id:          p.ID,
		Name:        p.Name,
		Role:        p.Role,
		Description: p.Description,
		Goals:       p.Goals,
	}
}

func protoToAudiencePersona(p *v1.AudiencePersona) entity.WizardAudiencePersona {
	return entity.WizardAudiencePersona{
		ID:          p.GetId(),
		Name:        p.GetName(),
		Role:        p.GetRole(),
		Description: p.GetDescription(),
		Goals:       p.GetGoals(),
	}
}

func toneOptionToProto(o *entity.WizardToneOption) *v1.ToneOption {
	return &v1.ToneOption{
		Id:            o.ID,
		Name:          o.Name,
		Description:   o.Description,
		LevelOfDetail: toneDetailLevelToProto(o.LevelOfDetail),
	}
}

func protoToToneOption(o *v1.ToneOption) entity.WizardToneOption {
	return entity.WizardToneOption{
		ID:            o.GetId(),
		Name:          o.GetName(),
		Description:   o.GetDescription(),
		LevelOfDetail: protoToToneDetailLevel(o.GetLevelOfDetail()),
	}
}

func toneDetailLevelToProto(level entity.ToneDetailLevel) v1.ToneDetailLevel {
	switch level {
	case entity.ToneDetailLevelBrief:
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_BRIEF
	case entity.ToneDetailLevelModerate:
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_MODERATE
	case entity.ToneDetailLevelComprehensive:
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_COMPREHENSIVE
	default:
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_UNSPECIFIED
	}
}

func protoToToneDetailLevel(level v1.ToneDetailLevel) entity.ToneDetailLevel {
	switch level {
	case v1.ToneDetailLevel_TONE_DETAIL_LEVEL_BRIEF:
		return entity.ToneDetailLevelBrief
	case v1.ToneDetailLevel_TONE_DETAIL_LEVEL_MODERATE:
		return entity.ToneDetailLevelModerate
	case v1.ToneDetailLevel_TONE_DETAIL_LEVEL_COMPREHENSIVE:
		return entity.ToneDetailLevelComprehensive
	default:
		return entity.ToneDetailLevelModerate
	}
}

func wizardStateToProto(state *entity.WizardState) *v1.WizardState {
	if state == nil {
		return nil
	}

	var protoData *v1.WizardStepData
	if state.Data != nil {
		protoData = wizardStepDataToProto(state.Data)
	}

	return &v1.WizardState{
		Id:          state.ID.String(),
		UserId:      state.UserID.String(),
		CurrentStep: state.CurrentStep,
		Data:        protoData,
		CreatedAt:   timestamppb.New(state.CreatedAt),
		UpdatedAt:   timestamppb.New(state.UpdatedAt),
	}
}

func wizardStepDataToProto(data *entity.WizardStepData) *v1.WizardStepData {
	if data == nil {
		return nil
	}

	// Convert SME personas
	smePersonas := make([]*v1.SMEPersona, len(data.SMEPersonas))
	for i, p := range data.SMEPersonas {
		smePersonas[i] = smePersonaToProto(&p)
	}

	// Convert audience personas
	audiencePersonas := make([]*v1.AudiencePersona, len(data.AudiencePersonas))
	for i, p := range data.AudiencePersonas {
		audiencePersonas[i] = audiencePersonaToProto(&p)
	}

	// Convert tone options
	toneOptions := make([]*v1.ToneOption, len(data.ToneOptions))
	for i, o := range data.ToneOptions {
		toneOptions[i] = toneOptionToProto(&o)
	}

	return &v1.WizardStepData{
		CourseName:          data.CourseName,
		ImprovedTitle:       data.ImprovedTitle,
		Description:         data.Description,
		SmePersonas:         smePersonas,
		SelectedSmeIds:      data.SelectedSMEIDs,
		AudiencePersonas:    audiencePersonas,
		SelectedAudienceIds: data.SelectedAudienceIDs,
		ToneOptions:         toneOptions,
		SelectedToneId:      data.SelectedToneID,
		AdditionalContext:   data.AdditionalContext,
	}
}

func protoToWizardStepData(data *v1.WizardStepData) *entity.WizardStepData {
	if data == nil {
		return nil
	}

	// Convert SME personas
	smePersonas := make([]entity.WizardSMEPersona, len(data.SmePersonas))
	for i, p := range data.SmePersonas {
		smePersonas[i] = protoToSMEPersona(p)
	}

	// Convert audience personas
	audiencePersonas := make([]entity.WizardAudiencePersona, len(data.AudiencePersonas))
	for i, p := range data.AudiencePersonas {
		audiencePersonas[i] = protoToAudiencePersona(p)
	}

	// Convert tone options
	toneOptions := make([]entity.WizardToneOption, len(data.ToneOptions))
	for i, o := range data.ToneOptions {
		toneOptions[i] = protoToToneOption(o)
	}

	return &entity.WizardStepData{
		CourseName:          data.CourseName,
		ImprovedTitle:       data.ImprovedTitle,
		Description:         data.Description,
		SMEPersonas:         smePersonas,
		SelectedSMEIDs:      data.SelectedSmeIds,
		AudiencePersonas:    audiencePersonas,
		SelectedAudienceIDs: data.SelectedAudienceIds,
		ToneOptions:         toneOptions,
		SelectedToneID:      data.SelectedToneId,
		AdditionalContext:   data.AdditionalContext,
	}
}
