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
)

// KnowledgeGapServiceServer implements the KnowledgeGapService Connect handler.
type KnowledgeGapServiceServer struct {
	miraiv1connect.UnimplementedKnowledgeGapServiceHandler
	gapService *service.KnowledgeGapService
}

// NewKnowledgeGapServiceServer creates a new KnowledgeGapServiceServer.
func NewKnowledgeGapServiceServer(gapService *service.KnowledgeGapService) *KnowledgeGapServiceServer {
	return &KnowledgeGapServiceServer{gapService: gapService}
}

// CreateGapTasks creates gap tasks in bulk from Step 1 analysis gaps.
func (s *KnowledgeGapServiceServer) CreateGapTasks(
	ctx context.Context,
	req *connect.Request[v1.CreateGapTasksRequest],
) (*connect.Response[v1.CreateGapTasksResponse], error) {
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

	targetTeamID, err := parseUUID(req.Msg.TargetTeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	inputs := make([]service.CreateGapTaskInput, len(req.Msg.Tasks))
	for i, t := range req.Msg.Tasks {
		assigneeID, err := parseUUID(t.AssignedToUserId)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		inputs[i] = service.CreateGapTaskInput{
			GapDescription:   t.GapDescription,
			AssignedToUserID: assigneeID,
		}
	}

	tasks, err := s.gapService.CreateGapTasks(ctx, kratosID, courseID, targetTeamID, inputs)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoTasks := make([]*v1.KnowledgeGapTask, len(tasks))
	for i, t := range tasks {
		protoTasks[i] = gapTaskToProto(t)
	}

	return connect.NewResponse(&v1.CreateGapTasksResponse{Tasks: protoTasks}), nil
}

// ListGapTasksForUser returns gap tasks assigned to the current user.
func (s *KnowledgeGapServiceServer) ListGapTasksForUser(
	ctx context.Context,
	req *connect.Request[v1.ListGapTasksForUserRequest],
) (*connect.Response[v1.ListGapTasksForUserResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	var status *string
	if req.Msg.Status != nil {
		s := gapTaskStatusToString(*req.Msg.Status)
		status = &s
	}

	tasks, err := s.gapService.ListForUser(ctx, kratosID, status)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoTasks := make([]*v1.KnowledgeGapTask, len(tasks))
	for i, t := range tasks {
		protoTasks[i] = gapTaskToProto(t)
	}

	return connect.NewResponse(&v1.ListGapTasksForUserResponse{Tasks: protoTasks}), nil
}

// ListGapTasksForCourse returns gap tasks for a specific course.
func (s *KnowledgeGapServiceServer) ListGapTasksForCourse(
	ctx context.Context,
	req *connect.Request[v1.ListGapTasksForCourseRequest],
) (*connect.Response[v1.ListGapTasksForCourseResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}
	if _, err := parseUUID(kratosIDStr); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	tasks, err := s.gapService.ListForCourse(ctx, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoTasks := make([]*v1.KnowledgeGapTask, len(tasks))
	for i, t := range tasks {
		protoTasks[i] = gapTaskToProto(t)
	}

	return connect.NewResponse(&v1.ListGapTasksForCourseResponse{Tasks: protoTasks}), nil
}

// CompleteGapTask marks a gap task as completed after knowledge upload.
func (s *KnowledgeGapServiceServer) CompleteGapTask(
	ctx context.Context,
	req *connect.Request[v1.CompleteGapTaskRequest],
) (*connect.Response[v1.CompleteGapTaskResponse], error) {
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

	var knowledgeSourceID *uuid.UUID
	if req.Msg.KnowledgeSourceId != nil {
		id, err := parseUUID(*req.Msg.KnowledgeSourceId)
		if err != nil {
			return nil, connect.NewError(connect.CodeInvalidArgument, err)
		}
		knowledgeSourceID = &id
	}

	var completionNotes *string
	if req.Msg.CompletionNotes != nil {
		completionNotes = req.Msg.CompletionNotes
	}

	task, err := s.gapService.CompleteTask(ctx, kratosID, taskID, knowledgeSourceID, completionNotes)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CompleteGapTaskResponse{Task: gapTaskToProto(task)}), nil
}

// =============================================================================
// Proto Conversion Helpers
// =============================================================================

func gapTaskToProto(t *entity.KnowledgeGapTask) *v1.KnowledgeGapTask {
	if t == nil {
		return nil
	}

	proto := &v1.KnowledgeGapTask{
		Id:               t.ID.String(),
		CourseId:         t.CourseID.String(),
		GapDescription:   t.GapDescription,
		AssignedToUserId: t.AssignedToUserID.String(),
		AssignedByUserId: t.AssignedByUserID.String(),
		Status:           gapTaskStatusToProto(t.Status),
		CreatedAt:        timestamppb.New(t.CreatedAt),
	}

	if t.TargetTeamID != nil {
		proto.TargetTeamId = t.TargetTeamID.String()
	}
	if t.KnowledgeSourceID != nil {
		s := t.KnowledgeSourceID.String()
		proto.KnowledgeSourceId = &s
	}
	if t.AssignedToName != "" {
		proto.AssignedToName = &t.AssignedToName
	}
	if t.AssignedToEmail != "" {
		proto.AssignedToEmail = &t.AssignedToEmail
	}
	if t.CompletedAt != nil {
		proto.CompletedAt = timestamppb.New(*t.CompletedAt)
	}
	if t.CourseTitle != "" {
		proto.CourseTitle = &t.CourseTitle
	}
	if t.AssignedByName != "" {
		proto.AssignedByName = &t.AssignedByName
	}
	if t.TargetTeamName != "" {
		proto.TargetTeamName = &t.TargetTeamName
	}
	if t.CompletionNotes != nil {
		proto.CompletionNotes = t.CompletionNotes
	}

	return proto
}

func gapTaskStatusToProto(status string) v1.KnowledgeGapTaskStatus {
	switch status {
	case "pending":
		return v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_PENDING
	case "in_progress":
		return v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_IN_PROGRESS
	case "completed":
		return v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_COMPLETED
	default:
		return v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_UNSPECIFIED
	}
}

func gapTaskStatusToString(status v1.KnowledgeGapTaskStatus) string {
	switch status {
	case v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_PENDING:
		return "pending"
	case v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_IN_PROGRESS:
		return "in_progress"
	case v1.KnowledgeGapTaskStatus_KNOWLEDGE_GAP_TASK_STATUS_COMPLETED:
		return "completed"
	default:
		return ""
	}
}
