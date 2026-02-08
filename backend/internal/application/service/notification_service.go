package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// NotificationService handles notification management.
type NotificationService struct {
	userRepo         repository.UserRepository
	notificationRepo repository.NotificationRepository
	identityProvider service.IdentityProvider
	emailProvider    service.EmailProvider
	publisher        pubsub.Publisher
	baseURL          string
	logger           service.Logger
}

// NewNotificationService creates a new notification service.
func NewNotificationService(
	userRepo repository.UserRepository,
	notificationRepo repository.NotificationRepository,
	identityProvider service.IdentityProvider,
	emailProvider service.EmailProvider,
	publisher pubsub.Publisher,
	baseURL string,
	logger service.Logger,
) *NotificationService {
	return &NotificationService{
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		identityProvider: identityProvider,
		emailProvider:    emailProvider,
		publisher:        publisher,
		baseURL:          baseURL,
		logger:           logger,
	}
}

// CreateNotificationRequest contains the parameters for creating a notification.
type CreateNotificationRequest struct {
	UserID    uuid.UUID
	Type      valueobject.NotificationType
	Priority  valueobject.NotificationPriority
	Title     string
	Message   string
	ActionURL *string

	// Optional references for navigation
	CourseID *uuid.UUID
	JobID    *uuid.UUID
	TaskID   *uuid.UUID
}

