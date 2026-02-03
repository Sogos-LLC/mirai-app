package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/hibiken/asynq"

	appservice "github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/domain/worker"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// TeamKnowledgeHandler handles team knowledge ingestion tasks.
type TeamKnowledgeHandler struct {
	teamKnowledgeService *appservice.TeamKnowledgeService
	storageAdapter       storage.StorageAdapter
}

// NewTeamKnowledgeHandler creates a new team knowledge handler.
func NewTeamKnowledgeHandler(
	teamKnowledgeService *appservice.TeamKnowledgeService,
	storageAdapter storage.StorageAdapter,
) *TeamKnowledgeHandler {
	log.Printf("[TeamKnowledgeHandler] Initializing handler")
	return &TeamKnowledgeHandler{
		teamKnowledgeService: teamKnowledgeService,
		storageAdapter:       storageAdapter,
	}
}

// HandleTeamKnowledgeIngestion processes a team knowledge ingestion task.
func (h *TeamKnowledgeHandler) HandleTeamKnowledgeIngestion(ctx context.Context, t *asynq.Task) error {
	var payload worker.TeamKnowledgeIngestionPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: failed to unmarshal payload: %v", err)
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 1: Starting processing sourceID=%s teamID=%s",
		payload.SourceID, payload.TeamID)

	// Set tenant context for RLS
	tenantCtx := tenant.WithTenantID(ctx, parseUUID(payload.TenantID))

	// Step 2: Get source from database
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 2: Fetching source from database")
	source, err := h.teamKnowledgeService.GetByID(tenantCtx, parseUUID(payload.SourceID))
	if err != nil {
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: failed to get source: %v", err)
		return err
	}
	if source == nil {
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: source not found")
		return fmt.Errorf("source not found: %s", payload.SourceID)
	}

	// Step 3: Update status to processing
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 3: Updating status to processing")
	_, err = h.teamKnowledgeService.UpdateStatus(tenantCtx, source.ID, valueobject.KnowledgeSourceStatusProcessing, nil, 0)
	if err != nil {
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: failed to update status: %v", err)
		return err
	}

	// Step 4: Download file from MinIO
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 4: Downloading file from MinIO path=%s", payload.FilePath)
	content, err := h.storageAdapter.GetContent(ctx, payload.FilePath)
	if err != nil {
		errMsg := fmt.Sprintf("failed to download file: %v", err)
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: %s", errMsg)
		h.teamKnowledgeService.UpdateStatus(tenantCtx, source.ID, valueobject.KnowledgeSourceStatusFailed, &errMsg, 0)
		return err
	}
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 4: Downloaded %d bytes", len(content))

	// Step 5: Extract text content
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 5: Extracting text content")
	textContent := string(content)
	if len(textContent) == 0 {
		errMsg := "file is empty"
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: %s", errMsg)
		h.teamKnowledgeService.UpdateStatus(tenantCtx, source.ID, valueobject.KnowledgeSourceStatusFailed, &errMsg, 0)
		return fmt.Errorf(errMsg)
	}

	// Step 6: Process and index content
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 6: Processing and indexing content (len=%d)", len(textContent))
	chunkCount, tokenCount, err := h.teamKnowledgeService.ProcessAndIndex(tenantCtx, source, textContent)
	if err != nil {
		errMsg := fmt.Sprintf("failed to process content: %v", err)
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: %s", errMsg)
		h.teamKnowledgeService.UpdateStatus(tenantCtx, source.ID, valueobject.KnowledgeSourceStatusFailed, &errMsg, 0)
		return err
	}

	// Step 7: Generate summary
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 7: Generating summary")
	summary := generateSummary(textContent, source.Name)

	// Step 8: Update status to ready
	log.Printf("[TeamKnowledgeHandler.Ingestion] Step 8: Updating status to ready (chunks=%d, tokens=%d)", chunkCount, tokenCount)
	_, err = h.teamKnowledgeService.UpdateStatusWithSummary(
		tenantCtx,
		source.ID,
		valueobject.KnowledgeSourceStatusReady,
		nil,
		chunkCount,
		summary,
		tokenCount,
	)
	if err != nil {
		log.Printf("[TeamKnowledgeHandler.Ingestion] ERROR: failed to update final status: %v", err)
		return err
	}

	log.Printf("[TeamKnowledgeHandler.Ingestion] SUCCESS: sourceID=%s chunks=%d tokens=%d",
		payload.SourceID, chunkCount, tokenCount)
	return nil
}

// generateSummary creates a brief summary of the document content.
func generateSummary(content string, name string) string {
	const maxLen = 500
	if len(content) <= maxLen {
		return fmt.Sprintf("Document '%s' contains %d characters of content.", name, len(content))
	}
	// Take first 500 chars as summary preview
	return fmt.Sprintf("Document '%s': %s...", name, content[:maxLen])
}
