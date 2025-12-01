package connect

import (
	"context"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// AIGenerationServiceServer implements the AIGenerationService Connect handler.
type AIGenerationServiceServer struct {
	miraiv1connect.UnimplementedAIGenerationServiceHandler
	aiService *service.AIGenerationService
}

// NewAIGenerationServiceServer creates a new AIGenerationServiceServer.
func NewAIGenerationServiceServer(aiService *service.AIGenerationService) *AIGenerationServiceServer {
	return &AIGenerationServiceServer{aiService: aiService}
}

// GenerateCourseOutline starts outline generation job.
func (s *AIGenerationServiceServer) GenerateCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.GenerateCourseOutlineRequest],
) (*connect.Response[v1.GenerateCourseOutlineResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	input := req.Msg.Input
	if input == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errUnauthenticated)
	}

	courseID, err := parseUUID(input.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	smeIDs := make([]uuid.UUID, 0, len(input.SmeIds))
	for _, id := range input.SmeIds {
		if uid, err := uuid.Parse(id); err == nil {
			smeIDs = append(smeIDs, uid)
		}
	}

	targetAudienceIDs := make([]uuid.UUID, 0, len(input.TargetAudienceIds))
	for _, id := range input.TargetAudienceIds {
		if uid, err := uuid.Parse(id); err == nil {
			targetAudienceIDs = append(targetAudienceIDs, uid)
		}
	}

	var additionalContext string
	if input.AdditionalContext != nil {
		additionalContext = *input.AdditionalContext
	}

	serviceReq := service.GenerateCourseOutlineRequest{
		CourseID:          courseID,
		SMEIDs:            smeIDs,
		TargetAudienceIDs: targetAudienceIDs,
		DesiredOutcome:    input.DesiredOutcome,
		AdditionalContext: additionalContext,
	}

	result, err := s.aiService.GenerateCourseOutline(ctx, kratosID, serviceReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateCourseOutlineResponse{
		Job: generationJobToProto(result.Job),
	}), nil
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

	return connect.NewResponse(&v1.GetCourseOutlineResponse{
		Outline: courseOutlineToProto(outline),
	}), nil
}

