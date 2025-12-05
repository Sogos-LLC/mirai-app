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
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
)

// NotificationServiceServer implements the NotificationService Connect handler.
type NotificationServiceServer struct {
	miraiv1connect.UnimplementedNotificationServiceHandler
	notificationService *service.NotificationService
	subscriber          pubsub.Subscriber
}

// NewNotificationServiceServer creates a new NotificationServiceServer.
func NewNotificationServiceServer(
	notificationService *service.NotificationService,
	subscriber pubsub.Subscriber,
) *NotificationServiceServer {
	return &NotificationServiceServer{
		notificationService: notificationService,
		subscriber:          subscriber,
	}
}

// ListNotifications returns notifications for the current user.
func (s *NotificationServiceServer) ListNotifications(
	ctx context.Context,
	req *connect.Request[v1.ListNotificationsRequest],
) (*connect.Response[v1.ListNotificationsResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	limit := int(req.Msg.Limit)
	cursor := req.Msg.GetCursor()
	unreadOnly := req.Msg.GetUnreadOnly()

	result, err := s.notificationService.ListNotifications(ctx, kratosID, cursor, limit, unreadOnly)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoNotifications := make([]*v1.Notification, len(result.Notifications))
	for i, notif := range result.Notifications {
		protoNotifications[i] = notificationToProto(notif)
	}

	resp := &v1.ListNotificationsResponse{
		Notifications: protoNotifications,
		TotalCount:    int32(result.TotalCount),
	}
	if result.NextCursor != "" {
		resp.NextCursor = &result.NextCursor
	}

	return connect.NewResponse(resp), nil
}

// GetUnreadCount returns the count of unread notifications.
func (s *NotificationServiceServer) GetUnreadCount(
	ctx context.Context,
	req *connect.Request[v1.GetUnreadCountRequest],
) (*connect.Response[v1.GetUnreadCountResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	count, err := s.notificationService.GetUnreadCount(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetUnreadCountResponse{
		Count: int32(count),
	}), nil
}

// MarkAsRead marks notifications as read.
func (s *NotificationServiceServer) MarkAsRead(
	ctx context.Context,
	req *connect.Request[v1.MarkAsReadRequest],
) (*connect.Response[v1.MarkAsReadResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	notificationIDs := make([]uuid.UUID, 0, len(req.Msg.NotificationIds))
	for _, id := range req.Msg.NotificationIds {
		if uid, err := uuid.Parse(id); err == nil {
			notificationIDs = append(notificationIDs, uid)
		}
	}

	markedCount, err := s.notificationService.MarkAsRead(ctx, kratosID, notificationIDs)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.MarkAsReadResponse{
		MarkedCount: int32(markedCount),
	}), nil
}

// MarkAllAsRead marks all notifications as read.
func (s *NotificationServiceServer) MarkAllAsRead(
	ctx context.Context,
	req *connect.Request[v1.MarkAllAsReadRequest],
) (*connect.Response[v1.MarkAllAsReadResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	markedCount, err := s.notificationService.MarkAllAsRead(ctx, kratosID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.MarkAllAsReadResponse{
		MarkedCount: int32(markedCount),
	}), nil
}

// DeleteNotification deletes a notification.
func (s *NotificationServiceServer) DeleteNotification(
	ctx context.Context,
	req *connect.Request[v1.DeleteNotificationRequest],
) (*connect.Response[v1.DeleteNotificationResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	notificationID, err := parseUUID(req.Msg.NotificationId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	if err := s.notificationService.DeleteNotification(ctx, kratosID, notificationID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteNotificationResponse{}), nil
}

// SubscribeNotifications opens a server-streaming connection for real-time notification events.
func (s *NotificationServiceServer) SubscribeNotifications(
	ctx context.Context,
	req *connect.Request[v1.SubscribeNotificationsRequest],
	stream *connect.ServerStream[v1.SubscribeNotificationsResponse],
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
	userID, err := s.notificationService.GetUserIDByKratosID(ctx, kratosID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}

	// Subscribe to Redis channel for this user
	eventCh, cleanup, err := s.subscriber.SubscribeUserEvents(ctx, userID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}
	defer cleanup()

	// Forward events to client stream
	for {
		select {
		case <-ctx.Done():
			// Client disconnected or context cancelled
			return nil
		case event, ok := <-eventCh:
			if !ok {
				// Channel closed
				return nil
			}
			// Send event to client
			resp := &v1.SubscribeNotificationsResponse{
				EventType:    event.EventType,
				Notification: event.Notification,
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		}
	}
}

// Helper functions for proto conversion

func notificationToProto(notif *entity.Notification) *v1.Notification {
	if notif == nil {
		return nil
	}

	var readAt *timestamppb.Timestamp
	if notif.ReadAt != nil {
		readAt = timestamppb.New(*notif.ReadAt)
	}

	var actionURL *string
	if notif.ActionURL != nil {
		actionURL = notif.ActionURL
	}

	result := &v1.Notification{
		Id:        notif.ID.String(),
		TenantId:  notif.TenantID.String(),
		UserId:    notif.UserID.String(),
		Type:      notificationTypeToProto(notif.Type),
		Priority:  notificationPriorityToProto(notif.Priority),
		Title:     notif.Title,
		Message:   notif.Message,
		ActionUrl: actionURL,
		Read:      notif.Read,
		ReadAt:    readAt,
		CreatedAt: timestamppb.New(notif.CreatedAt),
	}

	// Set optional reference IDs
	if notif.CourseID != nil {
		s := notif.CourseID.String()
		result.CourseId = &s
	}
	if notif.JobID != nil {
		s := notif.JobID.String()
		result.JobId = &s
	}
	if notif.TaskID != nil {
		s := notif.TaskID.String()
		result.TaskId = &s
	}
	if notif.SMEID != nil {
		s := notif.SMEID.String()
		result.SmeId = &s
	}

	return result
}

func notificationTypeToProto(t valueobject.NotificationType) v1.NotificationType {
	switch t {
	case valueobject.NotificationTypeTaskAssigned:
		return v1.NotificationType_NOTIFICATION_TYPE_TASK_ASSIGNED
	case valueobject.NotificationTypeTaskDueSoon:
		return v1.NotificationType_NOTIFICATION_TYPE_TASK_DUE_SOON
	case valueobject.NotificationTypeIngestionComplete:
		return v1.NotificationType_NOTIFICATION_TYPE_INGESTION_COMPLETE
	case valueobject.NotificationTypeIngestionFailed:
		return v1.NotificationType_NOTIFICATION_TYPE_INGESTION_FAILED
	case valueobject.NotificationTypeOutlineReady:
		return v1.NotificationType_NOTIFICATION_TYPE_OUTLINE_READY
	case valueobject.NotificationTypeGenerationComplete:
		return v1.NotificationType_NOTIFICATION_TYPE_GENERATION_COMPLETE
	case valueobject.NotificationTypeGenerationFailed:
		return v1.NotificationType_NOTIFICATION_TYPE_GENERATION_FAILED
	case valueobject.NotificationTypeApprovalRequested:
		return v1.NotificationType_NOTIFICATION_TYPE_APPROVAL_REQUESTED
	default:
		return v1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED
	}
}

func notificationPriorityToProto(p valueobject.NotificationPriority) v1.NotificationPriority {
	switch p {
	case valueobject.NotificationPriorityLow:
		return v1.NotificationPriority_NOTIFICATION_PRIORITY_LOW
	case valueobject.NotificationPriorityNormal:
		return v1.NotificationPriority_NOTIFICATION_PRIORITY_NORMAL
	case valueobject.NotificationPriorityHigh:
		return v1.NotificationPriority_NOTIFICATION_PRIORITY_HIGH
	default:
		return v1.NotificationPriority_NOTIFICATION_PRIORITY_UNSPECIFIED
	}
}
