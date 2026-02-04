package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// NotificationBuilder provides a fluent API for building and sending notifications.
type NotificationBuilder struct {
	ns *NotificationService
}

// NotificationRequest is a builder for creating notifications.
type NotificationRequest struct {
	builder *NotificationBuilder
	ctx     context.Context

	// User info
	userID   uuid.UUID
	tenantID uuid.UUID
	kratosID uuid.UUID

	// Notification fields
	notifType valueobject.NotificationType
	priority  valueobject.NotificationPriority
	title     string
	message   string
	actionURL string
	courseID  *uuid.UUID
	jobID     *uuid.UUID
	exportID  *uuid.UUID

	// Email fields
	sendEmail    bool
	emailRequest interface{} // Holds the specific email request type
}

// ForUser starts building a notification for a specific user ID.
func (b *NotificationBuilder) ForUser(ctx context.Context, userID uuid.UUID) *NotificationRequest {
	return &NotificationRequest{
		builder:  b,
		ctx:      ctx,
		userID:   userID,
		priority: valueobject.NotificationPriorityNormal,
	}
}

// WithType sets the notification type.
func (r *NotificationRequest) WithType(t valueobject.NotificationType) *NotificationRequest {
	r.notifType = t
	return r
}

// WithPriority sets the notification priority.
func (r *NotificationRequest) WithPriority(p valueobject.NotificationPriority) *NotificationRequest {
	r.priority = p
	return r
}

// WithTitle sets the notification title.
func (r *NotificationRequest) WithTitle(title string) *NotificationRequest {
	r.title = title
	return r
}

// WithMessage sets the notification message.
func (r *NotificationRequest) WithMessage(message string) *NotificationRequest {
	r.message = message
	return r
}

// WithActionURL sets the action URL for the notification.
func (r *NotificationRequest) WithActionURL(url string) *NotificationRequest {
	r.actionURL = url
	return r
}

// WithCourse associates the notification with a course.
func (r *NotificationRequest) WithCourse(courseID uuid.UUID) *NotificationRequest {
	r.courseID = &courseID
	return r
}

// WithJob associates the notification with a job.
func (r *NotificationRequest) WithJob(jobID uuid.UUID) *NotificationRequest {
	r.jobID = &jobID
	return r
}

// WithExport associates the notification with an export.
func (r *NotificationRequest) WithExport(exportID uuid.UUID) *NotificationRequest {
	r.exportID = &exportID
	return r
}

// WithGenerationCompleteEmail queues a generation complete email.
func (r *NotificationRequest) WithGenerationCompleteEmail(courseTitle, contentType string) *NotificationRequest {
	r.sendEmail = true
	r.emailRequest = &generationCompleteEmailRequest{
		courseTitle: courseTitle,
		contentType: contentType,
	}
	return r
}

// WithGenerationFailedEmail queues a generation failed email.
func (r *NotificationRequest) WithGenerationFailedEmail(courseTitle, contentType, errorMsg string) *NotificationRequest {
	r.sendEmail = true
	r.emailRequest = &generationFailedEmailRequest{
		courseTitle: courseTitle,
		contentType: contentType,
		errorMsg:    errorMsg,
	}
	return r
}

// WithOutlineReadyEmail queues an outline ready email.
func (r *NotificationRequest) WithOutlineReadyEmail(courseTitle string, sectionCount, lessonCount int) *NotificationRequest {
	r.sendEmail = true
	r.emailRequest = &outlineReadyEmailRequest{
		courseTitle:  courseTitle,
		sectionCount: sectionCount,
		lessonCount:  lessonCount,
	}
	return r
}

// WithExportReadyEmail queues an export ready email.
func (r *NotificationRequest) WithExportReadyEmail(courseTitle, format, downloadURL string) *NotificationRequest {
	r.sendEmail = true
	r.emailRequest = &exportReadyEmailRequest{
		courseTitle: courseTitle,
		format:      format,
		downloadURL: downloadURL,
	}
	return r
}

// Send sends the notification and optional email.
func (r *NotificationRequest) Send() error {
	ns := r.builder.ns
	log := ns.logger.With("userID", r.userID, "type", r.notifType.String())

	// Look up user
	user, err := ns.userRepo.GetByID(r.ctx, r.userID)
	if err != nil || user == nil {
		log.Error("failed to get user for notification", "error", err)
		return domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return domainerrors.ErrUserHasNoCompany
	}

	r.tenantID = *user.TenantID
	r.kratosID = user.KratosID

	// Create in-app notification
	if err := r.createInAppNotification(); err != nil {
		log.Error("failed to create in-app notification", "error", err)
		// Continue to try email even if in-app fails
	} else {
		log.Info("in-app notification created")
	}

	// Send email if requested
	if r.sendEmail && ns.emailProvider != nil {
		if err := r.sendEmailNotification(); err != nil {
			log.Error("failed to send email notification", "error", err)
			// Don't fail the operation if email fails
		}
	}

	return nil
}

func (r *NotificationRequest) createInAppNotification() error {
	ns := r.builder.ns

	actionURL := r.actionURL
	notifReq := CreateNotificationRequest{
		UserID:    r.userID,
		Type:      r.notifType,
		Priority:  r.priority,
		Title:     r.title,
		Message:   r.message,
		ActionURL: &actionURL,
		CourseID:  r.courseID,
		JobID:     r.jobID,
	}

	_, err := ns.CreateNotification(r.ctx, notifReq)
	return err
}

