package generation

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// LessonHandler processes lesson generation jobs.
type LessonHandler struct {
	jobRepo               JobRepository
	aiSettingsRepo        AISettingsRepository
	aiProviderFactory     AIProviderFactory
	contentStorage        ContentStorage
	knowledgeSearcher     KnowledgeSearcher
	teamKnowledgeSearcher TeamKnowledgeSearcher
	teamResolver          TeamResolver
	completionNotifier    CourseCompletionNotifier
	jobEventPublisher     JobEventPublisher
	logger                Logger
}

// NewLessonHandler creates a new lesson handler.
func NewLessonHandler(
	jobRepo JobRepository,
	aiSettingsRepo AISettingsRepository,
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	completionNotifier CourseCompletionNotifier,
	jobEventPublisher JobEventPublisher,
	logger Logger,
) *LessonHandler {
	return &LessonHandler{
		jobRepo:            jobRepo,
		aiSettingsRepo:     aiSettingsRepo,
		aiProviderFactory:  aiProviderFactory,
		contentStorage:     contentStorage,
		completionNotifier: completionNotifier,
		jobEventPublisher:  jobEventPublisher,
		logger:             logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher.
func (h *LessonHandler) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	h.knowledgeSearcher = searcher
}

// SetTeamKnowledgeSearcher sets the team knowledge searcher.
func (h *LessonHandler) SetTeamKnowledgeSearcher(searcher TeamKnowledgeSearcher) {
	h.teamKnowledgeSearcher = searcher
}

// SetTeamResolver sets the team resolver.
func (h *LessonHandler) SetTeamResolver(resolver TeamResolver) {
	h.teamResolver = resolver
}

// Process processes a lesson generation job.
func (h *LessonHandler) Process(ctx context.Context, job *entity.GenerationJob) error {
	log := h.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Parse lesson info from result path
	var lessonInfo struct {
		SectionIndex int    `json:"sectionIndex"`
		LessonIndex  int    `json:"lessonIndex"`
		SectionID    string `json:"sectionId"`
	}
	if job.ResultPath != nil {
		_ = json.Unmarshal([]byte(*job.ResultPath), &lessonInfo)
	}

	// Update progress
	progressMsg := "Generating lesson content with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 30
	_ = h.jobRepo.Update(ctx, job)

	// Read course content
	content, err := h.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to read course content")
	}

	// Get lesson info from outline
	if lessonInfo.SectionIndex >= len(content.Content.Sections) {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "section index out of range")
	}

	section := content.Content.Sections[lessonInfo.SectionIndex]
	sectionTitle, _ := section["title"].(string)

	var lessons []interface{}
	if l, ok := section["lessons"].([]interface{}); ok {
		lessons = l
	}
	if lessonInfo.LessonIndex >= len(lessons) {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "lesson index out of range")
	}

	lessonData, ok := lessons[lessonInfo.LessonIndex].(map[string]interface{})
	if !ok {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "invalid lesson data")
	}

	lessonTitle, _ := lessonData["title"].(string)
	lessonDesc, _ := lessonData["description"].(string)
	lessonID, _ := lessonData["id"].(string)

	var learningObjectives []string
	if los, ok := lessonData["learningObjectives"].([]interface{}); ok {
		for _, lo := range los {
			if str, ok := lo.(string); ok {
				learningObjectives = append(learningObjectives, str)
			}
		}
	}

	isLastInSection, _ := lessonData["isLastInSection"].(bool)
	isLastInCourse, _ := lessonData["isLastInCourse"].(bool)

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Extract personas
	smeKnowledge, targetAudience := ExtractPersonas(content.WizardData)

	// Get additional context
	var lessonAdditionalContext string
	if content.WizardData != nil && content.WizardData.AdditionalContext != "" {
		lessonAdditionalContext = content.WizardData.AdditionalContext
	}

	// Check Internal Data Only mode and get RAG context
	var internalDataOnly bool
	var ragContext []service.RAGChunkInput
	if content.WizardData != nil && content.WizardData.InternalDataOnly {
		internalDataOnly = true
		log.Info("Internal Data Only mode enabled, fetching RAG context for lesson", "lessonTitle", lessonTitle)
		ragContext = h.fetchLessonRAGContext(ctx, job, lessonTitle, lessonDesc, learningObjectives, log)
	}

	// Generate lesson content
	lessonResult, err := aiProvider.GenerateLessonContent(ctx, service.GenerateLessonRequest{
		CourseTitle:        content.Settings.Title,
		SectionTitle:       sectionTitle,
		LessonTitle:        lessonTitle,
		LessonDescription:  lessonDesc,
		LearningObjectives: learningObjectives,
		SMEKnowledge:       smeKnowledge,
		TargetAudience:     targetAudience,
		IsLastInSection:    isLastInSection,
		IsLastInCourse:     isLastInCourse,
		AdditionalContext:  lessonAdditionalContext,
		InternalDataOnly:   internalDataOnly,
		RAGContext:         ragContext,
	})
	if err != nil {
		log.Error("AI lesson generation failed", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("AI generation failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing lesson content..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = lessonResult.TokensUsed
	_ = h.jobRepo.Update(ctx, job)

	// Build S3 lesson with components
	now := time.Now()
	s3Components := make([]LessonComponent, len(lessonResult.Components))
	for i, compResult := range lessonResult.Components {
		s3Components[i] = LessonComponent{
			ID:                   uuid.New().String(),
			Type:                 compResult.Type,
			Order:                int32(compResult.Order),
			ContentJSON:          json.RawMessage(compResult.ContentJSON),
			LearningObjectiveIDs: []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		}
	}

	s3Lesson := GeneratedLesson{
		ID:              lessonID,
		SectionID:       lessonInfo.SectionID,
		OutlineLessonID: lessonID,
		Title:           lessonTitle,
		Components:      s3Components,
		GeneratedAt:     now,
	}
	if lessonResult.SegueText != "" {
		s3Lesson.SegueText = &lessonResult.SegueText
	}

	// Atomically add lesson to content
	var atomicContent S3CourseContent
	if err := h.contentStorage.UpdateCourseContentAtomic(
		ctx,
		job.TenantID,
		*job.CourseID,
		&atomicContent,
		func() error {
			UpsertLesson(&atomicContent, s3Lesson)
			return nil
		},
	); err != nil {
		log.Error("failed to atomically store lesson content", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to store lesson content")
	}

	// Update token usage
	_ = h.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, lessonResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	job.ResultPath = nil
	progressMsg = "Lesson generation complete"
	job.ProgressMessage = &progressMsg
	_ = h.jobRepo.Update(ctx, job)

	PublishJobEvent(ctx, h.jobEventPublisher, "completed", job)

	log.Info("lesson generation completed", "tokensUsed", lessonResult.TokensUsed)

	// Check parent job completion
	if job.ParentJobID != nil {
		if err := h.checkAndCompleteParentJob(ctx, *job.ParentJobID); err != nil {
			log.Error("failed to check parent job completion", "error", err)
		}
	}

	return nil
}

func (h *LessonHandler) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (h *LessonHandler) fetchLessonRAGContext(
	ctx context.Context,
	job *entity.GenerationJob,
	lessonTitle, lessonDesc string,
	learningObjectives []string,
	log Logger,
) []service.RAGChunkInput {
	var ragContext []service.RAGChunkInput

	if h.knowledgeSearcher != nil && job.CourseID != nil {
		searchQueries := []string{lessonTitle + " " + lessonDesc}
		for _, obj := range learningObjectives {
			searchQueries = append(searchQueries, obj)
		}

		seenChunks := make(map[string]bool)
		for _, query := range searchQueries {
			chunks, err := h.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 5)
			if err != nil {
				log.Warn("RAG search failed for lesson", "query", query, "error", err)
				continue
			}
			for _, chunk := range chunks {
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				if !seenChunks[hashKey] {
					seenChunks[hashKey] = true
					chunkIndex := 0
					if chunk.ChunkIndex != nil {
						chunkIndex = int(*chunk.ChunkIndex)
					}
					ragContext = append(ragContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      chunkIndex,
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "course",
					})
				}
			}
		}
		log.Info("Fetched RAG context for lesson", "lessonTitle", lessonTitle, "chunkCount", len(ragContext))
	}

	// Also search team knowledge
	if h.teamKnowledgeSearcher != nil && h.teamResolver != nil {
		team, err := h.teamResolver.GetTeamByTenant(ctx, job.TenantID)
		if err != nil {
			log.Warn("failed to resolve team for tenant", "error", err)
		} else if team != nil {
			log.Info("[AI.RAG] Searching team knowledge for lesson", "teamID", team.ID, "lessonTitle", lessonTitle)

			teamSearchQueries := []string{lessonTitle + " " + lessonDesc}
			for _, obj := range learningObjectives {
				teamSearchQueries = append(teamSearchQueries, obj)
			}

			teamSeenChunks := make(map[string]bool)
			for _, chunk := range ragContext {
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				teamSeenChunks[hashKey] = true
			}

			for _, query := range teamSearchQueries {
				chunks, err := h.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, query, 5)
				if err != nil {
					log.Warn("Team RAG search failed for lesson", "query", query, "error", err)
					continue
				}
				for _, chunk := range chunks {
					hashKey := chunk.Content
					if len(hashKey) > 100 {
						hashKey = hashKey[:100]
					}
					if teamSeenChunks[hashKey] {
						continue
					}
					teamSeenChunks[hashKey] = true
					chunkIndex := 0
					if chunk.ChunkIndex != nil {
						chunkIndex = int(*chunk.ChunkIndex)
					}
					ragContext = append(ragContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      chunkIndex,
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "team",
					})
				}
			}
			log.Info("[AI.RAG] Added team knowledge context for lesson", "totalChunks", len(ragContext))
		}
	}

	return ragContext
}

