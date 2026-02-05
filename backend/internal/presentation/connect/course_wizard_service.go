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
	aiService     *service.AIGenerationService
	courseService *service.CourseService
}

// NewCourseWizardServiceServer creates a new CourseWizardServiceServer.
func NewCourseWizardServiceServer(
	wizardService *service.CourseWizardService,
	aiService *service.AIGenerationService,
	courseService *service.CourseService,
) *CourseWizardServiceServer {
	return &CourseWizardServiceServer{
		wizardService: wizardService,
		aiService:     aiService,
		courseService: courseService,
	}
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

	result, err := s.wizardService.GenerateTitle(ctx, kratosID, service.GenerateTitleInput{
		CourseName:           req.Msg.CourseName,
		SelectedTeamDocIDs:   req.Msg.SelectedTeamDocIds,
		SelectedGlobalDocIDs: req.Msg.SelectedGlobalDocIds,
	})
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateTitleResponse{
		ImprovedTitle: result.ImprovedTitle,
		Description:   result.Description,
	}), nil
}

// GenerateOutcomes generates desired course outcomes from a course name.
// Used by the "magic wand" button in wizard step 1.
// If session_id is provided, RAG context from uploaded knowledge sources will be used.
func (s *CourseWizardServiceServer) GenerateOutcomes(
	ctx context.Context,
	req *connect.Request[v1.GenerateOutcomesRequest],
) (*connect.Response[v1.GenerateOutcomesResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Build input with optional session ID and selected knowledge source IDs for RAG context
	input := service.GenerateOutcomesInput{
		CourseName:           req.Msg.CourseName,
		SelectedTeamDocIDs:   req.Msg.SelectedTeamDocIds,
		SelectedGlobalDocIDs: req.Msg.SelectedGlobalDocIds,
	}
	if req.Msg.SessionId != nil {
		input.SessionID = *req.Msg.SessionId
	}

	result, err := s.wizardService.GenerateOutcomes(ctx, kratosID, input)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Convert citations to proto
	citations := make([]*v1.KnowledgeCitation, len(result.Citations))
	for i, c := range result.Citations {
		citations[i] = &v1.KnowledgeCitation{
			SourceId:       c.SourceID,
			SourceName:     c.SourceName,
			Excerpt:        c.Excerpt,
			RelevanceScore: c.RelevanceScore,
		}
	}

	return connect.NewResponse(&v1.GenerateOutcomesResponse{
		Outcomes:  result.Outcomes,
		Citations: citations,
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

	result, err := s.wizardService.GenerateSMEPersonas(ctx, kratosID, service.GenerateSMEPersonasInput{
		Title:                req.Msg.Title,
		Description:          req.Msg.Description,
		SelectedTeamDocIDs:   req.Msg.SelectedTeamDocIds,
		SelectedGlobalDocIDs: req.Msg.SelectedGlobalDocIds,
	})
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
		Title:                req.Msg.Title,
		Description:          req.Msg.Description,
		SMEPersonas:          smePersonas,
		SelectedTeamDocIDs:   req.Msg.SelectedTeamDocIds,
		SelectedGlobalDocIDs: req.Msg.SelectedGlobalDocIds,
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
		Title:                req.Msg.Title,
		Description:          req.Msg.Description,
		AudiencePersonas:     audiencePersonas,
		SelectedTeamDocIDs:   req.Msg.SelectedTeamDocIds,
		SelectedGlobalDocIDs: req.Msg.SelectedGlobalDocIds,
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

// CreateCourseFromOutline persists wizard data and starts lesson generation.
// This method:
// 1. Persists wizard data (personas, audience, tone) to course content
// 2. Starts background jobs to generate lesson content via GenerateAllLessons
// 3. Cleans up wizard state
// 4. Returns the course ID and title
func (s *CourseWizardServiceServer) CreateCourseFromOutline(
	ctx context.Context,
	req *connect.Request[v1.CreateCourseFromOutlineRequest],
) (*connect.Response[v1.CreateCourseFromOutlineResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Step 1: Get wizard state to persist personas/audience/tone with course
	wizardState, _ := s.wizardService.GetWizardState(ctx, kratosID)

	// Step 2: Get the course and update it with wizard data
	course, err := s.courseService.GetCourse(ctx, kratosID, courseID.String())
	if err != nil {
		return nil, toConnectError(err)
	}

	courseTitle := ""
	if course != nil {
		courseTitle = course.Settings.Title

		// Persist wizard data to course content for AI generation and realignment
		if wizardState != nil && wizardState.Data != nil {
			wizardData := wizardStepDataToS3WizardData(wizardState.Data)
			course.WizardData = wizardData

			// Update the course with wizard data
			_, err = s.courseService.UpdateCourse(ctx, kratosID, courseID.String(), course)
			if err != nil {
				// Log but don't fail - wizard data is supplementary
				// The course will still work, just without persona context
			}
		}
	}

	// Step 3: Start background jobs to generate lesson content
	// GenerateAllLessons creates a parent FULL_COURSE job and child LESSON_CONTENT jobs
	_, err = s.aiService.GenerateAllLessons(ctx, kratosID, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Step 4: Clean up wizard state (ignore errors - not critical)
	_ = s.wizardService.DeleteWizardState(ctx, kratosID)

	// Return the course ID and title
	return connect.NewResponse(&v1.CreateCourseFromOutlineResponse{
		CourseId:    courseID.String(),
		CourseTitle: courseTitle,
	}), nil
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
		DesiredOutcomes:     data.DesiredOutcomes,
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
		CourseName:           data.CourseName,
		ImprovedTitle:        data.ImprovedTitle,
		Description:          data.Description,
		SMEPersonas:          smePersonas,
		SelectedSMEIDs:       data.SelectedSmeIds,
		AudiencePersonas:     audiencePersonas,
		SelectedAudienceIDs:  data.SelectedAudienceIds,
		ToneOptions:          toneOptions,
		SelectedToneID:       data.SelectedToneId,
		AdditionalContext:    data.AdditionalContext,
		DesiredOutcomes:      data.DesiredOutcomes,
		SelectedTeamDocIDs:   data.SelectedTeamDocIds,
		SelectedGlobalDocIDs: data.SelectedGlobalDocIds,
		InternalDataOnly:     data.InternalDataOnly,
	}
}

// wizardStepDataToS3WizardData converts entity wizard data to S3 storage format.
// This is used to persist wizard selections (personas, tone) with the course
// so they're available for AI generation and realignment features.
func wizardStepDataToS3WizardData(data *entity.WizardStepData) *service.S3WizardData {
	if data == nil {
		return nil
	}

	// Convert SME personas
	smePersonas := make([]service.S3SMEPersona, len(data.SMEPersonas))
	for i, p := range data.SMEPersonas {
		smePersonas[i] = service.S3SMEPersona{
			ID:          p.ID,
			JobTitle:    p.JobTitle,
			Description: p.Description,
			Skills:      p.Skills,
			Voice:       p.Voice,
		}
	}

	// Convert audience personas
	audiencePersonas := make([]service.S3AudiencePersona, len(data.AudiencePersonas))
	for i, p := range data.AudiencePersonas {
		audiencePersonas[i] = service.S3AudiencePersona{
			ID:          p.ID,
			Name:        p.Name,
			Role:        p.Role,
			Description: p.Description,
			Goals:       p.Goals,
		}
	}

	// Find selected tone option
	var selectedTone *service.S3ToneOption
	for _, t := range data.ToneOptions {
		if t.ID == data.SelectedToneID {
			selectedTone = &service.S3ToneOption{
				ID:            t.ID,
				Name:          t.Name,
				Description:   t.Description,
				LevelOfDetail: string(t.LevelOfDetail),
			}
			break
		}
	}

	return &service.S3WizardData{
		SMEPersonas:          smePersonas,
		SelectedSMEIDs:       data.SelectedSMEIDs,
		AudiencePersonas:     audiencePersonas,
		SelectedAudienceIDs:  data.SelectedAudienceIDs,
		SelectedTone:         selectedTone,
		AdditionalContext:    data.AdditionalContext,
		DesiredOutcomes:      data.DesiredOutcomes,
		InternalDataOnly:     data.InternalDataOnly,
		SelectedTeamDocIDs:   data.SelectedTeamDocIDs,
		SelectedGlobalDocIDs: data.SelectedGlobalDocIDs,
	}
}
