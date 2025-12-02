package service

import (
	"context"
	"fmt"
	"time"

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
	identityProvider service.IdentityProvider
	emailProvider    service.EmailProvider
	baseURL          string
	logger           service.Logger
}

// NewNotificationService creates a new notification service.
func NewNotificationService(
	userRepo repository.UserRepository,
	notificationRepo repository.NotificationRepository,
	identityProvider service.IdentityProvider,
	emailProvider service.EmailProvider,
	baseURL string,
	logger service.Logger,
) *NotificationService {
	return &NotificationService{
		userRepo:         userRepo,
		notificationRepo: notificationRepo,
		identityProvider: identityProvider,
		emailProvider:    emailProvider,
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

// SendNotification creates and saves a notification.
// Implements NotificationSender interface for SMEIngestionService.
func (s *NotificationService) SendNotification(ctx context.Context, notification *entity.Notification) error {
	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		s.logger.Error("failed to send notification", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
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

// NotifyGenerationCompleteRequest contains parameters for course generation completion notification.
type NotifyGenerationCompleteRequest struct {
	UserID      uuid.UUID
	UserEmail   string // Email for sending notification
	UserName    string // First name for email personalization
	CourseID    uuid.UUID
	CourseTitle string
	ActionURL   string // Relative URL like /content-library?courseId={id}
	SendEmail   bool
}

// NotifyGenerationComplete creates an in-app notification and optionally sends an email
// when course generation is complete.
func (s *NotificationService) NotifyGenerationComplete(ctx context.Context, req NotifyGenerationCompleteRequest) error {
	log := s.logger.With("userID", req.UserID, "courseID", req.CourseID)

	// 1. Create in-app notification
	actionURL := req.ActionURL
	notifReq := CreateNotificationRequest{
		UserID:    req.UserID,
		Type:      valueobject.NotificationTypeGenerationComplete,
		Priority:  valueobject.NotificationPriorityNormal,
		Title:     "Course Ready: " + req.CourseTitle,
		Message:   "Your AI-generated course is ready for review.",
		ActionURL: &actionURL,
		CourseID:  &req.CourseID,
	}

	_, err := s.CreateNotification(ctx, notifReq)
	if err != nil {
		log.Error("failed to create in-app notification", "error", err)
		// Continue to try email even if in-app fails
	} else {
		log.Info("in-app notification created for course completion")
	}

	// 2. Send email if requested
	if req.SendEmail && s.emailProvider != nil && req.UserEmail != "" {
		emailReq := service.SendGenerationCompleteRequest{
			To:          req.UserEmail,
			UserName:    req.UserName,
			CourseTitle: req.CourseTitle,
			ContentType: "course",
			CourseURL:   s.baseURL + req.ActionURL,
		}

		if err := s.emailProvider.SendGenerationComplete(ctx, emailReq); err != nil {
			log.Error("failed to send completion email", "error", err)
			// Don't fail the whole operation if email fails
		} else {
			log.Info("completion email sent", "to", req.UserEmail)
		}
	}

	return nil
}

// NotifyGenerationFailedRequest contains parameters for course generation failure notification.
type NotifyGenerationFailedRequest struct {
	UserID       uuid.UUID
	UserEmail    string // Email for sending notification
	UserName     string // First name for email personalization
	CourseID     uuid.UUID
	CourseTitle  string
	ErrorMessage string
	ActionURL    string // Relative URL like /courses/{id}
	SendEmail    bool
}

// NotifyGenerationFailed creates an in-app notification and optionally sends an email
// when course generation fails.
func (s *NotificationService) NotifyGenerationFailed(ctx context.Context, req NotifyGenerationFailedRequest) error {
	log := s.logger.With("userID", req.UserID, "courseID", req.CourseID)

	// 1. Create in-app notification
	actionURL := req.ActionURL
	notifReq := CreateNotificationRequest{
		UserID:    req.UserID,
		Type:      valueobject.NotificationTypeGenerationFailed,
		Priority:  valueobject.NotificationPriorityHigh,
		Title:     "Generation Failed: " + req.CourseTitle,
		Message:   req.ErrorMessage,
		ActionURL: &actionURL,
		CourseID:  &req.CourseID,
	}

	_, err := s.CreateNotification(ctx, notifReq)
	if err != nil {
		log.Error("failed to create in-app notification", "error", err)
	} else {
		log.Info("in-app notification created for course generation failure")
	}

	// 2. Send email if requested
	if req.SendEmail && s.emailProvider != nil && req.UserEmail != "" {
		emailReq := service.SendGenerationFailedRequest{
			To:           req.UserEmail,
			UserName:     req.UserName,
			CourseTitle:  req.CourseTitle,
			ContentType:  "course",
			ErrorMessage: req.ErrorMessage,
			CourseURL:    s.baseURL + req.ActionURL,
		}

		if err := s.emailProvider.SendGenerationFailed(ctx, emailReq); err != nil {
			log.Error("failed to send failure email", "error", err)
		} else {
			log.Info("failure email sent", "to", req.UserEmail)
		}
	}

	return nil
}

// NotifyCourseComplete sends both in-app notification and email when all lessons are generated.
// This method looks up the user's email from Kratos using their KratosID.
// Implements CourseCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error {
	log := s.logger.With("userID", userID, "courseID", courseID)

	// Look up user to get KratosID
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		log.Error("failed to get user for completion notification", "error", err)
		return domainerrors.ErrUserNotFound
	}

	// Look up identity from Kratos to get email
	var userEmail, userName string
	if s.identityProvider != nil {
		identity, err := s.identityProvider.GetIdentity(ctx, user.KratosID.String())
		if err != nil {
			log.Warn("failed to get identity for email", "error", err)
		} else if identity != nil {
			userEmail = identity.Email
			userName = identity.FirstName
		}
	}

	// Link to course preview page where user can view the generated course
	actionURL := fmt.Sprintf("/course/%s/preview", courseID.String())

	// Send notification with email if we have it
	return s.NotifyGenerationComplete(ctx, NotifyGenerationCompleteRequest{
		UserID:      userID,
		UserEmail:   userEmail,
		UserName:    userName,
		CourseID:    courseID,
		CourseTitle: courseTitle,
		ActionURL:   actionURL,
		SendEmail:   userEmail != "",
	})
}

// NotifyCourseFailed sends both in-app notification and email when course generation fails.
// This method looks up the user's email from Kratos using their KratosID.
// Implements CourseCompletionNotifier interface for AIGenerationService.
func (s *NotificationService) NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error {
	log := s.logger.With("userID", userID, "courseID", courseID)

	// Look up user to get KratosID
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		log.Error("failed to get user for failure notification", "error", err)
		return domainerrors.ErrUserNotFound
	}

	// Look up identity from Kratos to get email
	var userEmail, userName string
	if s.identityProvider != nil {
		identity, err := s.identityProvider.GetIdentity(ctx, user.KratosID.String())
		if err != nil {
			log.Warn("failed to get identity for email", "error", err)
		} else if identity != nil {
			userEmail = identity.Email
			userName = identity.FirstName
		}
	}

	actionURL := fmt.Sprintf("/courses/%s", courseID.String())

	// Send notification with email if we have it
	return s.NotifyGenerationFailed(ctx, NotifyGenerationFailedRequest{
		UserID:       userID,
		UserEmail:    userEmail,
		UserName:     userName,
		CourseID:     courseID,
		CourseTitle:  courseTitle,
		ErrorMessage: errorMsg,
		ActionURL:    actionURL,
		SendEmail:    userEmail != "",
	})
}

// NotifyTaskAssigned sends both in-app notification and email when a task is assigned.
func (s *NotificationService) NotifyTaskAssigned(ctx context.Context, req NotifyTaskAssignedRequest) error {
	log := s.logger.With("assigneeUserID", req.AssigneeUserID, "taskID", req.TaskID)

	// Look up assignee user
	assignee, err := s.userRepo.GetByID(ctx, req.AssigneeUserID)
	if err != nil || assignee == nil {
		log.Error("failed to get assignee user", "error", err)
		return domainerrors.ErrUserNotFound
	}

	// Look up assigner user for their name
	assigner, err := s.userRepo.GetByID(ctx, req.AssignerUserID)
	if err != nil || assigner == nil {
		log.Error("failed to get assigner user", "error", err)
		return domainerrors.ErrUserNotFound
	}

	// Get email and name from Kratos identity
	var assigneeEmail, assigneeName, assignerName string
	if s.identityProvider != nil {
		// Get assignee info
		assigneeIdentity, err := s.identityProvider.GetIdentity(ctx, assignee.KratosID.String())
		if err != nil {
			log.Warn("failed to get assignee identity", "error", err)
		} else if assigneeIdentity != nil {
			assigneeEmail = assigneeIdentity.Email
			assigneeName = assigneeIdentity.FirstName
			if assigneeIdentity.LastName != "" {
				assigneeName = assigneeIdentity.FirstName + " " + assigneeIdentity.LastName
			}
		}

		// Get assigner name
		assignerIdentity, err := s.identityProvider.GetIdentity(ctx, assigner.KratosID.String())
		if err != nil {
			log.Warn("failed to get assigner identity", "error", err)
		} else if assignerIdentity != nil {
			assignerName = assignerIdentity.FirstName
			if assignerIdentity.LastName != "" {
				assignerName = assignerIdentity.FirstName + " " + assignerIdentity.LastName
			}
		}
	}

	// Build action URL to view the SME with task context
	actionURL := fmt.Sprintf("/smes?sme=%s&task=%s", req.SMEID.String(), req.TaskID.String())

	// Create in-app notification
	notification := &entity.Notification{
		TenantID:  *assignee.TenantID,
		UserID:    req.AssigneeUserID,
		Type:      valueobject.NotificationTypeTaskAssigned,
		Priority:  valueobject.NotificationPriorityNormal,
		Title:     "New Task Assigned",
		Message:   fmt.Sprintf("You've been assigned a task: %s for %s", req.TaskTitle, req.SMEName),
		ActionURL: &actionURL,
		TaskID:    &req.TaskID,
		SMEID:     &req.SMEID,
	}

	if err := s.notificationRepo.Create(ctx, notification); err != nil {
		log.Error("failed to create task notification", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("task notification created", "notificationID", notification.ID)

	// Send email if we have the email address
	if assigneeEmail != "" && s.emailProvider != nil {
		// Format due date if present
		dueDate := ""
		if req.DueDate != nil {
			dueDate = req.DueDate.Format("January 2, 2006")
		}

		// Build full task URL
		taskURL := s.baseURL + actionURL

		emailReq := service.SendTaskAssignmentRequest{
			To:           assigneeEmail,
			AssigneeName: assigneeName,
			AssignerName: assignerName,
			TaskTitle:    req.TaskTitle,
			SMEName:      req.SMEName,
			TaskURL:      taskURL,
			DueDate:      dueDate,
		}

		if err := s.emailProvider.SendTaskAssignment(ctx, emailReq); err != nil {
			log.Error("failed to send task assignment email", "error", err)
			// Don't fail the whole operation if email fails
		} else {
			log.Info("task assignment email sent", "to", assigneeEmail)
		}
	}

	return nil
}
