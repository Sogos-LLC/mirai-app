package service

import "context"

// EmailProvider abstracts email sending operations.
type EmailProvider interface {
	// SendInvitation sends an invitation email.
	SendInvitation(ctx context.Context, req SendInvitationRequest) error

	// SendWelcome sends a welcome email after account provisioning.
	SendWelcome(ctx context.Context, req SendWelcomeRequest) error

	// SendTaskAssignment sends a task assignment notification email.
	SendTaskAssignment(ctx context.Context, req SendTaskAssignmentRequest) error

	// SendIngestionComplete sends an ingestion completion notification email.
	SendIngestionComplete(ctx context.Context, req SendIngestionCompleteRequest) error

	// SendIngestionFailed sends an ingestion failure notification email.
	SendIngestionFailed(ctx context.Context, req SendIngestionFailedRequest) error

	// SendGenerationComplete sends a generation completion notification email.
	SendGenerationComplete(ctx context.Context, req SendGenerationCompleteRequest) error

	// SendGenerationFailed sends a generation failure notification email.
	SendGenerationFailed(ctx context.Context, req SendGenerationFailedRequest) error

	// SendOutlineReady sends a notification when course outline is ready for review.
	SendOutlineReady(ctx context.Context, req SendOutlineReadyRequest) error

	// SendCourseComplete sends a notification when full course generation is complete.
	SendCourseComplete(ctx context.Context, req SendCourseCompleteRequest) error

	// SendAlert sends an administrative alert email (e.g., for orphaned payments).
	SendAlert(ctx context.Context, req SendAlertRequest) error

	// SendExportReady sends an export ready notification email with download link.
	SendExportReady(ctx context.Context, req SendExportReadyRequest) error
}

// SendInvitationRequest contains data for sending an invitation email.
type SendInvitationRequest struct {
	To          string
	InviterName string
	CompanyName string
	InviteURL   string
	ExpiresAt   string
}

// SendWelcomeRequest contains data for sending a welcome email.
type SendWelcomeRequest struct {
	To          string
	FirstName   string
	CompanyName string
	LoginURL    string
}

// SendTaskAssignmentRequest contains data for task assignment email.
type SendTaskAssignmentRequest struct {
	To           string
	AssigneeName string
	AssignerName string
	TaskTitle    string
	SMEName      string
	TaskURL      string
	DueDate      string
}

// SendIngestionCompleteRequest contains data for ingestion complete email.
type SendIngestionCompleteRequest struct {
	To        string
	UserName  string
	SMEName   string
	TaskTitle string
	SMEURL    string
}

// SendIngestionFailedRequest contains data for ingestion failed email.
type SendIngestionFailedRequest struct {
	To           string
	UserName     string
	SMEName      string
	TaskTitle    string
	ErrorMessage string
	TaskURL      string
}

// SendGenerationCompleteRequest contains data for generation complete email.
type SendGenerationCompleteRequest struct {
	To          string
	UserName    string
	CourseTitle string
	ContentType string // "outline" or "lesson"
	CourseURL   string
}

// SendGenerationFailedRequest contains data for generation failed email.
type SendGenerationFailedRequest struct {
	To           string
	UserName     string
	CourseTitle  string
	ContentType  string // "outline" or "lesson"
	ErrorMessage string
	CourseURL    string
}

// SendOutlineReadyRequest contains data for outline ready notification email.
type SendOutlineReadyRequest struct {
	To           string
	UserName     string
	CourseTitle   string
	SectionCount int
	LessonCount  int
	ReviewURL    string
}

// SendCourseCompleteRequest contains data for full course completion email with summary.
type SendCourseCompleteRequest struct {
	To                   string
	UserName             string
	CourseTitle          string
	SectionCount         int
	LessonCount          int
	TotalDurationMinutes int
	CourseURL            string
}

// SendAlertRequest contains data for administrative alert emails.
type SendAlertRequest struct {
	Subject string
	Body    string
}

// SendExportReadyRequest contains data for export ready notification email.
type SendExportReadyRequest struct {
	To          string
	UserName    string
	CourseTitle string
	Format      string // "SCORM 2004", etc.
	DownloadURL string
	ExpiresIn   string // Human readable expiry like "7 days"
}