func (h *LessonHandler) checkAndCompleteParentJob(ctx context.Context, parentJobID uuid.UUID) error {
	log := h.logger.With("parentJobID", parentJobID)

	result, err := h.jobRepo.FinalizeParentJob(
		ctx,
		parentJobID,
		valueobject.GenerationJobStatusCompleted.String(),
		valueobject.GenerationJobStatusFailed.String(),
		"All lessons generated successfully",
	)
	if err != nil {
		return fmt.Errorf("failed to finalize parent job: %w", err)
	}

	if result == nil {
		return nil
	}

	if !result.WasFinalized && result.AllComplete {
		log.Info("parent job already finalized by another worker")
		return nil
	}

	if !result.AllComplete {
		parentJob, err := h.jobRepo.GetByID(ctx, parentJobID)
		if err != nil || parentJob == nil {
			return nil
		}

		doneCount := result.CompletedCount + result.FailedCount
		progressPercent := int32(10)
		if result.TotalCount > 0 {
			progressPercent = int32(10 + (90 * doneCount / result.TotalCount))
		}

		progressMsg := fmt.Sprintf("Generated %d of %d lessons...", result.CompletedCount, result.TotalCount)
		parentJob.ProgressPercent = progressPercent
		parentJob.ProgressMessage = &progressMsg
		parentJob.TokensUsed = result.TotalTokens
		_ = h.jobRepo.Update(ctx, parentJob)
		log.Info("parent job progress update", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount)
		return nil
	}

	log.Info("parent job finalized", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount)

	// Log failed jobs for debugging
	if result.FailedCount > 0 {
		failedJobs, err := h.jobRepo.ListByParentID(ctx, parentJobID)
		if err == nil {
			for _, job := range failedJobs {
				if job.Status == valueobject.GenerationJobStatusFailed {
					errMsg := ""
					if job.ErrorMessage != nil {
						errMsg = *job.ErrorMessage
					}
					log.Error("FAILED CHILD JOB", "childJobID", job.ID, "errorMessage", errMsg, "resultPath", job.ResultPath)
				}
			}
		}
	}

	parentJob, err := h.jobRepo.GetByID(ctx, parentJobID)
	if err != nil || parentJob == nil || parentJob.CourseID == nil {
		return nil
	}

	// Publish completion event
	if result.FailedCount > 0 {
		PublishJobEvent(ctx, h.jobEventPublisher, "failed", parentJob)
	} else {
		PublishJobEvent(ctx, h.jobEventPublisher, "completed", parentJob)
	}

	// Send notification
	courseTitle := "Your Course"
	if result.FailedCount > 0 {
		errMsg := fmt.Sprintf("%d lesson(s) failed to generate", result.FailedCount)
		if h.completionNotifier != nil {
			_ = h.completionNotifier.NotifyCourseFailed(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle, errMsg)
		}
	} else {
		if h.completionNotifier != nil {
			_ = h.completionNotifier.NotifyCourseComplete(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle)
		}
	}

	return nil
}
