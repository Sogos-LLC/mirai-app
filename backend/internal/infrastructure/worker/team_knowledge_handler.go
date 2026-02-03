package worker

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/hibiken/asynq"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	appservice "github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/domain/worker"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// TeamKnowledgeHandler handles team knowledge ingestion tasks.
type TeamKnowledgeHandler struct {
	storage          storage.StorageAdapter
	extractorRegistry domainservice.ExtractorRegistry
	knowledgeService *appservice.KnowledgeSourceService
	contentEnhancer  domainservice.ContentEnhancer
	pubsub           pubsub.Publisher
	logger           domainservice.Logger
}

// NewTeamKnowledgeHandler creates a new team knowledge ingestion handler.
func NewTeamKnowledgeHandler(
	storage storage.StorageAdapter,
	extractorRegistry domainservice.ExtractorRegistry,
	knowledgeService *appservice.KnowledgeSourceService,
	contentEnhancer domainservice.ContentEnhancer,
	pubsub pubsub.Publisher,
	logger domainservice.Logger,
) *TeamKnowledgeHandler {
	return &TeamKnowledgeHandler{
		storage:          storage,
		extractorRegistry: extractorRegistry,
		knowledgeService: knowledgeService,
		contentEnhancer:  contentEnhancer,
		pubsub:           pubsub,
		logger:           logger,
	}
}

