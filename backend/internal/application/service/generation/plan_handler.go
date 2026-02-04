package generation

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
)

// VectorDBClient provides vector database access for document retrieval.
type VectorDBClient interface {
	ScrollByFilter(ctx context.Context, collection string, filter map[string]interface{}, limit int) ([]vectordb.ScrollResult, error)
}

// PlanNotifier sends notifications when plan generation completes.
type PlanNotifier interface {
	NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error
	NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// PlanHandler processes course planning jobs.
// It reassembles full documents from Qdrant, analyzes each via Gemini,
// then generates a structured course plan with targeted search terms.
type PlanHandler struct {
	jobRepo           JobRepository
	aiSettingsRepo    AISettingsRepository
	aiProviderFactory AIProviderFactory
	contentStorage    ContentStorage
	knowledgeSearcher KnowledgeSearcher
	vectorDB          VectorDBClient
	jobEventPublisher JobEventPublisher
	logger            Logger
}

// NewPlanHandler creates a new plan handler.
func NewPlanHandler(
	jobRepo JobRepository,
	aiSettingsRepo AISettingsRepository,
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	jobEventPublisher JobEventPublisher,
	logger Logger,
) *PlanHandler {
	return &PlanHandler{
		jobRepo:           jobRepo,
		aiSettingsRepo:    aiSettingsRepo,
		aiProviderFactory: aiProviderFactory,
		contentStorage:    contentStorage,
		jobEventPublisher: jobEventPublisher,
		logger:            logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher for listing sources.
func (h *PlanHandler) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	h.knowledgeSearcher = searcher
}

// SetVectorDB sets the vector database client for document retrieval.
func (h *PlanHandler) SetVectorDB(client VectorDBClient) {
	h.vectorDB = client
}

// Process processes a course planning job.
func (h *PlanHandler) Process(ctx context.Context, job *entity.GenerationJob) error {
	log := h.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Update progress
	progressMsg := "Analyzing knowledge sources..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 5
	_ = h.jobRepo.Update(ctx, job)
	PublishJobEvent(ctx, h.jobEventPublisher, "updated", job)

	// Read course content
	content, err := h.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		log.Error("failed to read course content", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to read course content")
	}

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Collect all selected knowledge source IDs
	selectedDocIDs := GetSelectedDocIDs(content.WizardData)
	if len(selectedDocIDs) == 0 {
		log.Warn("no knowledge sources selected, nothing to plan")
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "no knowledge sources selected for planning")
	}

	// Get knowledge source metadata
	sources, err := h.knowledgeSearcher.ListByCourse(ctx, *job.CourseID)
	if err != nil {
		log.Error("failed to list knowledge sources", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to list knowledge sources")
	}

	// Filter to selected sources only
	selectedSet := make(map[string]bool)
	for _, id := range selectedDocIDs {
		selectedSet[id] = true
	}

	var selectedSources []*entity.KnowledgeSource
	for _, s := range sources {
		if selectedSet[s.ID.String()] {
			selectedSources = append(selectedSources, s)
		}
	}

	log.Info("[Plan] Starting document analysis",
		"selectedCount", len(selectedSources),
		"totalSources", len(sources),
	)

	// Stage 1: Analyze each document
	var totalTokensUsed int64
	var analyses []service.AnalyzeDocumentResult
	var analysesForStorage []DocumentAnalysis

	for i, source := range selectedSources {
		if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
			return nil
		}

		progressPct := int32(10 + (40 * i / len(selectedSources)))
		progressMsg := fmt.Sprintf("Analyzing document %d of %d: %s...", i+1, len(selectedSources), source.Name)
		job.ProgressPercent = progressPct
		job.ProgressMessage = &progressMsg
		_ = h.jobRepo.Update(ctx, job)
		PublishJobEvent(ctx, h.jobEventPublisher, "updated", job)

		// Reassemble full document from Qdrant chunks
		docText, chunkCount, err := h.reassembleDocument(ctx, source.ID)
		if err != nil {
			log.Error("failed to reassemble document", "sourceID", source.ID, "error", err)
			continue // Skip this source, don't fail the entire job
		}

		log.Info("[Plan] Document reassembled",
			"sourceID", source.ID,
			"sourceName", source.Name,
			"chunkCount", chunkCount,
			"textLen", len(docText),
		)

		// Analyze with Gemini
		analysisResult, err := aiProvider.AnalyzeDocument(ctx, service.AnalyzeDocumentRequest{
			SourceID:       source.ID.String(),
			SourceName:     source.Name,
			DocumentText:   docText,
			CourseTitle:    content.Settings.Title,
			DesiredOutcome: content.Settings.DesiredOutcome,
		})
		if err != nil {
			log.Error("failed to analyze document", "sourceID", source.ID, "error", err)
			continue
		}

		totalTokensUsed += analysisResult.TokensUsed
		analyses = append(analyses, *analysisResult)

		// Convert to storage format
		sectionHints := make([]SectionHint, len(analysisResult.SectionHints))
		for j, hint := range analysisResult.SectionHints {
			sectionHints[j] = SectionHint{
				TopicName:   hint.TopicName,
				SearchTerms: hint.SearchTerms,
				KeyPoints:   hint.KeyPoints,
			}
		}

		analysesForStorage = append(analysesForStorage, DocumentAnalysis{
			SourceID:     source.ID.String(),
			SourceName:   source.Name,
			Summary:      analysisResult.Summary,
			MainTopics:   analysisResult.MainTopics,
			KeyFacts:     analysisResult.KeyFacts,
			ContentDepth: analysisResult.ContentDepth,
			SectionHints: sectionHints,
		})

		log.Info("[Plan] Document analyzed",
			"sourceID", source.ID,
			"topics", len(analysisResult.MainTopics),
			"facts", len(analysisResult.KeyFacts),
			"hints", len(analysisResult.SectionHints),
			"tokens", analysisResult.TokensUsed,
		)
	}

	if len(analyses) == 0 {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "no documents could be analyzed")
	}

	// Stage 2: Generate course plan
	progressMsg = "Creating course plan from document analysis..."
	job.ProgressPercent = 60
	job.ProgressMessage = &progressMsg
	_ = h.jobRepo.Update(ctx, job)
	PublishJobEvent(ctx, h.jobEventPublisher, "updated", job)

	smeKnowledge, targetAudience := ExtractPersonas(content.WizardData)
	additionalContext := ""
	if content.WizardData != nil {
		if content.WizardData.AdditionalContext != "" {
			additionalContext = content.WizardData.AdditionalContext
		} else {
			additionalContext = content.WizardData.DesiredOutcomes
		}
	}

	planResult, err := aiProvider.GenerateCoursePlan(ctx, service.GenerateCoursePlanRequest{
		CourseTitle:       content.Settings.Title,
		DesiredOutcome:    content.Settings.DesiredOutcome,
		DocumentAnalyses:  analyses,
		SMEKnowledge:      smeKnowledge,
		TargetAudience:    targetAudience,
		AdditionalContext: additionalContext,
		InternalDataOnly:  content.WizardData != nil && content.WizardData.InternalDataOnly,
	})
	if err != nil {
		log.Error("failed to generate course plan", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to generate course plan: %v", err))
	}

	totalTokensUsed += planResult.TokensUsed

	// Convert plan result to storage format
	plannedSections := make([]PlannedSection, len(planResult.Sections))
	totalLessons := 0
	for i, s := range planResult.Sections {
		lessons := make([]PlannedLesson, len(s.Lessons))
		for j, l := range s.Lessons {
			lessons[j] = PlannedLesson{
				Title:         l.Title,
				Description:   l.Description,
				SearchTerms:   l.SearchTerms,
				LearningGoals: l.LearningGoals,
			}
		}
		totalLessons += len(lessons)

		plannedSections[i] = PlannedSection{
			Title:       s.Title,
			Description: s.Description,
			SearchTerms: s.SearchTerms,
			SourceIDs:   s.SourceIDs,
			Lessons:     lessons,
			Rationale:   s.Rationale,
		}
	}

	// Store the plan in S3CourseContent
	progressMsg = "Saving course plan..."
	job.ProgressPercent = 90
	job.ProgressMessage = &progressMsg
	_ = h.jobRepo.Update(ctx, job)
	PublishJobEvent(ctx, h.jobEventPublisher, "updated", job)

	content.CoursePlan = &CoursePlan{
		DocumentAnalyses: analysesForStorage,
		PlannedSections:  plannedSections,
		Status:           "pending_review",
		GeneratedAt:      time.Now(),
		TokensUsed:       totalTokensUsed,
	}

	if err := h.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		log.Error("failed to write course content", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to save course plan")
	}

	// Increment token usage
	if h.aiSettingsRepo != nil {
		_ = h.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, totalTokensUsed)
	}

	// Complete the job
	now := time.Now()
	job.Status = "completed"
	job.ProgressPercent = 100
	completeMsg := "Course plan ready for review"
	job.ProgressMessage = &completeMsg
	job.CompletedAt = &now
	job.TokensUsed = totalTokensUsed
	if err := h.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to complete job", "error", err)
	}

	PublishJobEvent(ctx, h.jobEventPublisher, "completed", job)

	log.Info("[Plan] Course plan generated",
		"sections", len(plannedSections),
		"totalLessons", totalLessons,
		"docsAnalyzed", len(analyses),
		"tokensUsed", totalTokensUsed,
	)

	return nil
}

