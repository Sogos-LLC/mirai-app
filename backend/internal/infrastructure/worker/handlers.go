package worker

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/hibiken/asynq"

	appservice "github.com/sogos/mirai-backend/internal/application/service"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/worker"
)

// Handlers contains all Asynq task handlers.
type Handlers struct {
	provisioningService *appservice.ProvisioningService
	cleanupService      *appservice.CleanupService
	aiGenService        *appservice.AIGenerationService
	smeIngestionService *appservice.SMEIngestionService
	workerClient        *Client
	logger              domainservice.Logger
}

// NewHandlers creates a new Handlers instance with all required services.
func NewHandlers(
	provisioningService *appservice.ProvisioningService,
	cleanupService *appservice.CleanupService,
	aiGenService *appservice.AIGenerationService,
	smeIngestionService *appservice.SMEIngestionService,
	workerClient *Client,
	logger domainservice.Logger,
) *Handlers {
	return &Handlers{
		provisioningService: provisioningService,
		cleanupService:      cleanupService,
		aiGenService:        aiGenService,
		smeIngestionService: smeIngestionService,
		workerClient:        workerClient,
		logger:              logger,
	}
}

// HandleStripeProvision processes a Stripe provisioning task.
// This is called when a user completes checkout and needs their account provisioned.
func (h *Handlers) HandleStripeProvision(ctx context.Context, t *asynq.Task) error {
	var payload worker.StripeProvisionPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		// Return error without retry for malformed payloads
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeStripeProvision,
		"checkoutSessionID", payload.CheckoutSessionID,
	)
	log.Info("processing stripe provision task")

	// Call the provisioning service to process this specific registration
	err := h.provisioningService.ProvisionByCheckoutSession(ctx, payload.CheckoutSessionID)
	if err != nil {
		log.Error("failed to provision account", "error", err)
		return err // Will be retried based on task configuration
	}

	log.Info("successfully provisioned account")
	return nil
}

// HandleStripeReconcile processes stuck paid registrations.
// This is called periodically by the scheduler to catch orphaned payments.
func (h *Handlers) HandleStripeReconcile(ctx context.Context, t *asynq.Task) error {
	log := h.logger.With("task", worker.TypeStripeReconcile)
	log.Info("processing stripe reconciliation task")

	// Find stuck registrations and get critical ones for alerting
	result, err := h.provisioningService.ReconcileStuckProvisioning(ctx)
	if err != nil {
		log.Error("failed to reconcile stuck provisioning", "error", err)
		return err
	}

	// Re-enqueue stuck registrations for processing
	for _, reg := range result.Stuck {
		if h.workerClient != nil {
			customerID := ""
			subscriptionID := ""
			if reg.StripeCustomerID != nil {
				customerID = *reg.StripeCustomerID
			}
			if reg.StripeSubscriptionID != nil {
				subscriptionID = *reg.StripeSubscriptionID
			}
			if err := h.workerClient.EnqueueStripeProvision(reg.CheckoutSessionID, customerID, subscriptionID); err != nil {
				log.Warn("failed to re-enqueue stuck registration",
					"checkoutSessionID", reg.CheckoutSessionID,
					"email", reg.Email,
					"error", err,
				)
			} else {
				log.Info("re-enqueued stuck registration",
					"checkoutSessionID", reg.CheckoutSessionID,
					"email", reg.Email,
				)
			}
		}
	}

	// Send warning alert for registrations stuck >15 minutes
	if len(result.Warning) > 0 {
		if err := h.provisioningService.SendWarningAlert(ctx, result.Warning); err != nil {
			log.Error("failed to send warning alert", "error", err)
			// Don't fail the task - alerting is best-effort
		}
	}

	// Send critical alert for registrations stuck >30 minutes
	if len(result.Critical) > 0 {
		if err := h.provisioningService.SendCriticalAlert(ctx, result.Critical); err != nil {
			log.Error("failed to send critical alert", "error", err)
			// Don't fail the task - alerting is best-effort
		}
	}

	log.Info("reconciliation completed",
		"stuck", len(result.Stuck),
		"warning", len(result.Warning),
		"critical", len(result.Critical),
	)
	return nil
}

// HandleCleanupExpired processes a cleanup task.
// This is called periodically by the scheduler to clean up expired registrations.
func (h *Handlers) HandleCleanupExpired(ctx context.Context, t *asynq.Task) error {
	log := h.logger.With("task", worker.TypeCleanupExpired)
	log.Info("processing cleanup task")

	err := h.cleanupService.CleanupExpired(ctx)
	if err != nil {
		log.Error("failed to cleanup expired registrations", "error", err)
		return err
	}

	log.Info("cleanup completed")
	return nil
}

// HandleAIGeneration processes an AI generation task.
// This is called when a course outline or lesson generation is requested.
func (h *Handlers) HandleAIGeneration(ctx context.Context, t *asynq.Task) error {
	var payload worker.AIGenerationPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeAIGeneration,
		"jobID", payload.JobID,
		"jobType", payload.JobType,
	)
	log.Info("processing AI generation task")

	// Call the AI generation service to process this specific job
	err := h.aiGenService.ProcessJobByID(ctx, payload.JobID)
	if err != nil {
		log.Error("failed to process AI generation job", "error", err)
		return err
	}

	log.Info("AI generation job completed")
	return nil
}

// HandleSMEIngestion processes an SME document ingestion task.
// This is called when a document needs to be processed for SME content.
func (h *Handlers) HandleSMEIngestion(ctx context.Context, t *asynq.Task) error {
	var payload worker.SMEIngestionPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeSMEIngestion,
		"jobID", payload.JobID,
	)
	log.Info("processing SME ingestion task")

	// Call the SME ingestion service to process this specific job
	err := h.smeIngestionService.ProcessJobByID(ctx, payload.JobID)
	if err != nil {
		log.Error("failed to process SME ingestion job", "error", err)
		return err
	}

	log.Info("SME ingestion job completed")
	return nil
}

// HandleAIGenerationPoll processes AI generation jobs by polling the database.
// This is called periodically by the scheduler.
func (h *Handlers) HandleAIGenerationPoll(ctx context.Context, t *asynq.Task) error {
	log := h.logger.With("task", worker.TypeAIGenerationPoll)
	log.Debug("AI generation poll task started")

	// Only process if service is available
	if h.aiGenService == nil {
		log.Warn("AI generation service not available, skipping poll")
		return nil
	}

	// Process next queued job (uses FOR UPDATE SKIP LOCKED in DB)
	// The service method returns nil if no jobs available
	err := h.aiGenService.ProcessNextQueuedJob(ctx)
	if err != nil {
		log.Error("failed to process AI generation job", "error", err)
		return err
	}

	log.Debug("AI generation poll task completed")
	return nil
}

// HandleSMEIngestionPoll processes SME ingestion jobs by polling the database.
// This is called periodically by the scheduler.
func (h *Handlers) HandleSMEIngestionPoll(ctx context.Context, t *asynq.Task) error {
	log := h.logger.With("task", worker.TypeSMEIngestionPoll)

	// Only process if service is available
	if h.smeIngestionService == nil {
		return nil
	}

	// Process next queued job (uses FOR UPDATE SKIP LOCKED in DB)
	_, err := h.smeIngestionService.ProcessNextJob(ctx)
	if err != nil {
		log.Error("failed to process SME ingestion job", "error", err)
		return err
	}

	return nil
}