// HandleTeamKnowledgeIngestion processes a team knowledge ingestion task.
// This is called when a user uploads a file for team knowledge.
func (h *TeamKnowledgeHandler) HandleTeamKnowledgeIngestion(ctx context.Context, t *asynq.Task) error {
	var payload worker.TeamKnowledgeIngestionPayload
	if err := json.Unmarshal(t.Payload(), &payload); err != nil {
		return fmt.Errorf("failed to unmarshal payload: %w", asynq.SkipRetry)
	}

	log := h.logger.With(
		"task", worker.TypeTeamKnowledgeIngestion,
		"jobID", payload.JobID,
		"sourceID", payload.SourceID,
		"teamID", payload.TeamID,
		"filename", payload.Filename,
	)
	log.Info("processing team knowledge ingestion task")

	// Parse UUIDs
	sourceID, err := uuid.Parse(payload.SourceID)
	if err != nil {
		return fmt.Errorf("invalid source ID: %w", asynq.SkipRetry)
	}
	teamID, err := uuid.Parse(payload.TeamID)
	if err != nil {
		return fmt.Errorf("invalid team ID: %w", asynq.SkipRetry)
	}
	tenantID, err := uuid.Parse(payload.TenantID)
	if err != nil {
		return fmt.Errorf("invalid tenant ID: %w", asynq.SkipRetry)
	}
	userID, err := uuid.Parse(payload.UserID)
	if err != nil {
		return fmt.Errorf("invalid user ID: %w", asynq.SkipRetry)
	}

	// Set up tenant context for RLS isolation
	tenantCtx := tenant.WithTenantID(ctx, tenantID)

	// Publish processing status
	h.publishEvent(ctx, userID, payload.JobID, payload.SourceID, v1.IngestionStatus_INGESTION_STATUS_PROCESSING, nil, nil, int32Ptr(10))

	// Step 1: Load file from MinIO storage
	log.Info("loading file from storage", "path", payload.FilePath)
	fileContent, err := h.storage.GetContent(tenantCtx, payload.FilePath)
	if err != nil {
		log.Error("failed to load file from storage", "error", err)
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "failed to load file from storage")
	}
	h.publishEvent(ctx, userID, payload.JobID, payload.SourceID, v1.IngestionStatus_INGESTION_STATUS_PROCESSING, nil, nil, int32Ptr(20))

	// Step 2: Extract text using the appropriate extractor
	log.Info("extracting text from document")
	extractedDoc, err := h.extractorRegistry.Extract(tenantCtx, fileContent, payload.Filename, payload.ContentType)
	if err != nil {
		log.Error("failed to extract text from document", "error", err)
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "failed to extract text from document")
	}
	if extractedDoc.Text == "" {
		log.Error("extracted document has no text content")
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "document has no extractable text content")
	}
	h.publishEvent(ctx, userID, payload.JobID, payload.SourceID, v1.IngestionStatus_INGESTION_STATUS_PROCESSING, nil, nil, int32Ptr(40))

	// Step 3: Get the source to update
	source, err := h.knowledgeService.GetByID(tenantCtx, sourceID)
	if err != nil {
		log.Error("failed to get knowledge source", "error", err)
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "failed to get knowledge source")
	}

	// Ensure team_id is set
	source.TeamID = &teamID

	// Step 4: Process and index content (chunk, embed, store in Qdrant)
	log.Info("processing and indexing content")
	chunkCount, tokenCount, err := h.knowledgeService.ProcessAndIndexForTeam(tenantCtx, source, extractedDoc.Text)
	if err != nil {
		log.Error("failed to process and index content", "error", err)
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "failed to process and index content")
	}
	h.publishEvent(ctx, userID, payload.JobID, payload.SourceID, v1.IngestionStatus_INGESTION_STATUS_PROCESSING, nil, nil, int32Ptr(70))

	// Step 5: Generate AI summary with document index
	log.Info("generating AI summary")
	var summary string
	var documentIndex *entity.DocumentIndex

	if h.contentEnhancer != nil {
		// Generate summary
		summary, err = h.contentEnhancer.SummarizeContent(tenantCtx, extractedDoc.Text)
		if err != nil {
			log.Warn("failed to generate summary, using fallback", "error", err)
			// Use extracted title as fallback
			summary = extractedDoc.Title
			if summary == "" {
				summary = "Document processed successfully"
			}
		}

		// Build document index from extracted content
		documentIndex = &entity.DocumentIndex{
			Title:                extractedDoc.Title,
			MainTopics:           extractTopicsFromSections(extractedDoc.Sections),
			KeyConcepts:          []string{}, // Could be enhanced with AI in future
			EstimatedLessonCount: estimateLessonCount(chunkCount),
			ContentDepth:         estimateContentDepth(tokenCount),
		}
	} else {
		// No AI available, use basic summary
		summary = extractedDoc.Title
		if summary == "" {
			summary = "Document processed successfully"
		}
		documentIndex = &entity.DocumentIndex{
			Title:                extractedDoc.Title,
			MainTopics:           extractTopicsFromSections(extractedDoc.Sections),
			KeyConcepts:          []string{},
			EstimatedLessonCount: estimateLessonCount(chunkCount),
			ContentDepth:         estimateContentDepth(tokenCount),
		}
	}
	h.publishEvent(ctx, userID, payload.JobID, payload.SourceID, v1.IngestionStatus_INGESTION_STATUS_PROCESSING, nil, nil, int32Ptr(90))

	// Step 6: Update knowledge source status to ready
	log.Info("updating knowledge source status to ready")
	updatedSource, err := h.knowledgeService.UpdateStatusWithSummary(
		tenantCtx,
		sourceID,
		valueobject.KnowledgeSourceStatusReady,
		nil,
		chunkCount,
		summary,
		tokenCount,
	)
	if err != nil {
		log.Error("failed to update source status", "error", err)
		return h.failIngestion(ctx, tenantCtx, sourceID, userID, payload.JobID, payload.SourceID, "failed to update source status")
	}

	// Also update the document index
	if documentIndex != nil {
		_, err = h.knowledgeService.UpdateDocumentIndex(tenantCtx, sourceID, summary, documentIndex)
		if err != nil {
			log.Warn("failed to update document index", "error", err)
			// Non-fatal, continue
		}
	}

	// Step 7: Publish completion event with the updated source
	log.Info("team knowledge ingestion completed",
		"chunkCount", chunkCount,
		"tokenCount", tokenCount,
	)
	h.publishCompletionEvent(ctx, userID, payload.JobID, payload.SourceID, updatedSource)

	return nil
}

// failIngestion handles ingestion failure by updating status and publishing error event.
func (h *TeamKnowledgeHandler) failIngestion(
	ctx context.Context,
	tenantCtx context.Context,
	sourceID uuid.UUID,
	userID uuid.UUID,
	jobID string,
	sourceIDStr string,
	errorMsg string,
) error {
	// Update source status to failed
	_, err := h.knowledgeService.UpdateStatusWithSummary(
		tenantCtx,
		sourceID,
		valueobject.KnowledgeSourceStatusFailed,
		&errorMsg,
		0,
		"",
		0,
	)
	if err != nil {
		h.logger.Error("failed to update source status to failed", "error", err, "sourceID", sourceID)
	}

	// Publish failure event
	h.publishEvent(ctx, userID, jobID, sourceIDStr, v1.IngestionStatus_INGESTION_STATUS_FAILED, &errorMsg, nil, nil)

	// Return nil to not retry - we've handled the failure
	return nil
}

