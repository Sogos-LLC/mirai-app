package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// NotificationService handles notification management.
type NotificationService struct {
	userRepo         repository.UserRepository
	notificationRepo repository.NotificationRepository
	logger           service.Logger
}

// NewNotificationService creates a new notification service.
func NewNotificationService(
	userRepo repository.UserRepository,
	notificationRepo repository.NotificationRepository,
	logger service.Logger,
) *NotificationService {
	return &NotificationService{
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
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
	SMEID    *uuid.UUID
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
		SMEID:     req.SMEID,
	}

	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		log.Error("failed to create notification", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

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

	// Generate next cursor (use last notification ID)
	var nextCursor string
	if len(notifications) == limit {
		last := notifications[len(notifications)-1]
		nextCursor = last.ID.String()
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

	count, err := s.notificationRepo.MarkAllAsRead(ctx, user.ID)
	if err != nil {
		log.Error("failed to mark all notifications as read", "error", err)
		return 0, domainerrors.ErrInternal.WithCause(err)
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

	// Verify ownership
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