// CreateNotification creates a new notification for a user.
func (s *NotificationService) CreateNotification(ctx context.Context, req CreateNotificationRequest) (*entity.Notification, error) {
	log := s.logger.With("userID", req.UserID, "type", req.Type.String())

	// Get user to get tenant ID
	user, err := s.userRepo.GetByID(ctx, req.UserID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	notification := &entity.Notification{
		TenantID:  *user.TenantID,
		UserID:    req.UserID,
		Type:      req.Type,
		Priority:  req.Priority,
		Title:     req.Title,
		Message:   req.Message,
		ActionURL: req.ActionURL,
		CourseID:  req.CourseID,
		JobID:     req.JobID,
		TaskID:    req.TaskID,
	}

	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		log.Error("failed to create notification", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Publish event for real-time delivery
	s.publishNotificationEvent(ctx, req.UserID, v1.NotificationEventType_NOTIFICATION_EVENT_TYPE_CREATED, notification)

	log.Info("notification created", "notificationID", notification.ID)
	return notification, nil
}

// ListNotificationsResult contains the paginated notification list.
type ListNotificationsResult struct {
	Notifications []*entity.Notification
	NextCursor    string
	TotalCount    int
}

// ListNotifications retrieves notifications for the current user.
func (s *NotificationService) ListNotifications(ctx context.Context, kratosID uuid.UUID, cursor string, limit int, unreadOnly bool) (*ListNotificationsResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Default limit
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	// Use cursor as-is (string pointer)
	var cursorPtr *string
	if cursor != "" {
		cursorPtr = &cursor
	}

	opts := entity.NotificationListOptions{
		Limit:      limit,
		Cursor:     cursorPtr,
		UnreadOnly: unreadOnly,
	}

	notifications, total, err := s.notificationRepo.List(ctx, user.ID, opts)
	if err != nil {
		s.logger.Error("failed to list notifications", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Generate next cursor using timestamp|id format for proper pagination
	var nextCursor string
	if len(notifications) == limit {
		last := notifications[len(notifications)-1]
		nextCursor = fmt.Sprintf("%s|%s",
			last.CreatedAt.Format(time.RFC3339Nano),
			last.ID.String())
	}

	return &ListNotificationsResult{
		Notifications: notifications,
		NextCursor:    nextCursor,
		TotalCount:    total,
	}, nil
}

// GetUnreadCount returns the count of unread notifications.
func (s *NotificationService) GetUnreadCount(ctx context.Context, kratosID uuid.UUID) (int, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return 0, domainerrors.ErrUserNotFound
	}

	count, err := s.notificationRepo.GetUnreadCount(ctx, user.ID)
	if err != nil {
		s.logger.Error("failed to get unread count", "error", err)
		return 0, domainerrors.ErrInternal.WithCause(err)
	}

	return count, nil
}

// GetUserIDByKratosID returns the user's internal ID from their Kratos ID.
// Used for subscribing to real-time notifications.
func (s *NotificationService) GetUserIDByKratosID(ctx context.Context, kratosID uuid.UUID) (uuid.UUID, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return uuid.Nil, domainerrors.ErrUserNotFound
	}
	return user.ID, nil
}

// MarkAsRead marks notifications as read.
func (s *NotificationService) MarkAsRead(ctx context.Context, kratosID uuid.UUID, notificationIDs []uuid.UUID) (int, error) {
	log := s.logger.With("kratosID", kratosID, "count", len(notificationIDs))

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return 0, domainerrors.ErrUserNotFound
	}

	count, err := s.notificationRepo.MarkAsRead(ctx, user.ID, notificationIDs)
	if err != nil {
		log.Error("failed to mark notifications as read", "error", err)
		return 0, domainerrors.ErrInternal.WithCause(err)
	}

	// Publish READ events for real-time updates
	if s.publisher != nil && count > 0 {
		for _, notifID := range notificationIDs {
			notification, err := s.notificationRepo.GetByID(ctx, notifID)
			if err != nil || notification == nil {
				continue
			}
			s.publishNotificationEvent(ctx, user.ID, v1.NotificationEventType_NOTIFICATION_EVENT_TYPE_READ, notification)
		}
	}

	log.Info("notifications marked as read", "markedCount", count)
	return count, nil
}

// MarkAllAsRead marks all notifications as read for the current user.
func (s *NotificationService) MarkAllAsRead(ctx context.Context, kratosID uuid.UUID) (int, error) {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return 0, domainerrors.ErrUserNotFound
	}

	// Fetch unread notifications before marking (for publishing events)
	var unreadNotifications []*entity.Notification
	if s.publisher != nil {
		opts := entity.NotificationListOptions{
			Limit:      100, // Reasonable limit for bulk operation
			UnreadOnly: true,
		}
		unreadNotifications, _, _ = s.notificationRepo.List(ctx, user.ID, opts)
	}

	count, err := s.notificationRepo.MarkAllAsRead(ctx, user.ID)
	if err != nil {
		log.Error("failed to mark all notifications as read", "error", err)
		return 0, domainerrors.ErrInternal.WithCause(err)
	}

	// Publish READ events for real-time updates
	for _, notification := range unreadNotifications {
		notification.Read = true // Update in-memory state
		s.publishNotificationEvent(ctx, user.ID, v1.NotificationEventType_NOTIFICATION_EVENT_TYPE_READ, notification)
	}

	log.Info("all notifications marked as read", "markedCount", count)
	return count, nil
}