// publishEvent publishes an ingestion status event.
func (h *TeamKnowledgeHandler) publishEvent(
	ctx context.Context,
	userID uuid.UUID,
	jobID string,
	sourceID string,
	status v1.IngestionStatus,
	errorMsg *string,
	source *v1.KnowledgeSource,
	progressPercent *int32,
) {
	if h.pubsub == nil {
		return
	}

	event := &pubsub.IngestionEvent{
		JobID:           jobID,
		SourceID:        sourceID,
		Status:          status,
		ErrorMessage:    errorMsg,
		Source:          source,
		ProgressPercent: progressPercent,
	}

	if err := h.pubsub.PublishIngestionEvent(ctx, userID, event); err != nil {
		h.logger.Warn("failed to publish ingestion event",
			"error", err,
			"userID", userID,
			"jobID", jobID,
			"status", status.String(),
		)
	}
}

// publishCompletionEvent publishes a completion event with the full source.
func (h *TeamKnowledgeHandler) publishCompletionEvent(
	ctx context.Context,
	userID uuid.UUID,
	jobID string,
	sourceIDStr string,
	source *entity.KnowledgeSource,
) {
	if h.pubsub == nil {
		return
	}

	// Convert domain entity to proto
	protoSource := entityToProto(source)

	h.publishEvent(ctx, userID, jobID, sourceIDStr, v1.IngestionStatus_INGESTION_STATUS_COMPLETED, nil, protoSource, int32Ptr(100))
}

// Helper functions

func int32Ptr(i int32) *int32 {
	return &i
}

func extractTopicsFromSections(sections []domainservice.DocumentSection) []string {
	topics := make([]string, 0, len(sections))
	for _, section := range sections {
		if section.Title != "" {
			topics = append(topics, section.Title)
		}
	}
	return topics
}

func estimateLessonCount(chunkCount int32) int {
	// Rough estimate: 3-5 chunks per lesson
	lessons := int(chunkCount) / 4
	if lessons < 1 {
		lessons = 1
	}
	if lessons > 20 {
		lessons = 20
	}
	return lessons
}

func estimateContentDepth(tokenCount int32) string {
	switch {
	case tokenCount < 1000:
		return "basic"
	case tokenCount < 5000:
		return "intermediate"
	default:
		return "advanced"
	}
}

// entityToProto converts a domain KnowledgeSource to proto KnowledgeSource.
func entityToProto(source *entity.KnowledgeSource) *v1.KnowledgeSource {
	if source == nil {
		return nil
	}

	pb := &v1.KnowledgeSource{
		Id:         source.ID.String(),
		TenantId:   source.TenantID.String(),
		Type:       v1.KnowledgeSourceType(v1.KnowledgeSourceType_value["KNOWLEDGE_SOURCE_TYPE_"+stringToEnumCase(string(source.Type))]),
		Status:     v1.KnowledgeSourceStatus(v1.KnowledgeSourceStatus_value["KNOWLEDGE_SOURCE_STATUS_"+stringToEnumCase(string(source.Status))]),
		Name:       source.Name,
		ChunkCount: source.ChunkCount,
	}

	if source.CourseID != nil {
		pb.CourseId = source.CourseID.String()
	}
	if source.SessionID != nil {
		pb.SessionId = source.SessionID
	}
	if source.TeamID != nil {
		teamID := source.TeamID.String()
		pb.TeamId = &teamID
	}
	if source.FilePath != nil {
		pb.FilePath = *source.FilePath
	}
	if source.MimeType != nil {
		pb.MimeType = *source.MimeType
	}
	if source.FileSizeBytes != nil {
		pb.FileSizeBytes = *source.FileSizeBytes
	}
	if source.ErrorMessage != nil {
		pb.ErrorMessage = source.ErrorMessage
	}
	if source.Summary != nil {
		pb.Summary = source.Summary
	}
	if source.TokenCount != nil {
		pb.TokenCount = source.TokenCount
	}
	if source.DocumentIndex != nil {
		pb.DocumentIndex = &v1.DocumentIndex{
			Title:                source.DocumentIndex.Title,
			MainTopics:           source.DocumentIndex.MainTopics,
			KeyConcepts:          source.DocumentIndex.KeyConcepts,
			EstimatedLessonCount: int32(source.DocumentIndex.EstimatedLessonCount),
			ContentDepth:         source.DocumentIndex.ContentDepth,
		}
	}

	return pb
}

// stringToEnumCase converts a snake_case string to UPPER_CASE for enum lookup.
func stringToEnumCase(s string) string {
	result := make([]byte, 0, len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'a' && c <= 'z' {
			result = append(result, c-32) // Convert to uppercase
		} else {
			result = append(result, c)
		}
	}
	return string(result)
}