func (r *NotificationRequest) sendEmailNotification() error {
	ns := r.builder.ns
	log := ns.logger.With("userID", r.userID)

	// Look up identity from Kratos to get email
	var userEmail, userName string
	if ns.identityProvider != nil {
		identity, err := ns.identityProvider.GetIdentity(r.ctx, r.kratosID.String())
		if err != nil {
			log.Warn("failed to get identity for email", "error", err)
			return nil // Email is optional, don't fail
		}
		if identity != nil {
			userEmail = identity.Email
			userName = identity.FirstName
		}
	}

	if userEmail == "" {
		log.Warn("no email address found for user")
		return nil
	}

	// Dispatch to appropriate email sender based on type
	switch req := r.emailRequest.(type) {
	case *generationCompleteEmailRequest:
		return ns.emailProvider.SendGenerationComplete(r.ctx, service.SendGenerationCompleteRequest{
			To:          userEmail,
			UserName:    userName,
			CourseTitle: req.courseTitle,
			ContentType: req.contentType,
			CourseURL:   ns.baseURL + r.actionURL,
		})

	case *generationFailedEmailRequest:
		return ns.emailProvider.SendGenerationFailed(r.ctx, service.SendGenerationFailedRequest{
			To:           userEmail,
			UserName:     userName,
			CourseTitle:  req.courseTitle,
			ContentType:  req.contentType,
			ErrorMessage: req.errorMsg,
			CourseURL:    ns.baseURL + r.actionURL,
		})

	case *outlineReadyEmailRequest:
		return ns.emailProvider.SendOutlineReady(r.ctx, service.SendOutlineReadyRequest{
			To:           userEmail,
			UserName:     userName,
			CourseTitle:  req.courseTitle,
			SectionCount: req.sectionCount,
			LessonCount:  req.lessonCount,
			ReviewURL:    ns.baseURL + r.actionURL,
		})

	case *exportReadyEmailRequest:
		return ns.emailProvider.SendExportReady(r.ctx, service.SendExportReadyRequest{
			To:          userEmail,
			UserName:    userName,
			CourseTitle: req.courseTitle,
			Format:      req.format,
			DownloadURL: req.downloadURL,
			ExpiresIn:   "7 days",
		})
	}

	return nil
}

// Email request types (internal)
type generationCompleteEmailRequest struct {
	courseTitle string
	contentType string
}

type generationFailedEmailRequest struct {
	courseTitle string
	contentType string
	errorMsg    string
}

type outlineReadyEmailRequest struct {
	courseTitle  string
	sectionCount int
	lessonCount  int
}

type exportReadyEmailRequest struct {
	courseTitle string
	format      string
	downloadURL string
}

// Notify returns a NotificationBuilder for fluent notification building.
func (s *NotificationService) Notify() *NotificationBuilder {
	return &NotificationBuilder{ns: s}
}

// Convenience methods that use the builder internally

// NotifyCourseCompleteV2 sends course completion notification using the builder pattern.
func (s *NotificationService) NotifyCourseCompleteV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error {
	actionURL := fmt.Sprintf("/course/%s/preview", courseID.String())

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeGenerationComplete).
		WithTitle("Course Ready: " + courseTitle).
		WithMessage("Your AI-generated course is ready for review.").
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithGenerationCompleteEmail(courseTitle, "course").
		Send()
}

// NotifyCourseFailedV2 sends course failure notification using the builder pattern.
func (s *NotificationService) NotifyCourseFailedV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error {
	actionURL := fmt.Sprintf("/courses/%s", courseID.String())

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeGenerationFailed).
		WithPriority(valueobject.NotificationPriorityHigh).
		WithTitle("Generation Failed: " + courseTitle).
		WithMessage(errorMsg).
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithGenerationFailedEmail(courseTitle, "course", errorMsg).
		Send()
}

// NotifyOutlineReadyV2 sends outline ready notification using the builder pattern.
func (s *NotificationService) NotifyOutlineReadyV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error {
	actionURL := fmt.Sprintf("/course/%s/outline", courseID.String())

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeOutlineReady).
		WithTitle("Outline Ready for Review").
		WithMessage(fmt.Sprintf("Your course outline is ready with %d sections and %d lessons.", sectionCount, lessonCount)).
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithOutlineReadyEmail(courseTitle, sectionCount, lessonCount).
		Send()
}

// NotifyOutlineFailedV2 sends outline failure notification using the builder pattern.
func (s *NotificationService) NotifyOutlineFailedV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error {
	actionURL := fmt.Sprintf("/course/%s/outline", courseID.String())

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeGenerationFailed).
		WithPriority(valueobject.NotificationPriorityHigh).
		WithTitle("Outline Generation Failed").
		WithMessage(errorMsg).
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithGenerationFailedEmail(courseTitle, "outline", errorMsg).
		Send()
}

// NotifyExportCompleteV2 sends export complete notification using the builder pattern.
func (s *NotificationService) NotifyExportCompleteV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, format string, downloadURL string) error {
	actionURL := downloadURL
	if actionURL == "" {
		actionURL = fmt.Sprintf("/course/%s/editor", courseID.String())
	}

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeExportComplete).
		WithTitle("Export Ready").
		WithMessage(fmt.Sprintf("Your %s export for \"%s\" is ready to download.", format, courseTitle)).
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithExport(exportID).
		WithExportReadyEmail(courseTitle, format, downloadURL).
		Send()
}

// NotifyExportFailedV2 sends export failure notification using the builder pattern.
func (s *NotificationService) NotifyExportFailedV2(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, errorMsg string) error {
	actionURL := fmt.Sprintf("/course/%s/editor", courseID.String())

	return s.Notify().
		ForUser(ctx, userID).
		WithType(valueobject.NotificationTypeExportFailed).
		WithPriority(valueobject.NotificationPriorityHigh).
		WithTitle("Export Failed").
		WithMessage(fmt.Sprintf("Export for \"%s\" failed: %s", courseTitle, errorMsg)).
		WithActionURL(actionURL).
		WithCourse(courseID).
		WithExport(exportID).
		Send()
}