// DeleteNotification deletes a notification.
func (s *NotificationService) DeleteNotification(ctx context.Context, kratosID uuid.UUID, notificationID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "notificationID", notificationID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	// Verify ownership and get notification for event publishing
	notification, err := s.notificationRepo.GetByID(ctx, notificationID)
	if err != nil || notification == nil {
		return domainerrors.ErrNotificationNotFound
	}

	if notification.UserID != user.ID {
		return domainerrors.ErrForbidden
	}

	if err := s.notificationRepo.Delete(ctx, notificationID); err != nil {
		log.Error("failed to delete notification", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// Publish DELETED event for real-time updates
	s.publishNotificationEvent(ctx, user.ID, v1.NotificationEventType_NOTIFICATION_EVENT_TYPE_DELETED, notification)

	log.Info("notification deleted")
	return nil
}

// NotifyJobProgress sends a notification about a generation job's progress.
func (s *NotificationService) NotifyJobProgress(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, jobType string, status string, progress int) error {
	var notifType valueobject.NotificationType
	var priority valueobject.NotificationPriority
	var title, message string

	switch status {
	case "completed":
		notifType = valueobject.NotificationTypeGenerationComplete
		priority = valueobject.NotificationPriorityNormal
		title = jobType + " Generation Complete"
		message = "Your " + jobType + " has been successfully generated."
	case "failed":
		notifType = valueobject.NotificationTypeGenerationFailed
		priority = valueobject.NotificationPriorityHigh
		title = jobType + " Generation Failed"
		message = "There was an error generating your " + jobType + ". Please try again."
	default:
		// Don't notify for in-progress states
		return nil
	}

	req := CreateNotificationRequest{
		UserID:   userID,
		Type:     notifType,
		Priority: priority,
		Title:    title,
		Message:  message,
		JobID:    &jobID,
	}

	_, err := s.CreateNotification(ctx, req)
	return err
}

// SendNotification creates and saves a notification.
// Implements NotificationSender interface for SMEIngestionService.
func (s *NotificationService) SendNotification(ctx context.Context, notification *entity.Notification) error {
	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		s.logger.Error("failed to send notification", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// Publish event for real-time delivery
	s.publishNotificationEvent(ctx, notification.UserID, v1.NotificationEventType_NOTIFICATION_EVENT_TYPE_CREATED, notification)

	return nil
}

// SendEmail sends an email notification.
// Implements NotificationSender interface for SMEIngestionService.
// Note: Email sending is not implemented yet - logs and returns nil.
func (s *NotificationService) SendEmail(ctx context.Context, to, subject, body string) error {
	// TODO: Implement email sending via SMTP or email provider
	s.logger.Info("email notification (not yet implemented)", "to", to, "subject", subject)
	return nil
}

// NotifyCourseComplete sends both in-app notification and email when all lessons are generated.
// Implements CourseCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error {
	return s.NotifyCourseCompleteV2(ctx, userID, courseID, courseTitle)
}

// NotifyCourseFailed sends both in-app notification and email when course generation fails.
// Implements CourseCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error {
	return s.NotifyCourseFailedV2(ctx, userID, courseID, courseTitle, errorMsg)
}

// NotifyTaskAssigned was removed as part of SME cleanup (Phase 3)
// The entire SME task assignment workflow has been removed.

// NotifyOutlineReady sends both in-app notification and email when course outline is generated.
// Implements OutlineCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error {
	return s.NotifyOutlineReadyV2(ctx, userID, courseID, courseTitle, sectionCount, lessonCount)
}

// NotifyOutlineFailed sends both in-app notification and email when outline generation fails.
// Implements OutlineCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error {
	return s.NotifyOutlineFailedV2(ctx, userID, courseID, courseTitle, errorMsg)
}

// NotifyExportComplete sends in-app notification and email when export is ready for download.
func (s *NotificationService) NotifyExportComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, format string, downloadURL string) error {
	return s.NotifyExportCompleteV2(ctx, userID, courseID, exportID, courseTitle, format, downloadURL)
}

// NotifyExportFailed sends in-app notification when export fails.
func (s *NotificationService) NotifyExportFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, errorMsg string) error {
	return s.NotifyExportFailedV2(ctx, userID, courseID, exportID, courseTitle, errorMsg)
}

// publishNotificationEvent publishes a notification event to Redis for real-time delivery.
// This is fire-and-forget - errors are logged but don't fail the operation.
func (s *NotificationService) publishNotificationEvent(ctx context.Context, userID uuid.UUID, eventType v1.NotificationEventType, notification *entity.Notification) {
	if s.publisher == nil {
		return
	}

	event := &pubsub.NotificationEvent{
		EventType:    eventType,
		Notification: notificationToProto(notification),
	}

	if err := s.publisher.PublishNotificationEvent(ctx, userID, event); err != nil {
		s.logger.Warn("failed to publish notification event",
			"error", err,
			"userID", userID,
			"eventType", eventType.String(),
		)
	}
}

