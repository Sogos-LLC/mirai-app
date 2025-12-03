package worker

import (
	"encoding/json"

	"github.com/hibiken/asynq"
)

// Task type constants
const (
	TypeStripeProvision   = "stripe:provision"
	TypeCleanupExpired    = "cleanup:expired"
	TypeAIGeneration      = "ai:generation"
	TypeSMEIngestion      = "sme:ingestion"
	TypeAIGenerationPoll  = "ai:generation:poll"  // Scheduled polling task
	TypeSMEIngestionPoll  = "sme:ingestion:poll"  // Scheduled polling task
)

// Queue names for priority handling
const (
	QueueCritical = "critical" // Provisioning tasks
	QueueDefault  = "default"  // AI/SME tasks
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

// SMEIngestionPayload contains data for SME document ingestion jobs
type SMEIngestionPayload struct {
	JobID string `json:"job_id"`
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

// NewSMEIngestionTask creates a new SME ingestion task
func NewSMEIngestionTask(jobID string) (*asynq.Task, error) {
	payload, err := json.Marshal(SMEIngestionPayload{
		JobID: jobID,
	})
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeSMEIngestion, payload, asynq.Queue(QueueDefault), asynq.MaxRetry(3)), nil
}

// NewCleanupExpiredTask creates a new cleanup task (no payload needed)
func NewCleanupExpiredTask() *asynq.Task {
	return asynq.NewTask(TypeCleanupExpired, nil, asynq.Queue(QueueLow), asynq.MaxRetry(1))
}

// NewAIGenerationPollTask creates a new AI generation polling task (scheduled)
func NewAIGenerationPollTask() *asynq.Task {
	return asynq.NewTask(TypeAIGenerationPoll, nil, asynq.Queue(QueueDefault), asynq.MaxRetry(1))
}

// NewSMEIngestionPollTask creates a new SME ingestion polling task (scheduled)
func NewSMEIngestionPollTask() *asynq.Task {
	return asynq.NewTask(TypeSMEIngestionPoll, nil, asynq.Queue(QueueDefault), asynq.MaxRetry(1))
}
