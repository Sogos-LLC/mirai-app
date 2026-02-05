package connect

import (
	"context"
	"log/slog"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
)

// AIGenerationServiceServer implements the AIGenerationService Connect handler.
type AIGenerationServiceServer struct {
	miraiv1connect.UnimplementedAIGenerationServiceHandler
	aiService  *service.AIGenerationService
	subscriber pubsub.Subscriber
}

// NewAIGenerationServiceServer creates a new AIGenerationServiceServer.
func NewAIGenerationServiceServer(aiService *service.AIGenerationService, subscriber pubsub.Subscriber) *AIGenerationServiceServer {
	return &AIGenerationServiceServer{
		aiService:  aiService,
		subscriber: subscriber,
	}
}

// GetCourseOutline returns the generated outline for a course.
func (s *AIGenerationServiceServer) GetCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.GetCourseOutlineRequest],
) (*connect.Response[v1.GetCourseOutlineResponse], error) {
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

	outline, err := s.aiService.GetCourseOutline(ctx, kratosID, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Also get wizard data for realignment features
	wizardData, err := s.aiService.GetWizardData(ctx, kratosID, courseID)
	if err != nil {
		// Log the error but don't fail the request - wizard data is supplementary
		slog.Warn("failed to get wizard data for course",
			"courseID", courseID.String(),
			"error", err.Error(),
		)
	}

	return connect.NewResponse(&v1.GetCourseOutlineResponse{
		Outline:    courseOutlineToProto(outline),
		WizardData: s3WizardDataToProto(wizardData),
	}), nil
}

// UpdateCourseOutline allows editing the outline before approval.
func (s *AIGenerationServiceServer) UpdateCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.UpdateCourseOutlineRequest],
) (*connect.Response[v1.UpdateCourseOutlineResponse], error) {
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

	outlineID, err := parseUUID(req.Msg.OutlineId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Convert proto sections to service sections
	sections := make([]service.UpdateCourseOutlineSection, len(req.Msg.Sections))
	for i, protoSection := range req.Msg.Sections {
		sectionID, err := parseUUID(protoSection.Id)
		if err != nil {
			continue
		}

		lessons := make([]service.UpdateCourseOutlineLesson, len(protoSection.Lessons))
		for j, protoLesson := range protoSection.Lessons {
			lessonID, err := parseUUID(protoLesson.Id)
			if err != nil {
				continue
			}

			var duration *int32
			if protoLesson.EstimatedDurationMinutes > 0 {
				duration = &protoLesson.EstimatedDurationMinutes
			}

			lessons[j] = service.UpdateCourseOutlineLesson{
				ID:                       lessonID,
				Title:                    protoLesson.Title,
				Description:              protoLesson.Description,
				Order:                    protoLesson.Order,
				EstimatedDurationMinutes: duration,
				LearningObjectives:       protoLesson.LearningObjectives,
			}
		}

		sections[i] = service.UpdateCourseOutlineSection{
			ID:               sectionID,
			Title:            protoSection.Title,
			Description:      protoSection.Description,
			Order:            protoSection.Order,
			Lessons:          lessons,
			MappedOutcomeIDs: protoSection.MappedOutcomeIds,
			Level:            sectionLevelToString(protoSection.Level),
			Intent:           sectionIntentToString(protoSection.Intent),
			Emphasis:         sectionEmphasisToString(protoSection.Emphasis),
		}
	}

	outline, err := s.aiService.UpdateCourseOutline(ctx, kratosID, courseID, outlineID, sections)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateCourseOutlineResponse{
		Outline: courseOutlineToProto(outline),
	}), nil
}

