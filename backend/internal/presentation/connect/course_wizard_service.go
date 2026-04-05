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
	wizardService *service.WizardService
}

// NewCourseWizardServiceServer creates a new handler.
func NewCourseWizardServiceServer(wizardService *service.WizardService) *CourseWizardServiceServer {
	return &CourseWizardServiceServer{wizardService: wizardService}
}

func (s *CourseWizardServiceServer) GenerateTitle(
	ctx context.Context,
	req *connect.Request[v1.GenerateTitleRequest],
) (*connect.Response[v1.GenerateTitleResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	result, err := s.wizardService.GenerateTitle(
		ctx, kratosID,
		req.Msg.GetCourseName(),
		req.Msg.GetSelectedTeamDocIds(),
		req.Msg.GetSelectedGlobalDocIds(),
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateTitleResponse{
		ImprovedTitle: result.ImprovedTitle,
		Description:   result.Description,
	}), nil
}

func (s *CourseWizardServiceServer) GenerateOutcomes(
	ctx context.Context,
	req *connect.Request[v1.GenerateOutcomesRequest],
) (*connect.Response[v1.GenerateOutcomesResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	result, err := s.wizardService.GenerateOutcomes(
		ctx, kratosID,
		req.Msg.GetCourseName(),
		req.Msg.GetSelectedTeamDocIds(),
		req.Msg.GetSelectedGlobalDocIds(),
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateOutcomesResponse{
		Outcomes: result.Outcomes,
	}), nil
}

func (s *CourseWizardServiceServer) GenerateSMEPersonas(
	ctx context.Context,
	req *connect.Request[v1.GenerateSMEPersonasRequest],
) (*connect.Response[v1.GenerateSMEPersonasResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	result, err := s.wizardService.GenerateSMEPersonas(
		ctx, kratosID,
		req.Msg.GetTitle(),
		req.Msg.GetDescription(),
		req.Msg.GetSelectedTeamDocIds(),
		req.Msg.GetSelectedGlobalDocIds(),
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateSMEPersonasResponse{
		Personas: smePersonasToProto(result.Personas),
	}), nil
}

func (s *CourseWizardServiceServer) GenerateAudiencePersonas(
	ctx context.Context,
	req *connect.Request[v1.GenerateAudiencePersonasRequest],
) (*connect.Response[v1.GenerateAudiencePersonasResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	// Convert proto SMEs to domain entities
	selectedSMEs := smePersonasFromProto(req.Msg.GetSelectedSmes())

	result, err := s.wizardService.GenerateAudiencePersonas(
		ctx, kratosID,
		req.Msg.GetTitle(),
		req.Msg.GetDescription(),
		selectedSMEs,
		req.Msg.GetSelectedTeamDocIds(),
		req.Msg.GetSelectedGlobalDocIds(),
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateAudiencePersonasResponse{
		Personas: audiencePersonasToProto(result.Personas),
	}), nil
}

func (s *CourseWizardServiceServer) GenerateToneOptions(
	ctx context.Context,
	req *connect.Request[v1.GenerateToneOptionsRequest],
) (*connect.Response[v1.GenerateToneOptionsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	// Convert proto audiences to domain entities
	selectedAudiences := audiencePersonasFromProto(req.Msg.GetSelectedAudiences())

	result, err := s.wizardService.GenerateToneOptions(
		ctx, kratosID,
		req.Msg.GetTitle(),
		req.Msg.GetDescription(),
		selectedAudiences,
		req.Msg.GetSelectedTeamDocIds(),
		req.Msg.GetSelectedGlobalDocIds(),
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateToneOptionsResponse{
		Options: toneOptionsToProto(result.Options),
	}), nil
}

func (s *CourseWizardServiceServer) SaveWizardState(
	ctx context.Context,
	req *connect.Request[v1.SaveWizardStateRequest],
) (*connect.Response[v1.SaveWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	data := wizardStepDataFromProto(req.Msg.GetData())

	result, err := s.wizardService.SaveState(ctx, kratosID, req.Msg.GetCurrentStep(), data)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.SaveWizardStateResponse{
		State: wizardStateToProto(result),
	}), nil
}

func (s *CourseWizardServiceServer) GetWizardState(
	ctx context.Context,
	req *connect.Request[v1.GetWizardStateRequest],
) (*connect.Response[v1.GetWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	result, err := s.wizardService.GetState(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	resp := &v1.GetWizardStateResponse{}
	if result != nil {
		resp.State = wizardStateToProto(result)
	}
	return connect.NewResponse(resp), nil
}

func (s *CourseWizardServiceServer) DeleteWizardState(
	ctx context.Context,
	req *connect.Request[v1.DeleteWizardStateRequest],
) (*connect.Response[v1.DeleteWizardStateResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	kratosID := mustParseUUID(kratosIDStr)

	if err := s.wizardService.DeleteState(ctx, kratosID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteWizardStateResponse{
		Success: true,
	}), nil
}

// CreateCourseFromOutline is not used in the new wizard flow — course creation
// goes through StartCourseCreation on AIGenerationService instead.
// Left unimplemented (returns CodeUnimplemented from the embedded handler).

// ---------------------------------------------------------------------------
// Proto ↔ Domain mappers
// ---------------------------------------------------------------------------

func smePersonasToProto(personas []entity.WizardSMEPersona) []*v1.SMEPersona {
	out := make([]*v1.SMEPersona, len(personas))
	for i, p := range personas {
		out[i] = &v1.SMEPersona{
			Id:          p.ID,
			JobTitle:    p.JobTitle,
			Description: p.Description,
			Skills:      p.Skills,
			Voice:       p.Voice,
		}
	}
	return out
}

func smePersonasFromProto(protos []*v1.SMEPersona) []entity.WizardSMEPersona {
	out := make([]entity.WizardSMEPersona, len(protos))
	for i, p := range protos {
		out[i] = entity.WizardSMEPersona{
			ID:          p.GetId(),
			JobTitle:    p.GetJobTitle(),
			Description: p.GetDescription(),
			Skills:      p.GetSkills(),
			Voice:       p.GetVoice(),
		}
	}
	return out
}

func audiencePersonasToProto(personas []entity.WizardAudiencePersona) []*v1.AudiencePersona {
	out := make([]*v1.AudiencePersona, len(personas))
	for i, p := range personas {
		out[i] = &v1.AudiencePersona{
			Id:          p.ID,
			Role:        p.Role,
			Description: p.Description,
			Goals:       p.Goals,
		}
	}
	return out
}

func audiencePersonasFromProto(protos []*v1.AudiencePersona) []entity.WizardAudiencePersona {
	out := make([]entity.WizardAudiencePersona, len(protos))
	for i, p := range protos {
		out[i] = entity.WizardAudiencePersona{
			ID:          p.GetId(),
			Role:        p.GetRole(),
			Description: p.GetDescription(),
			Goals:       p.GetGoals(),
		}
	}
	return out
}

func toneOptionsToProto(options []entity.WizardToneOption) []*v1.ToneOption {
	out := make([]*v1.ToneOption, len(options))
	for i, o := range options {
		out[i] = &v1.ToneOption{
			Id:            o.ID,
			Name:          o.Name,
			Description:   o.Description,
			LevelOfDetail: toneDetailLevelToProto(o.LevelOfDetail),
		}
	}
	return out
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

func toneDetailLevelFromProto(level v1.ToneDetailLevel) entity.ToneDetailLevel {
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

func wizardStepDataFromProto(pb *v1.WizardStepData) *entity.WizardStepData {
	if pb == nil {
		return &entity.WizardStepData{}
	}

	data := &entity.WizardStepData{
		CourseName:           pb.GetCourseName(),
		ImprovedTitle:        pb.GetImprovedTitle(),
		Description:          pb.GetDescription(),
		SelectedSMEIDs:       pb.GetSelectedSmeIds(),
		SelectedAudienceIDs:  pb.GetSelectedAudienceIds(),
		SelectedToneID:       pb.GetSelectedToneId(),
		AdditionalContext:    pb.GetAdditionalContext(),
		DesiredOutcomes:      pb.GetDesiredOutcomes(),
		SelectedTeamDocIDs:   pb.GetSelectedTeamDocIds(),
		SelectedGlobalDocIDs: pb.GetSelectedGlobalDocIds(),
		InternalDataOnly:     pb.GetInternalDataOnly(),
	}

	for _, p := range pb.GetSmePersonas() {
		data.SMEPersonas = append(data.SMEPersonas, entity.WizardSMEPersona{
			ID:          p.GetId(),
			JobTitle:    p.GetJobTitle(),
			Description: p.GetDescription(),
			Skills:      p.GetSkills(),
			Voice:       p.GetVoice(),
		})
	}

	for _, p := range pb.GetAudiencePersonas() {
		data.AudiencePersonas = append(data.AudiencePersonas, entity.WizardAudiencePersona{
			ID:          p.GetId(),
			Role:        p.GetRole(),
			Description: p.GetDescription(),
			Goals:       p.GetGoals(),
		})
	}

	for _, o := range pb.GetToneOptions() {
		data.ToneOptions = append(data.ToneOptions, entity.WizardToneOption{
			ID:            o.GetId(),
			Name:          o.GetName(),
			Description:   o.GetDescription(),
			LevelOfDetail: toneDetailLevelFromProto(o.GetLevelOfDetail()),
		})
	}

	return data
}

func wizardStepDataToProto(data *entity.WizardStepData) *v1.WizardStepData {
	if data == nil {
		return nil
	}

	pb := &v1.WizardStepData{
		CourseName:           data.CourseName,
		ImprovedTitle:        data.ImprovedTitle,
		Description:          data.Description,
		SelectedSmeIds:       data.SelectedSMEIDs,
		SelectedAudienceIds:  data.SelectedAudienceIDs,
		SelectedToneId:       data.SelectedToneID,
		AdditionalContext:    data.AdditionalContext,
		DesiredOutcomes:      data.DesiredOutcomes,
		SelectedTeamDocIds:   data.SelectedTeamDocIDs,
		SelectedGlobalDocIds: data.SelectedGlobalDocIDs,
		InternalDataOnly:     data.InternalDataOnly,
	}

	pb.SmePersonas = smePersonasToProto(data.SMEPersonas)
	pb.AudiencePersonas = audiencePersonasToProto(data.AudiencePersonas)
	pb.ToneOptions = toneOptionsToProto(data.ToneOptions)

	return pb
}

func wizardStateToProto(state *entity.WizardState) *v1.WizardState {
	if state == nil {
		return nil
	}
	return &v1.WizardState{
		Id:          state.ID.String(),
		TenantId:    state.TenantID.String(),
		UserId:      state.UserID.String(),
		CurrentStep: state.CurrentStep,
		Data:        wizardStepDataToProto(state.Data),
		CreatedAt:   timestamppb.New(state.CreatedAt),
		UpdatedAt:   timestamppb.New(state.UpdatedAt),
	}
}
