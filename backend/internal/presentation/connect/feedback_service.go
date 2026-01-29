package connect

import (
	"context"

	"connectrpc.com/connect"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/worker"
	infraworker "github.com/sogos/mirai-backend/internal/infrastructure/worker"
)

// FeedbackServiceServer implements the FeedbackService Connect handler.
type FeedbackServiceServer struct {
	miraiv1connect.UnimplementedFeedbackServiceHandler
	userService  *service.UserService
	workerClient *infraworker.Client
}

// NewFeedbackServiceServer creates a new FeedbackServiceServer.
func NewFeedbackServiceServer(
	userService *service.UserService,
	workerClient *infraworker.Client,
) *FeedbackServiceServer {
	return &FeedbackServiceServer{
		userService:  userService,
		workerClient: workerClient,
	}
}

// SubmitFeedback queues feedback for async sync to CRM.
func (s *FeedbackServiceServer) SubmitFeedback(
	ctx context.Context,
	req *connect.Request[v1.SubmitFeedbackRequest],
) (*connect.Response[v1.SubmitFeedbackResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Get user info for the feedback payload
	userResult, err := s.userService.GetCurrentUser(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Build user name from identity
	userName := ""
	if userResult.User.FirstName != "" {
		userName = userResult.User.FirstName
		if userResult.User.LastName != "" {
			userName += " " + userResult.User.LastName
		}
	}

	// Map proto feedback type to string
	feedbackType := feedbackTypeToString(req.Msg.Type)

	// Enqueue feedback sync job
	payload := worker.FeedbackSyncPayload{
		UserID:       userResult.User.ID.String(),
		UserEmail:    userResult.User.Email,
		UserName:     userName,
		FeedbackType: feedbackType,
		Message:      req.Msg.Message,
		PageURL:      req.Msg.PageUrl,
		UserAgent:    req.Msg.UserAgent,
	}

	if err := s.workerClient.EnqueueFeedbackSync(payload); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	return connect.NewResponse(&v1.SubmitFeedbackResponse{
		Message: "Thank you for your feedback!",
	}), nil
}

// feedbackTypeToString converts proto FeedbackType to string.
func feedbackTypeToString(t v1.FeedbackType) string {
	switch t {
	case v1.FeedbackType_FEEDBACK_TYPE_BUG_REPORT:
		return "bug_report"
	case v1.FeedbackType_FEEDBACK_TYPE_FEATURE_REQUEST:
		return "feature_request"
	case v1.FeedbackType_FEEDBACK_TYPE_GENERAL:
		return "general"
	default:
		return "general"
	}
}