// GetJob returns a generation job by ID.
func (s *AIGenerationServiceServer) GetJob(
	ctx context.Context,
	req *connect.Request[v1.GetJobRequest],
) (*connect.Response[v1.GetJobResponse], error) {
	slog.Info("[GetJob] Request received", "jobId", req.Msg.JobId)

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		slog.Warn("[GetJob] Unauthenticated request")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	jobID, err := parseUUID(req.Msg.JobId)
	if err != nil {
		slog.Warn("[GetJob] Invalid job ID", "jobId", req.Msg.JobId, "error", err)
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	job, err := s.aiService.GetJob(ctx, kratosID, jobID)
	if err != nil {
		slog.Warn("[GetJob] Service error", "jobId", jobID.String(), "error", err)
		return nil, toConnectError(err)
	}

	slog.Info("[GetJob] Returning job",
		"jobId", job.ID.String(),
		"status", job.Status.String(),
		"courseId", job.CourseID,
		"progress", job.ProgressPercent,
	)

	return connect.NewResponse(&v1.GetJobResponse{
		Job: generationJobToProto(job),
	}), nil
}

// ListJobs returns generation jobs for the current user.
func (s *AIGenerationServiceServer) ListJobs(
	ctx context.Context,
	req *connect.Request[v1.ListJobsRequest],
) (*connect.Response[v1.ListJobsResponse], error) {
	slog.Info("[ListJobs] Request received",
		"type", req.Msg.Type,
		"status", req.Msg.Status,
		"courseId", req.Msg.CourseId,
	)

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		slog.Warn("[ListJobs] Unauthenticated request")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	opts := entity.GenerationJobListOptions{}

	if req.Msg.Type != nil {
		jobType := protoToGenerationJobType(*req.Msg.Type)
		opts.Type = &jobType
	}

	if req.Msg.Status != nil {
		status := protoToGenerationJobStatus(*req.Msg.Status)
		opts.Status = &status
	}

	if req.Msg.CourseId != nil {
		if id, err := uuid.Parse(*req.Msg.CourseId); err == nil {
			opts.CourseID = &id
			slog.Info("[ListJobs] Filtering by courseId", "courseId", id.String())
		} else {
			slog.Warn("[ListJobs] Invalid courseId format", "courseId", *req.Msg.CourseId, "error", err)
		}
	}

	jobs, err := s.aiService.ListJobs(ctx, kratosID, opts)
	if err != nil {
		slog.Error("[ListJobs] Service error", "error", err)
		return nil, toConnectError(err)
	}

	slog.Info("[ListJobs] Returning jobs", "count", len(jobs))
	for i, job := range jobs {
		slog.Info("[ListJobs] Job",
			"index", i,
			"jobId", job.ID.String(),
			"status", job.Status.String(),
			"courseId", job.CourseID,
		)
	}

	protoJobs := make([]*v1.GenerationJob, len(jobs))
	for i, job := range jobs {
		protoJobs[i] = generationJobToProto(job)
	}

	return connect.NewResponse(&v1.ListJobsResponse{
		Jobs: protoJobs,
	}), nil
}

// CancelJob cancels a queued or processing job.
func (s *AIGenerationServiceServer) CancelJob(
	ctx context.Context,
	req *connect.Request[v1.CancelJobRequest],
) (*connect.Response[v1.CancelJobResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	jobID, err := parseUUID(req.Msg.JobId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	job, err := s.aiService.CancelJob(ctx, kratosID, jobID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CancelJobResponse{
		Job: generationJobToProto(job),
	}), nil
}

// GetGeneratedLesson returns generated lesson content.
func (s *AIGenerationServiceServer) GetGeneratedLesson(
	ctx context.Context,
	req *connect.Request[v1.GetGeneratedLessonRequest],
) (*connect.Response[v1.GetGeneratedLessonResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	lessonID, err := parseUUID(req.Msg.LessonId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	lesson, err := s.aiService.GetGeneratedLesson(ctx, kratosID, lessonID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetGeneratedLessonResponse{
		Lesson: generatedLessonToProto(lesson),
	}), nil
}

// ListGeneratedLessons returns all generated lessons for a course.
func (s *AIGenerationServiceServer) ListGeneratedLessons(
	ctx context.Context,
	req *connect.Request[v1.ListGeneratedLessonsRequest],
) (*connect.Response[v1.ListGeneratedLessonsResponse], error) {
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

	lessons, err := s.aiService.ListGeneratedLessons(ctx, kratosID, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoLessons := make([]*v1.GeneratedLesson, len(lessons))
	for i, lesson := range lessons {
		protoLessons[i] = generatedLessonToProto(lesson)
	}

	return connect.NewResponse(&v1.ListGeneratedLessonsResponse{
		Lessons: protoLessons,
	}), nil
}

// GenerateComponentImage generates an image for an image placeholder component.
func (s *AIGenerationServiceServer) GenerateComponentImage(
	ctx context.Context,
	req *connect.Request[v1.GenerateComponentImageRequest],
) (*connect.Response[v1.GenerateComponentImageResponse], error) {
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

	generatedLessonID, err := parseUUID(req.Msg.GeneratedLessonId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	componentID, err := parseUUID(req.Msg.ComponentId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Get aspect ratio, default to 16:9
	aspectRatio := "16:9"
	if req.Msg.AspectRatio != nil && *req.Msg.AspectRatio != "" {
		aspectRatio = *req.Msg.AspectRatio
	}

	serviceReq := service.GenerateComponentImageRequest{
		CourseID:    courseID,
		LessonID:    generatedLessonID,
		ComponentID: componentID,
		Prompt:      req.Msg.Prompt,
		AspectRatio: aspectRatio,
	}

	result, err := s.aiService.GenerateComponentImage(ctx, kratosID, serviceReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateComponentImageResponse{
		ImageUrl:  result.ImageURL,
		Component: lessonComponentToProto(result.Component),
	}), nil
}

// UpdateLessonComponents saves manual edits to lesson components.
func (s *AIGenerationServiceServer) UpdateLessonComponents(
	ctx context.Context,
	req *connect.Request[v1.UpdateLessonComponentsRequest],
) (*connect.Response[v1.UpdateLessonComponentsResponse], error) {
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

	generatedLessonID, err := parseUUID(req.Msg.GeneratedLessonId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Convert proto components to service input
	components := make([]service.UpdateComponentInput, len(req.Msg.Components))
	for i, c := range req.Msg.Components {
		var learningObjectiveIDs []string
		if c.Alignment != nil {
			learningObjectiveIDs = c.Alignment.LearningObjectiveIds
		}

		components[i] = service.UpdateComponentInput{
			ID:                   c.Id,
			Type:                 protoToLessonComponentType(c.Type),
			Order:                c.Order,
			ContentJSON:          []byte(c.ContentJson),
			LearningObjectiveIDs: learningObjectiveIDs,
		}
	}

	serviceReq := service.UpdateLessonComponentsRequest{
		CourseID:   courseID,
		LessonID:   generatedLessonID,
		Components: components,
	}

	result, err := s.aiService.UpdateLessonComponents(ctx, kratosID, serviceReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateLessonComponentsResponse{
		Lesson: generatedLessonToProto(result.Lesson),
	}), nil
}

// GetCoursePlan retrieves the course plan for a course.
func (s *AIGenerationServiceServer) GetCoursePlan(
	ctx context.Context,
	req *connect.Request[v1.GetCoursePlanRequest],
) (*connect.Response[v1.GetCoursePlanResponse], error) {
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

	result, err := s.aiService.GetCoursePlan(ctx, kratosID, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetCoursePlanResponse{
		Plan: s3CoursePlanToProto(result.Plan),
	}), nil
}

// ApproveCoursePlan marks the course plan as approved.
func (s *AIGenerationServiceServer) ApproveCoursePlan(
	ctx context.Context,
	req *connect.Request[v1.ApproveCoursePlanRequest],
) (*connect.Response[v1.ApproveCoursePlanResponse], error) {
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

	result, err := s.aiService.ApproveCoursePlan(ctx, kratosID, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ApproveCoursePlanResponse{
		Plan: s3CoursePlanToProto(result.Plan),
	}), nil
}

// SubscribeJobs opens a server-streaming connection for real-time job events.
func (s *AIGenerationServiceServer) SubscribeJobs(
	ctx context.Context,
	req *connect.Request[v1.SubscribeJobsRequest],
	stream *connect.ServerStream[v1.SubscribeJobsResponse],
) error {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}

	// Get user ID from kratos ID
	userID, err := s.aiService.GetUserIDByKratosID(ctx, kratosID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}

	// Subscribe to Redis channel for this user's job events
	eventCh, cleanup, err := s.subscriber.SubscribeJobEvents(ctx, userID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}
	defer cleanup()

	// Re-emit pending approval events for workflow resumption
	awaitingStatus := valueobject.GenerationJobStatusAwaitingApproval
	awaitingJobs, err := s.aiService.ListJobs(ctx, kratosID, entity.GenerationJobListOptions{
		Status: &awaitingStatus,
	})
	if err != nil {
		slog.Warn("failed to list awaiting approval jobs for re-emit", "error", err)
	} else {
		for _, job := range awaitingJobs {
			if job.PendingStep != nil {
				pendingStep := v1.WorkflowStepType(*job.PendingStep)
				resp := &v1.SubscribeJobsResponse{
					EventType:    v1.JobEventType_JOB_EVENT_TYPE_AWAITING_APPROVAL,
					Job:          generationJobToProto(job),
					PendingStep:  &pendingStep,
					StepDataJson: job.StepDataJSON,
				}
				if err := stream.Send(resp); err != nil {
					return err
				}
			}
		}
	}

	// Heartbeat ticker to keep connection alive through Cloudflare/proxy timeouts
	// Send a keep-alive every 15 seconds (proxy timeout is ~30s)
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	// Forward events to client stream
	for {
		select {
		case <-ctx.Done():
			// Client disconnected or context cancelled
			return nil
		case <-heartbeat.C:
			// Send heartbeat to keep connection alive through proxy timeouts
			resp := &v1.SubscribeJobsResponse{
				EventType: v1.JobEventType_JOB_EVENT_TYPE_KEEPALIVE,
				Job: &v1.GenerationJob{
					Id:        "keepalive",
					CreatedAt: timestamppb.Now(),
				},
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		case event, ok := <-eventCh:
			if !ok {
				// Channel closed
				return nil
			}
			// Send event to client
			resp := &v1.SubscribeJobsResponse{
				EventType:    event.EventType,
				Job:          event.Job,
				PendingStep:  event.PendingStep,
				StepDataJson: event.StepDataJSON,
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		}
	}
}

// Helper functions for proto conversion

func generationJobToProto(job *entity.GenerationJob) *v1.GenerationJob {
	if job == nil {
		return nil
	}

	proto := &v1.GenerationJob{
		Id:              job.ID.String(),
		TenantId:        job.TenantID.String(),
		Type:            generationJobTypeToProto(job.Type),
		Status:          generationJobStatusToProto(job.Status),
		ProgressPercent: int32(job.ProgressPercent),
		ProgressMessage: job.ProgressMessage,
		ResultPath:      job.ResultPath,
		ErrorMessage:    job.ErrorMessage,
		TokensUsed:      job.TokensUsed,
		RetryCount:      int32(job.RetryCount),
		MaxRetries:      int32(job.MaxRetries),
		CreatedByUserId: job.CreatedByUserID.String(),
		CreatedAt:       timestamppb.New(job.CreatedAt),
	}

	if job.CourseID != nil {
		s := job.CourseID.String()
		proto.CourseId = &s
	}
	if job.LessonID != nil {
		s := job.LessonID.String()
		proto.LessonId = &s
	}
	// SMETaskID and SubmissionID removed in Phase 3
	if job.ParentJobID != nil {
		s := job.ParentJobID.String()
		proto.ParentJobId = &s
	}
	if job.StartedAt != nil {
		proto.StartedAt = timestamppb.New(*job.StartedAt)
	}
	if job.CompletedAt != nil {
		proto.CompletedAt = timestamppb.New(*job.CompletedAt)
	}
	if job.PendingStep != nil {
		v := *job.PendingStep
		proto.PendingStep = &v
	}
	if job.StepDataJSON != nil {
		proto.StepDataJson = job.StepDataJSON
	}

	return proto
}

func courseOutlineToProto(outline *entity.CourseOutline) *v1.CourseOutline {
	if outline == nil {
		return nil
	}

	proto := &v1.CourseOutline{
		Id:              outline.ID.String(),
		CourseId:        outline.CourseID.String(),
		Version:         int32(outline.Version),
		ApprovalStatus:  outlineApprovalStatusToProto(outline.ApprovalStatus),
		RejectionReason: outline.RejectionReason,
		GeneratedAt:     timestamppb.New(outline.GeneratedAt),
	}

	if outline.ApprovedAt != nil {
		proto.ApprovedAt = timestamppb.New(*outline.ApprovedAt)
	}
	if outline.ApprovedByUserID != nil {
		s := outline.ApprovedByUserID.String()
		proto.ApprovedByUserId = &s
	}

	proto.Sections = make([]*v1.OutlineSection, len(outline.Sections))
	for i := range outline.Sections {
		proto.Sections[i] = outlineSectionToProto(&outline.Sections[i])
	}

	return proto
}

func outlineSectionToProto(section *entity.OutlineSection) *v1.OutlineSection {
	if section == nil {
		return nil
	}

	proto := &v1.OutlineSection{
		Id:                   section.ID.String(),
		Title:                section.Title,
		Description:          section.Description,
		Order:                section.Position,
		MappedOutcomeIds:     section.MappedOutcomeIDs,
		GroundingScore:       section.GroundingScore,
		ContributingChunkIds: section.ContributingChunkIDs,
		Level:                stringToSectionLevel(section.Level),
		Intent:               stringToSectionIntent(section.Intent),
		Emphasis:             stringToSectionEmphasis(section.Emphasis),
	}

	proto.Lessons = make([]*v1.OutlineLesson, len(section.Lessons))
	for i := range section.Lessons {
		proto.Lessons[i] = outlineLessonToProto(&section.Lessons[i])
	}

	return proto
}

func stringToSectionLevel(s string) v1.SectionLevel {
	switch s {
	case "introduce":
		return v1.SectionLevel_SECTION_LEVEL_INTRODUCE
	case "develop":
		return v1.SectionLevel_SECTION_LEVEL_DEVELOP
	case "master":
		return v1.SectionLevel_SECTION_LEVEL_MASTER
	default:
		return v1.SectionLevel_SECTION_LEVEL_UNSPECIFIED
	}
}

func stringToSectionIntent(s string) v1.SectionIntent {
	switch s {
	case "teach":
		return v1.SectionIntent_SECTION_INTENT_TEACH
	case "assess":
		return v1.SectionIntent_SECTION_INTENT_ASSESS
	case "reinforce":
		return v1.SectionIntent_SECTION_INTENT_REINFORCE
	default:
		return v1.SectionIntent_SECTION_INTENT_UNSPECIFIED
	}
}

func stringToSectionEmphasis(s string) v1.SectionEmphasis {
	switch s {
	case "low":
		return v1.SectionEmphasis_SECTION_EMPHASIS_LOW
	case "medium":
		return v1.SectionEmphasis_SECTION_EMPHASIS_MEDIUM
	case "high":
		return v1.SectionEmphasis_SECTION_EMPHASIS_HIGH
	default:
		return v1.SectionEmphasis_SECTION_EMPHASIS_UNSPECIFIED
	}
}

func sectionLevelToString(l v1.SectionLevel) string {
	switch l {
	case v1.SectionLevel_SECTION_LEVEL_INTRODUCE:
		return "introduce"
	case v1.SectionLevel_SECTION_LEVEL_DEVELOP:
		return "develop"
	case v1.SectionLevel_SECTION_LEVEL_MASTER:
		return "master"
	default:
		return ""
	}
}

func sectionIntentToString(i v1.SectionIntent) string {
	switch i {
	case v1.SectionIntent_SECTION_INTENT_TEACH:
		return "teach"
	case v1.SectionIntent_SECTION_INTENT_ASSESS:
		return "assess"
	case v1.SectionIntent_SECTION_INTENT_REINFORCE:
		return "reinforce"
	default:
		return ""
	}
}

func sectionEmphasisToString(e v1.SectionEmphasis) string {
	switch e {
	case v1.SectionEmphasis_SECTION_EMPHASIS_LOW:
		return "low"
	case v1.SectionEmphasis_SECTION_EMPHASIS_MEDIUM:
		return "medium"
	case v1.SectionEmphasis_SECTION_EMPHASIS_HIGH:
		return "high"
	default:
		return ""
	}
}

func outlineLessonToProto(lesson *entity.OutlineLesson) *v1.OutlineLesson {
	if lesson == nil {
		return nil
	}

	var estimatedDuration int32
	if lesson.EstimatedDurationMinutes != nil {
		estimatedDuration = *lesson.EstimatedDurationMinutes
	}

	return &v1.OutlineLesson{
		Id:                       lesson.ID.String(),
		Title:                    lesson.Title,
		Description:              lesson.Description,
		Order:                    lesson.Position,
		EstimatedDurationMinutes: estimatedDuration,
		LearningObjectives:       lesson.LearningObjectives,
		IsLastInSection:          lesson.IsLastInSection,
		IsLastInCourse:           lesson.IsLastInCourse,
	}
}

// s3WizardDataToProto converts S3WizardData to proto StoredWizardData.
// Used for returning wizard data in GetCourseOutlineResponse.
func s3WizardDataToProto(data *service.S3WizardData) *v1.StoredWizardData {
	if data == nil {
		return nil
	}

	// Convert SME personas
	smePersonas := make([]*v1.SMEPersona, len(data.SMEPersonas))
	for i, sme := range data.SMEPersonas {
		smePersonas[i] = &v1.SMEPersona{
			Id:          sme.ID,
			JobTitle:    sme.JobTitle,
			Description: sme.Description,
			Skills:      sme.Skills,
			Voice:       sme.Voice,
		}
	}

	// Convert audience personas
	audiencePersonas := make([]*v1.AudiencePersona, len(data.AudiencePersonas))
	for i, aud := range data.AudiencePersonas {
		audiencePersonas[i] = &v1.AudiencePersona{
			Id:          aud.ID,
			Name:        aud.Name,
			Role:        aud.Role,
			Description: aud.Description,
			Goals:       aud.Goals,
		}
	}

	// Convert selected tone
	var selectedTone *v1.ToneOption
	if data.SelectedTone != nil {
		selectedTone = &v1.ToneOption{
			Id:          data.SelectedTone.ID,
			Name:        data.SelectedTone.Name,
			Description: data.SelectedTone.Description,
			// Map level of detail string to enum
			LevelOfDetail: toneDetailLevelFromString(data.SelectedTone.LevelOfDetail),
		}
	}

	return &v1.StoredWizardData{
		SmePersonas:         smePersonas,
		SelectedSmeIds:      data.SelectedSMEIDs,
		AudiencePersonas:    audiencePersonas,
		SelectedAudienceIds: data.SelectedAudienceIDs,
		SelectedTone:        selectedTone,
		DesiredOutcomes:     data.DesiredOutcomes,
	}
}

// toneDetailLevelFromString converts a string to ToneDetailLevel enum.
func toneDetailLevelFromString(s string) v1.ToneDetailLevel {
	switch s {
	case "brief", "BRIEF":
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_BRIEF
	case "moderate", "MODERATE":
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_MODERATE
	case "comprehensive", "COMPREHENSIVE":
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_COMPREHENSIVE
	default:
		return v1.ToneDetailLevel_TONE_DETAIL_LEVEL_UNSPECIFIED
	}
}

func generatedLessonToProto(lesson *entity.GeneratedLesson) *v1.GeneratedLesson {
	if lesson == nil {
		return nil
	}

	proto := &v1.GeneratedLesson{
		Id:                lesson.ID.String(),
		CourseId:          lesson.CourseID.String(),
		SectionId:         lesson.SectionID.String(),
		OutlineLessonId:   lesson.OutlineLessonID.String(),
		Title:             lesson.Title,
		SegueText:         lesson.SegueText,
		GeneratedAt:       timestamppb.New(lesson.GeneratedAt),
		GroundingScore:    lesson.GroundingScore,
		SourceCount:       lesson.SourceCount,
		GroundedTokenCount: lesson.GroundedTokens,
		TotalTokenCount:   lesson.TotalTokens,
	}

	if lesson.AggregateProvenance != nil {
		proto.AggregateProvenance = lessonProvenanceToProto(lesson.AggregateProvenance)
	}

	proto.Components = make([]*v1.LessonComponent, len(lesson.Components))
	for i := range lesson.Components {
		proto.Components[i] = lessonComponentToProto(&lesson.Components[i])
	}

	return proto
}

func lessonComponentToProto(comp *entity.LessonComponent) *v1.LessonComponent {
	if comp == nil {
		return nil
	}

	proto := &v1.LessonComponent{
		Id:          comp.ID.String(),
		Type:        lessonComponentTypeToProto(comp.Type),
		Order:       comp.Position,
		ContentJson: string(comp.ContentJSON),
	}

	if comp.SMEChunkIDs != nil || comp.LearningObjectiveIDs != nil {
		proto.Alignment = &v1.ComponentAlignment{
			LearningObjectiveIds: comp.LearningObjectiveIDs,
		}
	}

	if comp.Provenance != nil {
		proto.Provenance = componentProvenanceToProto(comp.Provenance)
	}

	return proto
}

func componentProvenanceToProto(prov *entity.ComponentProvenance) *v1.ComponentProvenance {
	if prov == nil {
		return nil
	}
	proto := &v1.ComponentProvenance{
		Queries:      prov.Queries,
		TeamTokens:   prov.TeamTokens,
		GlobalTokens: prov.GlobalTokens,
		CourseTokens: prov.CourseTokens,
		TotalTokens:  prov.TotalTokens,
		GeneratedAt:  timestamppb.New(prov.GeneratedAt),
	}
	for _, chunk := range prov.SourceChunks {
		proto.SourceChunks = append(proto.SourceChunks, &v1.ProvenanceChunk{
			ChunkId:         chunk.ChunkID,
			SourceId:        chunk.SourceID,
			SourceName:      chunk.SourceName,
			Excerpt:         chunk.Excerpt,
			SimilarityScore: chunk.SimilarityScore,
			Scope:           chunk.Scope,
		})
	}
	return proto
}

func lessonProvenanceToProto(prov *entity.LessonProvenance) *v1.LessonProvenance {
	if prov == nil {
		return nil
	}
	return &v1.LessonProvenance{
		GroundingScore:   prov.GroundingScore,
		TeamTokens:       prov.TeamTokens,
		GlobalTokens:     prov.GlobalTokens,
		CourseTokens:     prov.CourseTokens,
		UngroundedTokens: prov.UngroundedTokens,
		TotalTokens:      prov.TotalTokens,
		SourceCount:      prov.SourceCount,
	}
}

func uuidsToStrings(ids []uuid.UUID) []string {
	if ids == nil {
		return nil
	}
	strs := make([]string, len(ids))
	for i, id := range ids {
		strs[i] = id.String()
	}
	return strs
}

func generationJobTypeToProto(t valueobject.GenerationJobType) v1.GenerationJobType {
	switch t {
	case valueobject.GenerationJobTypeCoursePlanning:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_PLANNING
	case valueobject.GenerationJobTypeCourseOutline:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE
	case valueobject.GenerationJobTypeLessonContent:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT
	case valueobject.GenerationJobTypeComponentRegen:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN
	case valueobject.GenerationJobTypeFullCourse:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_FULL_COURSE
	case valueobject.GenerationJobTypeCourseCreation:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_CREATION
	default:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_UNSPECIFIED
	}
}

func protoToGenerationJobType(t v1.GenerationJobType) valueobject.GenerationJobType {
	switch t {
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_PLANNING:
		return valueobject.GenerationJobTypeCoursePlanning
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE:
		return valueobject.GenerationJobTypeCourseOutline
	case v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT:
		return valueobject.GenerationJobTypeLessonContent
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN:
		return valueobject.GenerationJobTypeComponentRegen
	case v1.GenerationJobType_GENERATION_JOB_TYPE_FULL_COURSE:
		return valueobject.GenerationJobTypeFullCourse
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_CREATION:
		return valueobject.GenerationJobTypeCourseCreation
	default:
		return valueobject.GenerationJobTypeCourseOutline
	}
}

func generationJobStatusToProto(s valueobject.GenerationJobStatus) v1.GenerationJobStatus {
	switch s {
	case valueobject.GenerationJobStatusQueued:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_QUEUED
	case valueobject.GenerationJobStatusProcessing:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_PROCESSING
	case valueobject.GenerationJobStatusCompleted:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_COMPLETED
	case valueobject.GenerationJobStatusFailed:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_FAILED
	case valueobject.GenerationJobStatusCancelled:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_CANCELLED
	case valueobject.GenerationJobStatusAwaitingApproval:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_AWAITING_APPROVAL
	default:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_UNSPECIFIED
	}
}

func protoToGenerationJobStatus(s v1.GenerationJobStatus) valueobject.GenerationJobStatus {
	switch s {
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_QUEUED:
		return valueobject.GenerationJobStatusQueued
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_PROCESSING:
		return valueobject.GenerationJobStatusProcessing
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_COMPLETED:
		return valueobject.GenerationJobStatusCompleted
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_FAILED:
		return valueobject.GenerationJobStatusFailed
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_CANCELLED:
		return valueobject.GenerationJobStatusCancelled
	case v1.GenerationJobStatus_GENERATION_JOB_STATUS_AWAITING_APPROVAL:
		return valueobject.GenerationJobStatusAwaitingApproval
	default:
		return valueobject.GenerationJobStatusQueued
	}
}

func outlineApprovalStatusToProto(s valueobject.OutlineApprovalStatus) v1.OutlineApprovalStatus {
	switch s {
	case valueobject.OutlineApprovalStatusPendingReview:
		return v1.OutlineApprovalStatus_OUTLINE_APPROVAL_STATUS_PENDING_REVIEW
	case valueobject.OutlineApprovalStatusApproved:
		return v1.OutlineApprovalStatus_OUTLINE_APPROVAL_STATUS_APPROVED
	case valueobject.OutlineApprovalStatusRejected:
		return v1.OutlineApprovalStatus_OUTLINE_APPROVAL_STATUS_REJECTED
	case valueobject.OutlineApprovalStatusRevisionRequested:
		return v1.OutlineApprovalStatus_OUTLINE_APPROVAL_STATUS_REVISION_REQUESTED
	default:
		return v1.OutlineApprovalStatus_OUTLINE_APPROVAL_STATUS_UNSPECIFIED
	}
}

func lessonComponentTypeToProto(t valueobject.LessonComponentType) v1.LessonComponentType {
	switch t {
	case valueobject.LessonComponentTypeText:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_TEXT
	case valueobject.LessonComponentTypeHeading:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_HEADING
	case valueobject.LessonComponentTypeImage:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_IMAGE
	case valueobject.LessonComponentTypeQuiz:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_QUIZ
	case valueobject.LessonComponentTypeCode:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_CODE
	case valueobject.LessonComponentTypeCallout:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_CALLOUT
	case valueobject.LessonComponentTypeStatement:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_STATEMENT
	case valueobject.LessonComponentTypeQuote:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_QUOTE
	case valueobject.LessonComponentTypeList:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_LIST
	case valueobject.LessonComponentTypeGallery:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_GALLERY
	case valueobject.LessonComponentTypeMultimedia:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_MULTIMEDIA
	case valueobject.LessonComponentTypeChart:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_CHART
	case valueobject.LessonComponentTypeDivider:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_DIVIDER
	default:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_UNSPECIFIED
	}
}

func protoToLessonComponentType(t v1.LessonComponentType) valueobject.LessonComponentType {
	switch t {
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_TEXT:
		return valueobject.LessonComponentTypeText
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_HEADING:
		return valueobject.LessonComponentTypeHeading
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_IMAGE:
		return valueobject.LessonComponentTypeImage
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_QUIZ:
		return valueobject.LessonComponentTypeQuiz
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_CODE:
		return valueobject.LessonComponentTypeCode
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_CALLOUT:
		return valueobject.LessonComponentTypeCallout
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_STATEMENT:
		return valueobject.LessonComponentTypeStatement
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_QUOTE:
		return valueobject.LessonComponentTypeQuote
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_LIST:
		return valueobject.LessonComponentTypeList
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_GALLERY:
		return valueobject.LessonComponentTypeGallery
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_MULTIMEDIA:
		return valueobject.LessonComponentTypeMultimedia
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_CHART:
		return valueobject.LessonComponentTypeChart
	case v1.LessonComponentType_LESSON_COMPONENT_TYPE_DIVIDER:
		return valueobject.LessonComponentTypeDivider
	default:
		return valueobject.LessonComponentTypeText // Default to text
	}
}

// s3CoursePlanToProto converts S3CoursePlan to proto CoursePlan.
func s3CoursePlanToProto(plan *service.S3CoursePlan) *v1.CoursePlan {
	if plan == nil {
		return nil
	}

	proto := &v1.CoursePlan{
		Status:      plan.Status,
		GeneratedAt: timestamppb.New(plan.GeneratedAt),
		TokensUsed:  plan.TokensUsed,
	}

	if plan.ApprovedAt != nil {
		proto.ApprovedAt = timestamppb.New(*plan.ApprovedAt)
	}

	// Convert document analyses
	proto.DocumentAnalyses = make([]*v1.DocumentAnalysis, len(plan.DocumentAnalyses))
	for i, da := range plan.DocumentAnalyses {
		protoDA := &v1.DocumentAnalysis{
			SourceId:     da.SourceID,
			SourceName:   da.SourceName,
			Summary:      da.Summary,
			MainTopics:   da.MainTopics,
			KeyFacts:     da.KeyFacts,
			ContentDepth: da.ContentDepth,
		}
		protoDA.SectionHints = make([]*v1.SectionHint, len(da.SectionHints))
		for j, hint := range da.SectionHints {
			protoDA.SectionHints[j] = &v1.SectionHint{
				TopicName:   hint.TopicName,
				SearchTerms: hint.SearchTerms,
				KeyPoints:   hint.KeyPoints,
			}
		}
		proto.DocumentAnalyses[i] = protoDA
	}

	// Convert planned sections
	proto.PlannedSections = make([]*v1.PlannedSection, len(plan.PlannedSections))
	for i, ps := range plan.PlannedSections {
		protoPS := &v1.PlannedSection{
			Title:       ps.Title,
			Description: ps.Description,
			SearchTerms: ps.SearchTerms,
			SourceIds:   ps.SourceIDs,
			Rationale:   ps.Rationale,
		}
		protoPS.Lessons = make([]*v1.PlannedLesson, len(ps.Lessons))
		for j, pl := range ps.Lessons {
			protoPS.Lessons[j] = &v1.PlannedLesson{
				Title:         pl.Title,
				Description:   pl.Description,
				SearchTerms:   pl.SearchTerms,
				LearningGoals: pl.LearningGoals,
			}
		}
		proto.PlannedSections[i] = protoPS
	}

	return proto
}

// protoToWorkflowStepString converts a proto WorkflowStepType enum to the string used by the service layer.
func protoToWorkflowStepString(step v1.WorkflowStepType) string {
	switch step {
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_TITLE:
		return "title"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_OUTCOMES:
		return "outcomes"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_SME_PERSONAS:
		return "sme_personas"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_AUDIENCE_PERSONAS:
		return "audience_personas"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_TONE_OPTIONS:
		return "tone_options"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_COURSE_PLAN:
		return "course_plan"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_OUTLINE:
		return "outline"
	case v1.WorkflowStepType_WORKFLOW_STEP_TYPE_LESSONS:
		return "lessons"
	default:
		return ""
	}
}

// StartCourseCreation starts the unified course creation workflow (Python).
func (s *AIGenerationServiceServer) StartCourseCreation(
	ctx context.Context,
	req *connect.Request[v1.StartCourseCreationRequest],
) (*connect.Response[v1.StartCourseCreationResponse], error) {
	slog.Info("[StartCourseCreation] Request received", "courseId", req.Msg.GetCourseId())

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.GetCourseId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	var desiredOutcomes string
	if req.Msg.DesiredOutcomes != nil {
		desiredOutcomes = *req.Msg.DesiredOutcomes
	}

	var additionalContext string
	if req.Msg.AdditionalContext != nil {
		additionalContext = *req.Msg.AdditionalContext
	}

	serviceReq := service.StartCourseCreationRequest{
		CourseID:             courseID,
		CourseName:           req.Msg.GetCourseName(),
		DesiredOutcomes:      desiredOutcomes,
		AdditionalContext:    additionalContext,
		InternalDataOnly:     req.Msg.GetInternalDataOnly(),
		SelectedTeamDocIDs:   req.Msg.GetSelectedTeamDocIds(),
		SelectedGlobalDocIDs: req.Msg.GetSelectedGlobalDocIds(),
	}

	result, err := s.aiService.StartCourseCreation(ctx, kratosID, serviceReq)
	if err != nil {
		slog.Error("[StartCourseCreation] Service error", "courseId", courseID.String(), "error", err)
		return nil, toConnectError(err)
	}

	slog.Info("[StartCourseCreation] Job created",
		"jobId", result.Job.ID.String(),
		"courseId", result.Job.CourseID,
	)

	return connect.NewResponse(&v1.StartCourseCreationResponse{
		Job: generationJobToProto(result.Job),
	}), nil
}

// ApproveWorkflowStep sends an approval signal to a paused course creation workflow.
func (s *AIGenerationServiceServer) ApproveWorkflowStep(
	ctx context.Context,
	req *connect.Request[v1.ApproveWorkflowStepRequest],
) (*connect.Response[v1.ApproveWorkflowStepResponse], error) {
	slog.Info("[ApproveWorkflowStep] Request received", "jobId", req.Msg.GetJobId(), "step", req.Msg.GetStep())

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	jobID, err := parseUUID(req.Msg.GetJobId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	step := protoToWorkflowStepString(req.Msg.GetStep())
	if step == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errUnauthenticated)
	}

	err = s.aiService.ApproveWorkflowStep(ctx, kratosID, jobID, step, req.Msg.GetSelectedIds(), req.Msg.GetModifications())
	if err != nil {
		slog.Error("[ApproveWorkflowStep] Service error", "jobId", jobID.String(), "error", err)
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ApproveWorkflowStepResponse{}), nil
}

// RejectWorkflowStep sends a rejection signal to a paused course creation workflow.
func (s *AIGenerationServiceServer) RejectWorkflowStep(
	ctx context.Context,
	req *connect.Request[v1.RejectWorkflowStepRequest],
) (*connect.Response[v1.RejectWorkflowStepResponse], error) {
	slog.Info("[RejectWorkflowStep] Request received", "jobId", req.Msg.GetJobId(), "step", req.Msg.GetStep())

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	jobID, err := parseUUID(req.Msg.GetJobId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	step := protoToWorkflowStepString(req.Msg.GetStep())
	if step == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, errUnauthenticated)
	}

	err = s.aiService.RejectWorkflowStep(ctx, kratosID, jobID, step, req.Msg.GetFeedback())
	if err != nil {
		slog.Error("[RejectWorkflowStep] Service error", "jobId", jobID.String(), "error", err)
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RejectWorkflowStepResponse{}), nil
}

// GetGraphVisualization returns the mermaid diagram for the course creation graph.
func (s *AIGenerationServiceServer) GetGraphVisualization(
	ctx context.Context,
	req *connect.Request[v1.GetGraphVisualizationRequest],
) (*connect.Response[v1.GetGraphVisualizationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	if _, err := parseUUID(kratosIDStr); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	mermaidCode := `graph TD
    A[GenerateTitle] --> B{AwaitTitleApproval}
    B -->|Approved| C[GenerateOutcomes]
    B -->|Rejected| A
    C --> D{AwaitOutcomesApproval}
    D -->|Approved| E[GenerateSMEPersonas]
    D -->|Rejected| C
    E --> F{AwaitSMEApproval}
    F -->|Approved| G[GenerateAudiencePersonas]
    F -->|Rejected| E
    G --> H{AwaitAudienceApproval}
    H -->|Approved| I[GenerateToneOptions]
    H -->|Rejected| G
    I --> J{AwaitToneApproval}
    J -->|Approved| K{HasKnowledgeSources?}
    J -->|Rejected| I
    K -->|Yes| L[AnalyzeDocuments]
    K -->|No| N[GenerateOutline]
    L --> M{AwaitPlanApproval}
    M -->|Approved| N
    M -->|Rejected| L
    N --> O{AwaitOutlineApproval}
    O -->|Approved| P[GenerateLessons]
    O -->|Rejected| N
    P --> Q[FinalizeContent]
    Q --> R((End))`

	return connect.NewResponse(&v1.GetGraphVisualizationResponse{
		MermaidCode: mermaidCode,
		CurrentNode: "",
	}), nil
}