// reassembleDocument retrieves all chunks for a source from Qdrant and concatenates them.
func (h *PlanHandler) reassembleDocument(ctx context.Context, sourceID uuid.UUID) (string, int, error) {
	if h.vectorDB == nil {
		return "", 0, fmt.Errorf("vector database client not configured")
	}

	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "source_id",
				"match": map[string]interface{}{"value": sourceID.String()},
			},
		},
	}

	results, err := h.vectorDB.ScrollByFilter(ctx, "knowledge_chunks", filter, 1000)
	if err != nil {
		return "", 0, fmt.Errorf("failed to scroll chunks: %w", err)
	}

	if len(results) == 0 {
		return "", 0, fmt.Errorf("no chunks found for source %s", sourceID)
	}

	// Sort by chunk_index
	sort.Slice(results, func(i, j int) bool {
		idxI := getChunkIndex(results[i].Payload)
		idxJ := getChunkIndex(results[j].Payload)
		return idxI < idxJ
	})

	// Concatenate content
	var sb strings.Builder
	for _, r := range results {
		content, ok := r.Payload["content"].(string)
		if ok {
			sb.WriteString(content)
		}
	}

	return sb.String(), len(results), nil
}

func getChunkIndex(payload map[string]interface{}) int {
	idx, ok := payload["chunk_index"]
	if !ok {
		return 0
	}
	switch v := idx.(type) {
	case float64:
		return int(v)
	case int:
		return v
	default:
		return 0
	}
}

func (h *PlanHandler) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (h *PlanHandler) writeCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content *S3CourseContent) error {
	return h.contentStorage.WriteCourseContent(ctx, tenantID, courseID, content)
}