// notificationToProto converts an entity.Notification to a v1.Notification proto.
func notificationToProto(n *entity.Notification) *v1.Notification {
	if n == nil {
		return nil
	}

	proto := &v1.Notification{
		Id:        n.ID.String(),
		TenantId:  n.TenantID.String(),
		UserId:    n.UserID.String(),
		Type:      notificationTypeToProto(n.Type),
		Priority:  notificationPriorityToProto(n.Priority),
		Title:     n.Title,
		Message:   n.Message,
		Read:      n.Read,
		EmailSent: n.EmailSent,
	}

	if n.CourseID != nil {
		s := n.CourseID.String()
		proto.CourseId = &s
	}
	if n.JobID != nil {
		s := n.JobID.String()
		proto.JobId = &s
	}
	if n.ExportID != nil {
		s := n.ExportID.String()
		proto.ExportId = &s
	}
	if n.ActionURL != nil {
		proto.ActionUrl = n.ActionURL
	}
	if !n.CreatedAt.IsZero() {
		proto.CreatedAt = timestamppb.New(n.CreatedAt)
	}
	if n.ReadAt != nil {
		proto.ReadAt = timestamppb.New(*n.ReadAt)
	}

	return proto
}

// notificationTypeToProto converts a domain NotificationType to proto.
func notificationTypeToProto(t valueobject.NotificationType) v1.NotificationType {
	switch t {
	// SME-related notification types removed in Phase 1/2
	// case valueobject.NotificationTypeTaskAssigned:
	// 	return v1.NotificationType_NOTIFICATION_TYPE_TASK_ASSIGNED
	// case valueobject.NotificationTypeTaskDueSoon:
	// 	return v1.NotificationType_NOTIFICATION_TYPE_TASK_DUE_SOON
	// case valueobject.NotificationTypeIngestionComplete:
	// 	return v1.NotificationType_NOTIFICATION_TYPE_INGESTION_COMPLETE
	// case valueobject.NotificationTypeIngestionFailed:
	// 	return v1.NotificationType_NOTIFICATION_TYPE_INGESTION_FAILED
	case valueobject.NotificationTypeOutlineReady:
		return v1.NotificationType_NOTIFICATION_TYPE_OUTLINE_READY
	case valueobject.NotificationTypeGenerationComplete:
		return v1.NotificationType_NOTIFICATION_TYPE_GENERATION_COMPLETE
	case valueobject.NotificationTypeGenerationFailed:
		return v1.NotificationType_NOTIFICATION_TYPE_GENERATION_FAILED
	case valueobject.NotificationTypeApprovalRequested:
		return v1.NotificationType_NOTIFICATION_TYPE_APPROVAL_REQUESTED
	case valueobject.NotificationTypeExportComplete:
		return v1.NotificationType_NOTIFICATION_TYPE_EXPORT_COMPLETE
	case valueobject.NotificationTypeExportFailed:
		return v1.NotificationType_NOTIFICATION_TYPE_EXPORT_FAILED
	case valueobject.NotificationTypeGapTaskAssigned:
		return v1.NotificationType_NOTIFICATION_TYPE_GAP_TASK_ASSIGNED
	case valueobject.NotificationTypeGapTaskCompleted:
		return v1.NotificationType_NOTIFICATION_TYPE_GAP_TASK_COMPLETED
	case valueobject.NotificationTypeGapTasksSubmitted:
		return v1.NotificationType_NOTIFICATION_TYPE_GAP_TASKS_SUBMITTED
	case valueobject.NotificationTypeSubmissionReadyForReview:
		return v1.NotificationType_NOTIFICATION_TYPE_SUBMISSION_READY_FOR_REVIEW
	case valueobject.NotificationTypeSubmissionApproved:
		return v1.NotificationType_NOTIFICATION_TYPE_SUBMISSION_APPROVED
	case valueobject.NotificationTypeChangesRequested:
		return v1.NotificationType_NOTIFICATION_TYPE_CHANGES_REQUESTED
	default:
		return v1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED
	}
}

// notificationPriorityToProto converts a domain NotificationPriority to proto.
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
