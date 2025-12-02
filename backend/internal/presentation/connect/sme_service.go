package connect

import (
	"context"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SMEServiceServer implements the SMEService Connect handler.
type SMEServiceServer struct {
	miraiv1connect.UnimplementedSMEServiceHandler
	smeService *service.SMEService
}

// NewSMEServiceServer creates a new SMEServiceServer.
func NewSMEServiceServer(smeService *service.SMEService) *SMEServiceServer {
	return &SMEServiceServer{smeService: smeService}
}

// CreateSME creates a new subject matter expert entity.
func (s *SMEServiceServer) CreateSME(
	ctx context.Context,
	req *connect.Request[v1.CreateSMERequest],
) (*connect.Response[v1.CreateSMEResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamIDs := make([]uuid.UUID, 0, len(req.Msg.TeamIds))
	for _, id := range req.Msg.TeamIds {
		if uid, err := uuid.Parse(id); err == nil {
			teamIDs = append(teamIDs, uid)
		}
	}

	createReq := service.CreateSMERequest{
		Name:        req.Msg.Name,
		Description: req.Msg.Description,
		Domain:      req.Msg.Domain,
		Scope:       protoToSMEScope(req.Msg.Scope),
		TeamIDs:     teamIDs,
	}

	sme, err := s.smeService.CreateSME(ctx, kratosID, createReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateSMEResponse{
		Sme: smeToProto(sme),
	}), nil
}

// GetSME returns a specific SME by ID.
func (s *SMEServiceServer) GetSME(
	ctx context.Context,
	req *connect.Request[v1.GetSMERequest],
) (*connect.Response[v1.GetSMEResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	sme, err := s.smeService.GetSME(ctx, kratosID, smeID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetSMEResponse{
		Sme: smeToProto(sme),
	}), nil
}

// ListSMEs returns all SMEs accessible to the current user.
func (s *SMEServiceServer) ListSMEs(
	ctx context.Context,
	req *connect.Request[v1.ListSMEsRequest],
) (*connect.Response[v1.ListSMEsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	opts := &service.ListSMEsOptions{}
	if req.Msg.IncludeArchived != nil && *req.Msg.IncludeArchived {
		opts.IncludeArchived = true
	}

	smes, err := s.smeService.ListSMEs(ctx, kratosID, opts)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoSMEs := make([]*v1.SubjectMatterExpert, len(smes))
	for i, sme := range smes {
		protoSMEs[i] = smeToProto(sme)
	}

	return connect.NewResponse(&v1.ListSMEsResponse{
		Smes: protoSMEs,
	}), nil
}

// UpdateSME updates an SME entity.
func (s *SMEServiceServer) UpdateSME(
	ctx context.Context,
	req *connect.Request[v1.UpdateSMERequest],
) (*connect.Response[v1.UpdateSMEResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	updateReq := service.UpdateSMERequest{
		Name:        req.Msg.Name,
		Description: req.Msg.Description,
		Domain:      req.Msg.Domain,
	}

	if req.Msg.Scope != nil {
		scope := protoToSMEScope(*req.Msg.Scope)
		updateReq.Scope = &scope
	}

	sme, err := s.smeService.UpdateSME(ctx, kratosID, smeID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateSMEResponse{
		Sme: smeToProto(sme),
	}), nil
}

// DeleteSME deletes an SME entity.
func (s *SMEServiceServer) DeleteSME(
	ctx context.Context,
	req *connect.Request[v1.DeleteSMERequest],
) (*connect.Response[v1.DeleteSMEResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.smeService.DeleteSME(ctx, kratosID, smeID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteSMEResponse{}), nil
}

// RestoreSME restores an archived SME entity.
func (s *SMEServiceServer) RestoreSME(
	ctx context.Context,
	req *connect.Request[v1.RestoreSMERequest],
) (*connect.Response[v1.RestoreSMEResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	sme, err := s.smeService.RestoreSME(ctx, kratosID, smeID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RestoreSMEResponse{
		Sme: smeToProto(sme),
	}), nil
}

// CreateTask creates a delegated task for content submission.
func (s *SMEServiceServer) CreateTask(
	ctx context.Context,
	req *connect.Request[v1.CreateTaskRequest],
) (*connect.Response[v1.CreateTaskResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	assignedToUserID, err := parseUUID(req.Msg.AssignedToUserId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	var teamID *uuid.UUID
	if req.Msg.TeamId != nil {
		if id, err := uuid.Parse(*req.Msg.TeamId); err == nil {
			teamID = &id
		}
	}

	var dueDate *time.Time
	if req.Msg.DueDate != nil {
		t := req.Msg.DueDate.AsTime()
		dueDate = &t
	}

	var expectedContentType *valueobject.ContentType
	if req.Msg.ExpectedContentType != v1.ContentType_CONTENT_TYPE_UNSPECIFIED {
		ct := protoToContentType(req.Msg.ExpectedContentType)
		expectedContentType = &ct
	}

	createReq := service.CreateTaskRequest{
		SMEID:               smeID,
		Title:               req.Msg.Title,
		Description:         req.Msg.Description,
		ExpectedContentType: expectedContentType,
		DueDate:             dueDate,
		AssignedToUserID:    assignedToUserID,
		TeamID:              teamID,
	}

	task, err := s.smeService.CreateTask(ctx, kratosID, createReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateTaskResponse{
		Task: taskToProto(task),
	}), nil
}

// GetTask returns a specific task by ID.
func (s *SMEServiceServer) GetTask(
	ctx context.Context,
	req *connect.Request[v1.GetTaskRequest],
) (*connect.Response[v1.GetTaskResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	task, err := s.smeService.GetTask(ctx, kratosID, taskID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetTaskResponse{
		Task: taskToProto(task),
	}), nil
}

// ListTasks returns tasks based on filters.
func (s *SMEServiceServer) ListTasks(
	ctx context.Context,
	req *connect.Request[v1.ListTasksRequest],
) (*connect.Response[v1.ListTasksResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	var smeID *uuid.UUID
	if req.Msg.SmeId != nil {
		if id, err := uuid.Parse(*req.Msg.SmeId); err == nil {
			smeID = &id
		}
	}

	var assignedToUserID *uuid.UUID
	if req.Msg.AssignedToUserId != nil {
		if id, err := uuid.Parse(*req.Msg.AssignedToUserId); err == nil {
			assignedToUserID = &id
		}
	}

	tasks, err := s.smeService.ListTasks(ctx, kratosID, smeID, assignedToUserID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoTasks := make([]*v1.SMETask, len(tasks))
	for i, task := range tasks {
		protoTasks[i] = taskToProto(task)
	}

	return connect.NewResponse(&v1.ListTasksResponse{
		Tasks: protoTasks,
	}), nil
}

// UpdateTask updates a task.
func (s *SMEServiceServer) UpdateTask(
	ctx context.Context,
	req *connect.Request[v1.UpdateTaskRequest],
) (*connect.Response[v1.UpdateTaskResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	var dueDate *time.Time
	if req.Msg.DueDate != nil {
		t := req.Msg.DueDate.AsTime()
		dueDate = &t
	}

	var expectedContentType *valueobject.ContentType
	if req.Msg.ExpectedContentType != nil && *req.Msg.ExpectedContentType != v1.ContentType_CONTENT_TYPE_UNSPECIFIED {
		ct := protoToContentType(*req.Msg.ExpectedContentType)
		expectedContentType = &ct
	}

	updateReq := service.UpdateTaskRequest{
		Title:               req.Msg.Title,
		Description:         req.Msg.Description,
		ExpectedContentType: expectedContentType,
		DueDate:             dueDate,
	}

	task, err := s.smeService.UpdateTask(ctx, kratosID, taskID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateTaskResponse{
		Task: taskToProto(task),
	}), nil
}

// CancelTask cancels a pending task.
func (s *SMEServiceServer) CancelTask(
	ctx context.Context,
	req *connect.Request[v1.CancelTaskRequest],
) (*connect.Response[v1.CancelTaskResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.smeService.CancelTask(ctx, kratosID, taskID); err != nil {
		return nil, toConnectError(err)
	}

	// Fetch the updated task to return
	task, err := s.smeService.GetTask(ctx, kratosID, taskID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CancelTaskResponse{
		Task: taskToProto(task),
	}), nil
}

// GetUploadURL returns a presigned URL for content upload.
func (s *SMEServiceServer) GetUploadURL(
	ctx context.Context,
	req *connect.Request[v1.GetUploadURLRequest],
) (*connect.Response[v1.GetUploadURLResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	contentType := protoToContentType(req.Msg.ContentType)
	url, path, err := s.smeService.GetUploadURL(ctx, kratosID, taskID, req.Msg.FileName, contentType)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetUploadURLResponse{
		UploadUrl: url,
		FilePath:  path,
	}), nil
}

// SubmitContent records a content submission for a task.
func (s *SMEServiceServer) SubmitContent(
	ctx context.Context,
	req *connect.Request[v1.SubmitContentRequest],
) (*connect.Response[v1.SubmitContentResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	submitReq := service.SubmitContentRequest{
		TaskID:        taskID,
		FileName:      req.Msg.FileName,
		FilePath:      req.Msg.FilePath,
		ContentType:   protoToContentType(req.Msg.ContentType),
		FileSizeBytes: req.Msg.FileSizeBytes,
		TextContent:   req.Msg.TextContent,
	}

	submission, err := s.smeService.SubmitContent(ctx, kratosID, submitReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.SubmitContentResponse{
		Submission: submissionToProto(submission),
	}), nil
}

// ListSubmissions returns all submissions for a task.
func (s *SMEServiceServer) ListSubmissions(
	ctx context.Context,
	req *connect.Request[v1.ListSubmissionsRequest],
) (*connect.Response[v1.ListSubmissionsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	submissions, err := s.smeService.ListSubmissions(ctx, kratosID, taskID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoSubmissions := make([]*v1.SMETaskSubmission, len(submissions))
	for i, sub := range submissions {
		protoSubmissions[i] = submissionToProto(sub)
	}

	return connect.NewResponse(&v1.ListSubmissionsResponse{
		Submissions: protoSubmissions,
	}), nil
}

// GetKnowledge returns distilled knowledge for an SME.
func (s *SMEServiceServer) GetKnowledge(
	ctx context.Context,
	req *connect.Request[v1.GetKnowledgeRequest],
) (*connect.Response[v1.GetKnowledgeResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	smeID, err := parseUUID(req.Msg.SmeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	chunks, err := s.smeService.GetKnowledge(ctx, kratosID, smeID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoChunks := make([]*v1.SMEKnowledgeChunk, len(chunks))
	for i, chunk := range chunks {
		protoChunks[i] = knowledgeChunkToProto(chunk)
	}

	return connect.NewResponse(&v1.GetKnowledgeResponse{
		Chunks: protoChunks,
	}), nil
}

// SearchKnowledge searches across SME knowledge.
func (s *SMEServiceServer) SearchKnowledge(
	ctx context.Context,
	req *connect.Request[v1.SearchKnowledgeRequest],
) (*connect.Response[v1.SearchKnowledgeResponse], error) {
	// TODO: Implement semantic search when needed
	return nil, connect.NewError(connect.CodeUnimplemented, errUnauthenticated)
}

// GetSubmission returns a specific submission by ID.
func (s *SMEServiceServer) GetSubmission(
	ctx context.Context,
	req *connect.Request[v1.GetSubmissionRequest],
) (*connect.Response[v1.GetSubmissionResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	submissionID, err := parseUUID(req.Msg.SubmissionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	submission, err := s.smeService.GetSubmission(ctx, kratosID, submissionID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetSubmissionResponse{
		Submission: submissionToProto(submission),
	}), nil
}

// ApproveSubmission approves content and creates knowledge chunks.
func (s *SMEServiceServer) ApproveSubmission(
	ctx context.Context,
	req *connect.Request[v1.ApproveSubmissionRequest],
) (*connect.Response[v1.ApproveSubmissionResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	submissionID, err := parseUUID(req.Msg.SubmissionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	approveReq := service.ApproveSubmissionRequest{
		SubmissionID:    submissionID,
		ApprovedContent: req.Msg.ApprovedContent,
	}

	submission, chunks, err := s.smeService.ApproveSubmission(ctx, kratosID, approveReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoChunks := make([]*v1.SMEKnowledgeChunk, len(chunks))
	for i, chunk := range chunks {
		protoChunks[i] = knowledgeChunkToProto(chunk)
	}

	return connect.NewResponse(&v1.ApproveSubmissionResponse{
		Submission:    submissionToProto(submission),
		CreatedChunks: protoChunks,
	}), nil
}

// RequestSubmissionChanges sends submission back to submitter with feedback.
func (s *SMEServiceServer) RequestSubmissionChanges(
	ctx context.Context,
	req *connect.Request[v1.RequestSubmissionChangesRequest],
) (*connect.Response[v1.RequestSubmissionChangesResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	submissionID, err := parseUUID(req.Msg.SubmissionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	changesReq := service.RequestSubmissionChangesRequest{
		SubmissionID: submissionID,
		Feedback:     req.Msg.Feedback,
	}

	submission, err := s.smeService.RequestSubmissionChanges(ctx, kratosID, changesReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.RequestSubmissionChangesResponse{
		Submission: submissionToProto(submission),
	}), nil
}

// EnhanceSubmissionContent uses AI to summarize or improve text content.
func (s *SMEServiceServer) EnhanceSubmissionContent(
	ctx context.Context,
	req *connect.Request[v1.EnhanceSubmissionContentRequest],
) (*connect.Response[v1.EnhanceSubmissionContentResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	submissionID, err := parseUUID(req.Msg.SubmissionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	enhanceReq := service.EnhanceSubmissionContentRequest{
		SubmissionID: submissionID,
		EnhanceType:  protoToEnhanceType(req.Msg.EnhanceType),
	}

	result, err := s.smeService.EnhanceSubmissionContent(ctx, kratosID, enhanceReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.EnhanceSubmissionContentResponse{
		EnhancedContent: result.EnhancedContent,
		OriginalContent: result.OriginalContent,
	}), nil
}

// UpdateKnowledgeChunk updates a knowledge chunk's content.
func (s *SMEServiceServer) UpdateKnowledgeChunk(
	ctx context.Context,
	req *connect.Request[v1.UpdateKnowledgeChunkRequest],
) (*connect.Response[v1.UpdateKnowledgeChunkResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	chunkID, err := parseUUID(req.Msg.ChunkId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	updateReq := service.UpdateKnowledgeChunkRequest{
		ChunkID:  chunkID,
		Content:  req.Msg.Content,
		Topic:    req.Msg.Topic,
		Keywords: req.Msg.Keywords,
	}

	chunk, err := s.smeService.UpdateKnowledgeChunk(ctx, kratosID, updateReq)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateKnowledgeChunkResponse{
		Chunk: knowledgeChunkToProto(chunk),
	}), nil
}

// DeleteKnowledgeChunk removes a knowledge chunk.
func (s *SMEServiceServer) DeleteKnowledgeChunk(
	ctx context.Context,
	req *connect.Request[v1.DeleteKnowledgeChunkRequest],
) (*connect.Response[v1.DeleteKnowledgeChunkResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	chunkID, err := parseUUID(req.Msg.ChunkId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.smeService.DeleteKnowledgeChunk(ctx, kratosID, chunkID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteKnowledgeChunkResponse{}), nil
}

// DeleteTask permanently removes a task.
func (s *SMEServiceServer) DeleteTask(
	ctx context.Context,
	req *connect.Request[v1.DeleteTaskRequest],
) (*connect.Response[v1.DeleteTaskResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	taskID, err := parseUUID(req.Msg.TaskId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.smeService.DeleteTask(ctx, kratosID, taskID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteTaskResponse{}), nil
}

// Helper functions for proto conversion

func smeToProto(sme *entity.SubjectMatterExpert) *v1.SubjectMatterExpert {
	if sme == nil {
		return nil
	}

	teamIDs := make([]string, len(sme.TeamIDs))
	for i, id := range sme.TeamIDs {
		teamIDs[i] = id.String()
	}

	var knowledgeSummary, knowledgeContentPath *string
	if sme.KnowledgeSummary != nil {
		knowledgeSummary = sme.KnowledgeSummary
	}
	if sme.KnowledgeContentPath != nil {
		knowledgeContentPath = sme.KnowledgeContentPath
	}

	return &v1.SubjectMatterExpert{
		Id:                   sme.ID.String(),
		TenantId:             sme.TenantID.String(),
		CompanyId:            sme.CompanyID.String(),
		Name:                 sme.Name,
		Description:          sme.Description,
		Domain:               sme.Domain,
		Scope:                smeStatusToProtoScope(sme.Scope),
		TeamIds:              teamIDs,
		Status:               smeStatusToProto(sme.Status),
		KnowledgeSummary:     knowledgeSummary,
		KnowledgeContentPath: knowledgeContentPath,
		CreatedByUserId:      sme.CreatedByUserID.String(),
		CreatedAt:            timestamppb.New(sme.CreatedAt),
		UpdatedAt:            timestamppb.New(sme.UpdatedAt),
	}
}

func taskToProto(task *entity.SMETask) *v1.SMETask {
	if task == nil {
		return nil
	}

	var dueDate, completedAt *timestamppb.Timestamp
	if task.DueDate != nil {
		dueDate = timestamppb.New(*task.DueDate)
	}
	if task.CompletedAt != nil {
		completedAt = timestamppb.New(*task.CompletedAt)
	}

	var teamID *string
	if task.TeamID != nil {
		s := task.TeamID.String()
		teamID = &s
	}

	var expectedContentType v1.ContentType
	if task.ExpectedContentType != nil {
		expectedContentType = contentTypeToProto(*task.ExpectedContentType)
	}

	return &v1.SMETask{
		Id:                  task.ID.String(),
		TenantId:            task.TenantID.String(),
		SmeId:               task.SMEID.String(),
		Title:               task.Title,
		Description:         task.Description,
		ExpectedContentType: expectedContentType,
		AssignedToUserId:    task.AssignedToUserID.String(),
		AssignedByUserId:    task.AssignedByUserID.String(),
		TeamId:              teamID,
		Status:              taskStatusToProto(task.Status),
		DueDate:             dueDate,
		CreatedAt:           timestamppb.New(task.CreatedAt),
		UpdatedAt:           timestamppb.New(task.UpdatedAt),
		CompletedAt:         completedAt,
	}
}

func submissionToProto(sub *entity.SMETaskSubmission) *v1.SMETaskSubmission {
	if sub == nil {
		return nil
	}

	var processedAt, approvedAt *timestamppb.Timestamp
	if sub.ProcessedAt != nil {
		processedAt = timestamppb.New(*sub.ProcessedAt)
	}
	if sub.ApprovedAt != nil {
		approvedAt = timestamppb.New(*sub.ApprovedAt)
	}

	var approvedByUserID *string
	if sub.ApprovedByUserID != nil {
		s := sub.ApprovedByUserID.String()
		approvedByUserID = &s
	}

	return &v1.SMETaskSubmission{
		Id:                sub.ID.String(),
		TenantId:          sub.TenantID.String(),
		TaskId:            sub.TaskID.String(),
		FileName:          sub.FileName,
		FilePath:          sub.FilePath,
		ContentType:       contentTypeToProto(sub.ContentType),
		FileSizeBytes:     sub.FileSizeBytes,
		ExtractedText:     sub.ExtractedText,
		AiSummary:         sub.AISummary,
		IngestionError:    sub.IngestionError,
		SubmittedByUserId: sub.SubmittedByUserID.String(),
		SubmittedAt:       timestamppb.New(sub.SubmittedAt),
		ProcessedAt:       processedAt,
		ReviewerNotes:     sub.ReviewerNotes,
		ApprovedContent:   sub.ApprovedContent,
		IsApproved:        sub.IsApproved,
		ApprovedAt:        approvedAt,
		ApprovedByUserId:  approvedByUserID,
	}
}

func knowledgeChunkToProto(chunk *entity.SMEKnowledgeChunk) *v1.SMEKnowledgeChunk {
	if chunk == nil {
		return nil
	}

	var submissionID *string
	if chunk.SubmissionID != nil {
		s := chunk.SubmissionID.String()
		submissionID = &s
	}

	return &v1.SMEKnowledgeChunk{
		Id:             chunk.ID.String(),
		SmeId:          chunk.SMEID.String(),
		SubmissionId:   submissionID,
		Content:        chunk.Content,
		Topic:          chunk.Topic,
		Keywords:       chunk.Keywords,
		RelevanceScore: chunk.RelevanceScore,
		CreatedAt:      timestamppb.New(chunk.CreatedAt),
	}
}

func smeStatusToProtoScope(scope valueobject.SMEScope) v1.SMEScope {
	switch scope {
	case valueobject.SMEScopeGlobal:
		return v1.SMEScope_SME_SCOPE_GLOBAL
	case valueobject.SMEScopeTeam:
		return v1.SMEScope_SME_SCOPE_TEAM
	default:
		return v1.SMEScope_SME_SCOPE_UNSPECIFIED
	}
}

func protoToSMEScope(scope v1.SMEScope) valueobject.SMEScope {
	switch scope {
	case v1.SMEScope_SME_SCOPE_GLOBAL:
		return valueobject.SMEScopeGlobal
	case v1.SMEScope_SME_SCOPE_TEAM:
		return valueobject.SMEScopeTeam
	default:
		return valueobject.SMEScopeGlobal
	}
}

func smeStatusToProto(status valueobject.SMEStatus) v1.SMEStatus {
	switch status {
	case valueobject.SMEStatusDraft:
		return v1.SMEStatus_SME_STATUS_DRAFT
	case valueobject.SMEStatusIngesting:
		return v1.SMEStatus_SME_STATUS_INGESTING
	case valueobject.SMEStatusActive:
		return v1.SMEStatus_SME_STATUS_ACTIVE
	case valueobject.SMEStatusArchived:
		return v1.SMEStatus_SME_STATUS_ARCHIVED
	default:
		return v1.SMEStatus_SME_STATUS_UNSPECIFIED
	}
}

func taskStatusToProto(status valueobject.SMETaskStatus) v1.SMETaskStatus {
	switch status {
	case valueobject.SMETaskStatusPending:
		return v1.SMETaskStatus_SME_TASK_STATUS_PENDING
	case valueobject.SMETaskStatusSubmitted:
		return v1.SMETaskStatus_SME_TASK_STATUS_SUBMITTED
	case valueobject.SMETaskStatusProcessing:
		return v1.SMETaskStatus_SME_TASK_STATUS_PROCESSING
	case valueobject.SMETaskStatusCompleted:
		return v1.SMETaskStatus_SME_TASK_STATUS_COMPLETED
	case valueobject.SMETaskStatusFailed:
		return v1.SMETaskStatus_SME_TASK_STATUS_FAILED
	case valueobject.SMETaskStatusCancelled:
		return v1.SMETaskStatus_SME_TASK_STATUS_CANCELLED
	case valueobject.SMETaskStatusAwaitingReview:
		return v1.SMETaskStatus_SME_TASK_STATUS_AWAITING_REVIEW
	case valueobject.SMETaskStatusChangesRequested:
		return v1.SMETaskStatus_SME_TASK_STATUS_CHANGES_REQUESTED
	default:
		return v1.SMETaskStatus_SME_TASK_STATUS_UNSPECIFIED
	}
}

func contentTypeToProto(ct valueobject.ContentType) v1.ContentType {
	switch ct {
	case valueobject.ContentTypeDocument:
		return v1.ContentType_CONTENT_TYPE_DOCUMENT
	case valueobject.ContentTypeImage:
		return v1.ContentType_CONTENT_TYPE_IMAGE
	case valueobject.ContentTypeVideo:
		return v1.ContentType_CONTENT_TYPE_VIDEO
	case valueobject.ContentTypeAudio:
		return v1.ContentType_CONTENT_TYPE_AUDIO
	case valueobject.ContentTypeURL:
		return v1.ContentType_CONTENT_TYPE_URL
	case valueobject.ContentTypeText:
		return v1.ContentType_CONTENT_TYPE_TEXT
	default:
		return v1.ContentType_CONTENT_TYPE_UNSPECIFIED
	}
}

func protoToContentType(ct v1.ContentType) valueobject.ContentType {
	switch ct {
	case v1.ContentType_CONTENT_TYPE_DOCUMENT:
		return valueobject.ContentTypeDocument
	case v1.ContentType_CONTENT_TYPE_IMAGE:
		return valueobject.ContentTypeImage
	case v1.ContentType_CONTENT_TYPE_VIDEO:
		return valueobject.ContentTypeVideo
	case v1.ContentType_CONTENT_TYPE_AUDIO:
		return valueobject.ContentTypeAudio
	case v1.ContentType_CONTENT_TYPE_URL:
		return valueobject.ContentTypeURL
	case v1.ContentType_CONTENT_TYPE_TEXT:
		return valueobject.ContentTypeText
	default:
		return valueobject.ContentTypeDocument
	}
}

func protoToEnhanceType(et v1.EnhanceType) valueobject.EnhanceType {
	switch et {
	case v1.EnhanceType_ENHANCE_TYPE_SUMMARIZE:
		return valueobject.EnhanceTypeSummarize
	case v1.EnhanceType_ENHANCE_TYPE_IMPROVE:
		return valueobject.EnhanceTypeImprove
	default:
		return valueobject.EnhanceTypeSummarize
	}
}