// ApproveCourseOutline approves an outline for content generation.
func (s *AIGenerationServiceServer) ApproveCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.ApproveCourseOutlineRequest],
) (*connect.Response[v1.ApproveCourseOutlineResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	outlineID, err := parseUUID(req.Msg.OutlineId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	outline, err := s.aiService.ApproveCourseOutline(ctx, kratosID, outlineID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.ApproveCourseOutlineResponse{
		Outline: courseOutlineToProto(outline),
	}), nil
}

// RejectCourseOutline rejects an outline with feedback.
func (s *AIGenerationServiceServer) RejectCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.RejectCourseOutlineRequest],
) (*connect.Response[v1.RejectCourseOutlineResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	outlineID, err := parseUUID(req.Msg.OutlineId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	outline, err := s.aiService.RejectCourseOutline(ctx, kratosID, outlineID, req.Msg.Reason)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RejectCourseOutlineResponse{
		Outline: courseOutlineToProto(outline),
	}), nil
}

// UpdateCourseOutline allows editing the outline before approval.
func (s *AIGenerationServiceServer) UpdateCourseOutline(
	ctx context.Context,
	req *connect.Request[v1.UpdateCourseOutlineRequest],
) (*connect.Response[v1.UpdateCourseOutlineResponse], error) {
	// TODO: Implement when needed
	return nil, connect.NewError(connect.CodeUnimplemented, errUnauthenticated)
}

// GenerateLessonContent generates content for a specific lesson.
func (s *AIGenerationServiceServer) GenerateLessonContent(
	ctx context.Context,
	req *connect.Request[v1.GenerateLessonContentRequest],
) (*connect.Response[v1.GenerateLessonContentResponse], error) {
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

	outlineLessonID, err := parseUUID(req.Msg.OutlineLessonId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	serviceReq := service.GenerateLessonContentRequest{
		CourseID:        courseID,
		OutlineLessonID: outlineLessonID,
	}

	result, err := s.aiService.GenerateLessonContent(ctx, kratosID, serviceReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GenerateLessonContentResponse{
		Job: generationJobToProto(result.Job),
	}), nil
}

// GenerateAllLessons generates content for all lessons in outline.
func (s *AIGenerationServiceServer) GenerateAllLessons(
	ctx context.Context,
	req *connect.Request[v1.GenerateAllLessonsRequest],
) (*connect.Response[v1.GenerateAllLessonsResponse], error) {
	// TODO: Implement batch lesson generation
	return nil, connect.NewError(connect.CodeUnimplemented, errUnauthenticated)
}

// RegenerateComponent regenerates a single component with modifications.
func (s *AIGenerationServiceServer) RegenerateComponent(
	ctx context.Context,
	req *connect.Request[v1.RegenerateComponentRequest],
) (*connect.Response[v1.RegenerateComponentResponse], error) {
	// TODO: Implement component regeneration
	return nil, connect.NewError(connect.CodeUnimplemented, errUnauthenticated)
}

// GetJob returns a generation job by ID.
func (s *AIGenerationServiceServer) GetJob(
	ctx context.Context,
	req *connect.Request[v1.GetJobRequest],
) (*connect.Response[v1.GetJobResponse], error) {
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

	job, err := s.aiService.GetJob(ctx, kratosID, jobID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetJobResponse{
		Job: generationJobToProto(job),
	}), nil
}

// ListJobs returns generation jobs for the current user.
func (s *AIGenerationServiceServer) ListJobs(
	ctx context.Context,
	req *connect.Request[v1.ListJobsRequest],
) (*connect.Response[v1.ListJobsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
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
		}
	}

	jobs, err := s.aiService.ListJobs(ctx, kratosID, opts)
	if err != nil {
		return nil, toConnectError(err)
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
	if job.SMETaskID != nil {
		s := job.SMETaskID.String()
		proto.SmeTaskId = &s
	}
	if job.SubmissionID != nil {
		s := job.SubmissionID.String()
		proto.SubmissionId = &s
	}
	if job.StartedAt != nil {
		proto.StartedAt = timestamppb.New(*job.StartedAt)
	}
	if job.CompletedAt != nil {
		proto.CompletedAt = timestamppb.New(*job.CompletedAt)
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
		Id:          section.ID.String(),
		Title:       section.Title,
		Description: section.Description,
		Order:       section.Position,
	}

	proto.Lessons = make([]*v1.OutlineLesson, len(section.Lessons))
	for i := range section.Lessons {
		proto.Lessons[i] = outlineLessonToProto(&section.Lessons[i])
	}

	return proto
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

func generatedLessonToProto(lesson *entity.GeneratedLesson) *v1.GeneratedLesson {
	if lesson == nil {
		return nil
	}

	proto := &v1.GeneratedLesson{
		Id:              lesson.ID.String(),
		CourseId:        lesson.CourseID.String(),
		SectionId:       lesson.SectionID.String(),
		OutlineLessonId: lesson.OutlineLessonID.String(),
		Title:           lesson.Title,
		SegueText:       lesson.SegueText,
		GeneratedAt:     timestamppb.New(lesson.GeneratedAt),
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
			SmeChunkIds:          uuidsToStrings(comp.SMEChunkIDs),
			LearningObjectiveIds: comp.LearningObjectiveIDs,
		}
	}

	return proto
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
	case valueobject.GenerationJobTypeSMEIngestion:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_SME_INGESTION
	case valueobject.GenerationJobTypeCourseOutline:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE
	case valueobject.GenerationJobTypeLessonContent:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT
	case valueobject.GenerationJobTypeComponentRegen:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN
	default:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_UNSPECIFIED
	}
}

func protoToGenerationJobType(t v1.GenerationJobType) valueobject.GenerationJobType {
	switch t {
	case v1.GenerationJobType_GENERATION_JOB_TYPE_SME_INGESTION:
		return valueobject.GenerationJobTypeSMEIngestion
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE:
		return valueobject.GenerationJobTypeCourseOutline
	case v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT:
		return valueobject.GenerationJobTypeLessonContent
	case v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN:
		return valueobject.GenerationJobTypeComponentRegen
	default:
		return valueobject.GenerationJobTypeSMEIngestion
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
	default:
		return v1.LessonComponentType_LESSON_COMPONENT_TYPE_UNSPECIFIED
	}
}
