package worker

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)

// Task type constants
const (
	TypeStripeProvision        = "stripe:provision"
	TypeStripeReconcile        = "stripe:reconcile"        // Scheduled reconciliation for orphaned payments
	TypeCleanupExpired         = "cleanup:expired"
	TypeAIGeneration           = "ai:generation"
	TypeAIGenerationPoll       = "ai:generation:poll"       // Scheduled polling task
	TypeCourseExport           = "course:export"
	TypeCourseExportPoll       = "course:export:poll"       // Scheduled polling task
	TypeFeedbackSync           = "feedback:sync"            // Sync feedback to CRM
	TypeTeamKnowledgeIngestion = "team_knowledge:ingestion" // Process team knowledge uploads
)

// Queue names for priority handling
const (
	QueueCritical = "critical" // Provisioning tasks
	QueueDefault  = "default"  // AI tasks
	QueueLow      = "low"      // Cleanup tasks
)

// StripeProvisionPayload contains data for provisioning a new account after Stripe payment
type StripeProvisionPayload struct {
	CheckoutSessionID string `json:"checkout_session_id"`
	StripeCustomer    string `json:"stripe_customer"`
	SubscriptionID    string `json:"subscription_id"`
}

// AIGenerationPayload contains data for AI content generation jobs
type AIGenerationPayload struct {
	JobID   string `json:"job_id"`
	JobType string `json:"job_type"` // "outline" or "lesson"
}

// CourseExportPayload contains data for course export jobs
type CourseExportPayload struct {
	ExportID string `json:"export_id"`
	TenantID string `json:"tenant_id"`
}

// FeedbackSyncPayload contains data for syncing feedback to CRM
type FeedbackSyncPayload struct {
	UserID       string `json:"user_id"`
	UserEmail    string `json:"user_email"`
	UserName     string `json:"user_name"`
	FeedbackType string `json:"feedback_type"` // bug_report, feature_request, general
	Message      string `json:"message"`
	PageURL      string `json:"page_url"`
	UserAgent    string `json:"user_agent"`
}

// TeamKnowledgeIngestionPayload contains data for processing team knowledge uploads
type TeamKnowledgeIngestionPayload struct {
	SourceID string `json:"source_id"`
	TenantID string `json:"tenant_id"`
	TeamID   string `json:"team_id"`
	FilePath string `json:"file_path"`
}

// NewStripeProvisionTask creates a new Stripe provisioning task
func NewStripeProvisionTask(sessionID, customer, subscriptionID string) (*asynq.Task, error) {
	payload, err := json.Marshal(StripeProvisionPayload{
		CheckoutSessionID: sessionID,
		StripeCustomer:    customer,
		SubscriptionID:    subscriptionID,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeStripeProvision, payload, asynq.Queue(QueueCritical), asynq.MaxRetry(10)), nil
}

// NewStripeReconcileTask creates a new Stripe reconciliation task (scheduled)
func NewStripeReconcileTask() *asynq.Task {
	return asynq.NewTask(TypeStripeReconcile, nil, asynq.Queue(QueueCritical), asynq.MaxRetry(1))
}

// NewAIGenerationTask creates a new AI generation task
func NewAIGenerationTask(jobID, jobType string) (*asynq.Task, error) {
	payload, err := json.Marshal(AIGenerationPayload{
		JobID:   jobID,
		JobType: jobType,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeAIGeneration, payload, asynq.Queue(QueueDefault), asynq.MaxRetry(3)), nil
}

// NewCleanupExpiredTask creates a new cleanup task (no payload needed)
func NewCleanupExpiredTask() *asynq.Task {
	return asynq.NewTask(TypeCleanupExpired, nil, asynq.Queue(QueueLow), asynq.MaxRetry(1))
}

// NewAIGenerationPollTask creates a new AI generation polling task (scheduled)
func NewAIGenerationPollTask() *asynq.Task {
	return asynq.NewTask(TypeAIGenerationPoll, nil, asynq.Queue(QueueDefault), asynq.MaxRetry(1))
}

// NewCourseExportTask creates a new course export task
func NewCourseExportTask(exportID, tenantID string) (*asynq.Task, error) {
	payload, err := json.Marshal(CourseExportPayload{
		ExportID: exportID,
		TenantID: tenantID,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeCourseExport, payload, asynq.Queue(QueueDefault), asynq.MaxRetry(3)), nil
}

// NewCourseExportPollTask creates a new course export polling task (scheduled)
func NewCourseExportPollTask() *asynq.Task {
	return asynq.NewTask(TypeCourseExportPoll, nil, asynq.Queue(QueueDefault), asynq.MaxRetry(1))
}

// NewFeedbackSyncTask creates a new feedback sync task
func NewFeedbackSyncTask(payload FeedbackSyncPayload) (*asynq.Task, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeFeedbackSync, data, asynq.Queue(QueueDefault), asynq.MaxRetry(5)), nil
}

// NewTeamKnowledgeIngestionTask creates a new team knowledge ingestion task
func NewTeamKnowledgeIngestionTask(sourceID, tenantID, teamID, filePath string) (*asynq.Task, error) {
	payload, err := json.Marshal(TeamKnowledgeIngestionPayload{
		SourceID: sourceID,
		TenantID: tenantID,
		TeamID:   teamID,
		FilePath: filePath,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeTeamKnowledgeIngestion, payload, asynq.Queue(QueueDefault), asynq.MaxRetry(3)), nil
}
