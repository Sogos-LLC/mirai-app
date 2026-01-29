package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	appservice "github.com/sogos/mirai-backend/internal/application/service"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/worker"
)

// Handlers contains all Asynq task handlers.
type Handlers struct {
	provisioningService *appservice.ProvisioningService
	cleanupService      *appservice.CleanupService
	aiGenService        *appservice.AIGenerationService
	exportService       *appservice.CourseExportService
	workerClient        *Client
	logger              domainservice.Logger
	crmProvider         domainservice.CRMProvider
	userRepo            UserCRMRepository
}

// UserCRMRepository is a subset of UserRepository for CRM operations.
type UserCRMRepository interface {
	GetCRMContactID(ctx context.Context, id uuid.UUID) (string, error)
	UpdateCRMContactID(ctx context.Context, id uuid.UUID, crmContactID string) error
}

// NewHandlers creates a new Handlers instance with all required services.
func NewHandlers(
	provisioningService *appservice.ProvisioningService,
	cleanupService *appservice.CleanupService,
	aiGenService *appservice.AIGenerationService,
	exportService *appservice.CourseExportService,
	workerClient *Client,
	logger domainservice.Logger,
	crmProvider domainservice.CRMProvider,
	userRepo UserCRMRepository,
) *Handlers {
	return &Handlers{
		provisioningService: provisioningService,
		cleanupService:      cleanupService,
		aiGenService:        aiGenService,
		exportService:       exportService,
		workerClient:        workerClient,
		logger:              logger,
		crmProvider:         crmProvider,
		userRepo:            userRepo,
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

	// Use superadmin context for provisioning (worker has no user session)
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	// Call the provisioning service to process this specific registration
	err := h.provisioningService.ProvisionByCheckoutSession(adminCtx, payload.CheckoutSessionID)
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

	// Use superadmin context for reconciliation (worker has no user session)
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	// Find stuck registrations and get critical ones for alerting
	result, err := h.provisioningService.ReconcileStuckProvisioning(adminCtx)
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

// HandleCourseExport processes a course export task.
// This is called when a course export is requested.
func (h *Handlers) HandleCourseExport(ctx context.Context, t *asynq.Task) error {
	var payload worker.CourseExportPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeCourseExport,
		"exportID", payload.ExportID,
		"tenantID", payload.TenantID,
	)
	log.Info("processing course export task")

	// Only process if service is available
	if h.exportService == nil {
		log.Warn("export service not available, skipping task")
		return nil
	}

	// Set up tenant context from payload for RLS isolation
	tenantCtx := tenant.WithTenantID(ctx, parseUUID(payload.TenantID))

	// Call the export service to process this specific export
	err := h.exportService.ProcessExport(tenantCtx, parseUUID(payload.ExportID))
	if err != nil {
		log.Error("failed to process course export", "error", err)
		return err
	}

	log.Info("course export completed")
	return nil
}

// HandleCourseExportPoll processes course export jobs by polling the database.
// This is called periodically by the scheduler.
func (h *Handlers) HandleCourseExportPoll(ctx context.Context, t *asynq.Task) error {
	log := h.logger.With("task", worker.TypeCourseExportPoll)
	log.Debug("course export poll task started")

	// Only process if service is available
	if h.exportService == nil {
		log.Warn("export service not available, skipping poll")
		return nil
	}

	// Process next pending export (uses FOR UPDATE SKIP LOCKED in DB)
	err := h.exportService.ProcessNextPending(ctx)
	if err != nil {
		log.Error("failed to process course export", "error", err)
		return err
	}

	log.Debug("course export poll task completed")
	return nil
}

// parseUUID parses a UUID string, returning uuid.Nil on error.
func parseUUID(s string) uuid.UUID {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil
	}
	return id
}

// HandleFeedbackSync processes a feedback sync task.
// This syncs feedback to the CRM, creating the user contact if needed.
func (h *Handlers) HandleFeedbackSync(ctx context.Context, t *asynq.Task) error {
	var payload worker.FeedbackSyncPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeFeedbackSync,
		"userID", payload.UserID,
		"feedbackType", payload.FeedbackType,
	)
	log.Info("processing feedback sync task")

	// Skip if CRM provider is not configured
	if h.crmProvider == nil {
		log.Warn("CRM provider not configured, skipping feedback sync")
		return nil
	}

	// Use superadmin context for cross-tenant operations
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	// Get user's CRM contact ID from DB
	userID := parseUUID(payload.UserID)
	crmContactID, err := h.userRepo.GetCRMContactID(adminCtx, userID)
	if err != nil {
		log.Error("failed to get CRM contact ID", "error", err)
		return err
	}

	// If no CRM contact ID, create/find the contact in CRM
	if crmContactID == "" {
		// Parse name into first/last
		firstName, lastName := splitName(payload.UserName)

		crmContactID, err = h.crmProvider.FindOrCreateContact(ctx, payload.UserEmail, firstName, lastName)
		if err != nil {
			log.Error("failed to find/create CRM contact", "error", err)
			return err
		}

		// Cache the CRM contact ID
		if err := h.userRepo.UpdateCRMContactID(adminCtx, userID, crmContactID); err != nil {
			log.Warn("failed to cache CRM contact ID", "error", err)
			// Continue anyway - we have the ID for this request
		}

		log.Info("created CRM contact", "crmContactID", crmContactID)
	}

	// Create the feedback note in CRM
	err = h.crmProvider.CreateFeedbackNote(ctx, domainservice.CreateFeedbackNoteRequest{
		ContactID:    crmContactID,
		FeedbackType: payload.FeedbackType,
		Message:      payload.Message,
		PageURL:      payload.PageURL,
		UserAgent:    payload.UserAgent,
	})
	if err != nil {
		log.Error("failed to create feedback note in CRM", "error", err)
		return err
	}

	log.Info("feedback synced to CRM successfully", "crmContactID", crmContactID)
	return nil
}

// splitName splits a full name into first and last name.
func splitName(name string) (firstName, lastName string) {
	parts := strings.SplitN(strings.TrimSpace(name), " ", 2)
	firstName = parts[0]
	if len(parts) > 1 {
		lastName = parts[1]
	}
	return
}
