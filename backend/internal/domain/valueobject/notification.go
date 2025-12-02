package valueobject

import "fmt"

// NotificationType categorizes notifications.
type NotificationType string

const (
	NotificationTypeTaskAssigned             NotificationType = "task_assigned"
	NotificationTypeTaskDueSoon              NotificationType = "task_due_soon"
	NotificationTypeIngestionComplete        NotificationType = "ingestion_complete"
	NotificationTypeIngestionFailed          NotificationType = "ingestion_failed"
	NotificationTypeOutlineReady             NotificationType = "outline_ready"
	NotificationTypeGenerationComplete       NotificationType = "generation_complete"
	NotificationTypeGenerationFailed         NotificationType = "generation_failed"
	NotificationTypeApprovalRequested        NotificationType = "approval_requested"
	NotificationTypeSubmissionReadyForReview NotificationType = "submission_ready_for_review"
	NotificationTypeSubmissionApproved       NotificationType = "submission_approved"
	NotificationTypeChangesRequested         NotificationType = "changes_requested"
)

func (t NotificationType) String() string {
	return string(t)
}

func (t NotificationType) IsValid() bool {
	switch t {
	case NotificationTypeTaskAssigned, NotificationTypeTaskDueSoon,
		NotificationTypeIngestionComplete, NotificationTypeIngestionFailed,
		NotificationTypeOutlineReady, NotificationTypeGenerationComplete,
		NotificationTypeGenerationFailed, NotificationTypeApprovalRequested,
		NotificationTypeSubmissionReadyForReview, NotificationTypeSubmissionApproved,
		NotificationTypeChangesRequested:
		return true
	}
	return false
}

func ParseNotificationType(str string) (NotificationType, error) {
	t := NotificationType(str)
	if !t.IsValid() {
		return "", fmt.Errorf("invalid notification type: %s", str)
	}
	return t, nil
}

// NotificationPriority indicates urgency.
type NotificationPriority string

const (
	NotificationPriorityLow    NotificationPriority = "low"
	NotificationPriorityNormal NotificationPriority = "normal"
	NotificationPriorityHigh   NotificationPriority = "high"
)

func (p NotificationPriority) String() string {
	return string(p)
}

func (p NotificationPriority) IsValid() bool {
	switch p {
	case NotificationPriorityLow, NotificationPriorityNormal, NotificationPriorityHigh:
		return true
	}
	return false
}

func ParseNotificationPriority(str string) (NotificationPriority, error) {
	p := NotificationPriority(str)
	if !p.IsValid() {
		return "", fmt.Errorf("invalid notification priority: %s", str)
	}
	return p, nil
}
