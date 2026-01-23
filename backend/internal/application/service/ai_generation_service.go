package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// AIProviderFactory creates AIProvider instances per-tenant.
type AIProviderFactory interface {
	GetProvider(ctx context.Context, tenantID uuid.UUID) (service.AIProvider, error)
}

// JobNotifier sends notifications about generation job status changes.
type JobNotifier interface {
	NotifyJobProgress(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, jobType string, status string, progress int) error
}

// CourseCompletionNotifier sends notifications when full course generation completes.
type CourseCompletionNotifier interface {
	NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error
	NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// OutlineCompletionNotifier sends notifications when outline generation completes.
type OutlineCompletionNotifier interface {
	NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error
	NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// TaskEnqueuer enqueues background tasks for processing.
type TaskEnqueuer interface {
	EnqueueAIGeneration(jobID, jobType string) error
}

// ImageStorage abstracts image storage operations.
type ImageStorage interface {
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
}

// JobEventPublisher publishes real-time job events via pub/sub.
type JobEventPublisher interface {
	PublishJobEvent(ctx context.Context, userID uuid.UUID, eventType string, job *entity.GenerationJob) error
}

// KnowledgeSearcher provides RAG search capabilities for internal data only mode.
type KnowledgeSearcher interface {
	SearchKnowledge(ctx context.Context, courseID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error)
}

// AIGenerationService handles AI-powered content generation.
// All course content is stored in MinIO - no PostgreSQL tables for outlines/lessons.
type AIGenerationService struct {
	userRepo           repository.UserRepository
	jobRepo            repository.GenerationJobRepository
	aiSettingsRepo     repository.TenantAISettingsRepository
	aiProviderFactory  AIProviderFactory
	notifier           JobNotifier
	completionNotifier CourseCompletionNotifier
	outlineNotifier    OutlineCompletionNotifier
	taskEnqueuer       TaskEnqueuer
	imageStorage       ImageStorage
	contentStorage     *storage.TenantAwareStorage
	jobEventPublisher  JobEventPublisher
	knowledgeSearcher  KnowledgeSearcher // For Internal Data Only RAG queries
	logger             service.Logger
}

// NewAIGenerationService creates a new AI generation service.
func NewAIGenerationService(
	userRepo repository.UserRepository,
	jobRepo repository.GenerationJobRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	aiProviderFactory AIProviderFactory,
	notifier JobNotifier,
	completionNotifier CourseCompletionNotifier,
	outlineNotifier OutlineCompletionNotifier,
	taskEnqueuer TaskEnqueuer,
	imageStorage ImageStorage,
	contentStorage *storage.TenantAwareStorage,
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:           userRepo,
		jobRepo:            jobRepo,
		aiSettingsRepo:     aiSettingsRepo,
		aiProviderFactory:  aiProviderFactory,
		notifier:           notifier,
		completionNotifier: completionNotifier,
		outlineNotifier:    outlineNotifier,
		taskEnqueuer:       taskEnqueuer,
		imageStorage:       imageStorage,
		contentStorage:     contentStorage,
		logger:             logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher for Internal Data Only mode.
func (s *AIGenerationService) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	s.knowledgeSearcher = searcher
}

// SetJobEventPublisher sets the optional job event publisher for real-time streaming.
func (s *AIGenerationService) SetJobEventPublisher(publisher JobEventPublisher) {
	s.jobEventPublisher = publisher
}

// GenerateCourseOutlineRequest contains the inputs for outline generation.
type GenerateCourseOutlineRequest struct {
	CourseID          uuid.UUID
	CourseTitle       string
	DesiredOutcome    string
	AdditionalContext string
}

// GenerateCourseOutlineResult contains the created job.
type GenerateCourseOutlineResult struct {
	Job *entity.GenerationJob
}

// GenerateCourseOutline starts a course outline generation job.
func (s *AIGenerationService) GenerateCourseOutline(ctx context.Context, kratosID uuid.UUID, req GenerateCourseOutlineRequest) (*GenerateCourseOutlineResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Create the job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeCourseOutline,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create generation job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	s.publishJobEvent(ctx, "created", job)
	log.Info("course outline generation job created", "jobID", job.ID)

	// Enqueue for immediate processing
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue job, will be picked up by poll", "error", err)
		}
	}

	return &GenerateCourseOutlineResult{Job: job}, nil
}

// ProcessOutlineGenerationJob processes an outline generation job.
func (s *AIGenerationService) ProcessOutlineGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Update progress
	progressMsg := "Generating course outline with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 40
	_ = s.jobRepo.Update(ctx, job)

	// Read course content from MinIO to get settings
	content, err := s.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		log.Error("failed to read course content", "error", err)
		return s.failJob(ctx, job, "failed to read course content")
	}

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Build SME knowledge from wizard data (only selected SMEs)
	var smeKnowledge []service.SMEKnowledgeInput
	var targetAudience service.TargetAudienceInput
	var additionalContext string

	if content.WizardData != nil {
		// Convert selected SME personas to AI input format
		selectedSMESet := make(map[string]bool)
		for _, id := range content.WizardData.SelectedSMEIDs {
			selectedSMESet[id] = true
		}
		for _, sme := range content.WizardData.SMEPersonas {
			if selectedSMESet[sme.ID] {
				smeKnowledge = append(smeKnowledge, service.SMEKnowledgeInput{
					SMEName:  sme.JobTitle,
					Domain:   strings.Join(sme.Skills, ", "),
					Summary:  fmt.Sprintf("%s. Voice: %s", sme.Description, sme.Voice),
					Keywords: sme.Skills,
				})
			}
		}

		// Convert selected audience personas to AI input format
		selectedAudienceSet := make(map[string]bool)
		for _, id := range content.WizardData.SelectedAudienceIDs {
			selectedAudienceSet[id] = true
		}
		var roles []string
		var goals []string
		var backgrounds []string
		for _, aud := range content.WizardData.AudiencePersonas {
			if selectedAudienceSet[aud.ID] {
				roles = append(roles, aud.Role)
				goals = append(goals, aud.Goals...)
				backgrounds = append(backgrounds, fmt.Sprintf("%s: %s", aud.Name, aud.Description))
			}
		}
		if len(roles) > 0 {
			targetAudience = service.TargetAudienceInput{
				Role:              strings.Join(roles, ", "),
				LearningGoals:     goals,
				TypicalBackground: strings.Join(backgrounds, "; "),
			}
		}

		// Use user's additional context if provided, otherwise fall back to desired outcomes
		if content.WizardData.AdditionalContext != "" {
			additionalContext = content.WizardData.AdditionalContext
		} else {
			additionalContext = content.WizardData.DesiredOutcomes
		}
	}

	// Build outline request
	outlineRequest := service.GenerateOutlineRequest{
		CourseTitle:       content.Settings.Title,
		DesiredOutcome:    content.Settings.DesiredOutcome,
		SMEKnowledge:      smeKnowledge,
		TargetAudience:    targetAudience,
		AdditionalContext: additionalContext,
	}

	// Handle Internal Data Only mode - fetch RAG context
	if content.WizardData != nil && content.WizardData.InternalDataOnly {
		outlineRequest.InternalDataOnly = true
		log.Info("Internal Data Only mode enabled, fetching RAG context")

		if s.knowledgeSearcher != nil {
			// Fetch knowledge sources for the course to get document indices
			sources, err := s.knowledgeSearcher.ListByCourse(ctx, *job.CourseID)
			if err != nil {
				log.Warn("failed to list knowledge sources", "error", err)
			} else {
				// Build document indices from sources
				for _, src := range sources {
					if src.DocumentIndex != nil {
						outlineRequest.DocumentIndices = append(outlineRequest.DocumentIndices, service.DocumentIndexInput{
							SourceID:             src.ID.String(),
							SourceName:           src.Name,
							Title:                src.DocumentIndex.Title,
							MainTopics:           src.DocumentIndex.MainTopics,
							KeyConcepts:          src.DocumentIndex.KeyConcepts,
							EstimatedLessonCount: src.DocumentIndex.EstimatedLessonCount,
							ContentDepth:         src.DocumentIndex.ContentDepth,
						})
					}
				}

				// Perform RAG search for course content
				// Use course title and desired outcomes as initial queries
				queries := []string{
					content.Settings.Title,
					content.Settings.DesiredOutcome,
				}
				if additionalContext != "" {
					queries = append(queries, additionalContext)
				}

				seenChunks := make(map[string]bool)
				for _, query := range queries {
					chunks, err := s.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 10)
					if err != nil {
						log.Warn("RAG search failed", "query", query, "error", err)
						continue
					}
					for _, chunk := range chunks {
						// Deduplicate chunks
						if seenChunks[chunk.ID] {
							continue
						}
						seenChunks[chunk.ID] = true
						outlineRequest.RAGContext = append(outlineRequest.RAGContext, service.RAGChunkInput{
							SourceID:        chunk.SourceID.String(),
							SourceName:      chunk.SourceName,
							Content:         chunk.Content,
							ChunkIndex:      int(*chunk.ChunkIndex),
							SimilarityScore: chunk.SimilarityScore,
						})
					}
				}
				log.Info("RAG context retrieved", "documentIndices", len(outlineRequest.DocumentIndices), "chunks", len(outlineRequest.RAGContext))
			}
		} else {
			log.Warn("Internal Data Only mode enabled but no knowledge searcher configured")
		}
	}

	// Generate outline with AI
	outlineResult, err := aiProvider.GenerateCourseOutline(ctx, outlineRequest)
	if err != nil {
		log.Error("AI outline generation failed", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("AI generation failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing outline..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = outlineResult.TokensUsed
	_ = s.jobRepo.Update(ctx, job)

	// Convert AI result to content sections format
	sections := make([]map[string]any, 0, len(outlineResult.Sections))
	totalLessons := 0
	for sIdx, sectionResult := range outlineResult.Sections {
		lessons := make([]map[string]any, 0, len(sectionResult.Lessons))
		for lIdx, lessonResult := range sectionResult.Lessons {
			lesson := map[string]any{
				"id":                       uuid.New().String(),
				"title":                    lessonResult.Title,
				"description":              lessonResult.Description,
				"order":                    lIdx + 1,
				"estimatedDurationMinutes": lessonResult.EstimatedDurationMinutes,
				"learningObjectives":       lessonResult.LearningObjectives,
				"isLastInSection":          lessonResult.IsLastInSection,
				"isLastInCourse":           lessonResult.IsLastInCourse,
			}
			lessons = append(lessons, lesson)
			totalLessons++
		}

		section := map[string]any{
			"id":          uuid.New().String(),
			"title":       sectionResult.Title,
			"description": sectionResult.Description,
			"order":       sIdx + 1,
			"lessons":     lessons,
		}
		sections = append(sections, section)
	}

	// Update content with generated outline
	content.Content.Sections = sections

	// Write updated content back to MinIO
	if err := s.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		log.Error("failed to write outline to MinIO", "error", err)
		return s.failJob(ctx, job, "failed to store outline")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, outlineResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	progressMsg = "Outline generation complete"
	job.ProgressMessage = &progressMsg
	_ = s.jobRepo.Update(ctx, job)

	s.publishJobEvent(ctx, "completed", job)

	// Send notification
	if s.outlineNotifier != nil {
		_ = s.outlineNotifier.NotifyOutlineReady(ctx, job.CreatedByUserID, *job.CourseID, content.Settings.Title, len(sections), totalLessons)
	}

	log.Info("outline generation completed", "tokensUsed", outlineResult.TokensUsed, "sections", len(sections), "lessons", totalLessons)
	return nil
}

// GenerateAllLessonsResult contains the created job.
type GenerateAllLessonsResult struct {
	Job *entity.GenerationJob
}

// GenerateAllLessons starts lesson content generation jobs for all lessons in the course.
func (s *AIGenerationService) GenerateAllLessons(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*GenerateAllLessonsResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", courseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Check for existing active full_course job for this course
	fullCourseType := valueobject.GenerationJobTypeFullCourse
	existingJobs, err := s.jobRepo.List(ctx, entity.GenerationJobListOptions{
		CourseID: &courseID,
		Type:     &fullCourseType,
	})
	if err == nil {
		for _, job := range existingJobs {
			if job.Status == valueobject.GenerationJobStatusQueued || job.Status == valueobject.GenerationJobStatusProcessing {
				log.Warn("DUPLICATE_GENERATION_REQUEST: existing active job found",
					"existingJobID", job.ID,
					"existingJobStatus", job.Status,
				)
				// Return the existing job instead of creating a new one
				return &GenerateAllLessonsResult{Job: job}, nil
			}
		}
	}

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	// Count lessons from outline
	totalLessons := 0
	for _, section := range content.Content.Sections {
		if lessons, ok := section["lessons"].([]interface{}); ok {
			totalLessons += len(lessons)
		} else if lessons, ok := section["lessons"].([]map[string]any); ok {
			totalLessons += len(lessons)
		}
	}

	if totalLessons == 0 {
		return nil, domainerrors.ErrInvalidInput.WithMessage("no lessons in outline")
	}

	// Create parent job
	parentJob := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeFullCourse,
		Status:          valueobject.GenerationJobStatusProcessing,
		CourseID:        &courseID,
		ProgressPercent: 0,
		MaxRetries:      0,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	now := time.Now()
	parentJob.StartedAt = &now
	progressMsg := fmt.Sprintf("Generating %d lessons...", totalLessons)
	parentJob.ProgressMessage = &progressMsg

	if err := s.jobRepo.Create(ctx, parentJob); err != nil {
		log.Error("failed to create parent job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Create child jobs for each lesson
	var childJobs []*entity.GenerationJob
	for sIdx, section := range content.Content.Sections {
		sectionID := ""
		if id, ok := section["id"].(string); ok {
			sectionID = id
		}

		var lessons []interface{}
		if l, ok := section["lessons"].([]interface{}); ok {
			lessons = l
		} else if l, ok := section["lessons"].([]map[string]any); ok {
			for _, item := range l {
				lessons = append(lessons, item)
			}
		}

		for lIdx := range lessons {
			// Store lesson index info in result path for worker
			lessonInfo, _ := json.Marshal(map[string]any{
				"sectionIndex": sIdx,
				"lessonIndex":  lIdx,
				"sectionId":    sectionID,
			})
			resultPath := string(lessonInfo)

			childJob := &entity.GenerationJob{
				ID:              uuid.New(),
				TenantID:        *user.TenantID,
				Type:            valueobject.GenerationJobTypeLessonContent,
				Status:          valueobject.GenerationJobStatusQueued,
				CourseID:        &courseID,
				ParentJobID:     &parentJob.ID,
				ResultPath:      &resultPath,
				ProgressPercent: 0,
				MaxRetries:      3,
				CreatedByUserID: user.ID,
				CreatedAt:       time.Now(),
			}
			childJobs = append(childJobs, childJob)
		}
	}

	if err := s.jobRepo.CreateBatch(ctx, childJobs); err != nil {
		log.Error("failed to create lesson jobs", "error", err)
		_ = s.failJob(ctx, parentJob, fmt.Sprintf("failed to queue lesson jobs: %v", err))
		return nil, domainerrors.ErrInternal.WithMessage("failed to queue lesson generation jobs")
	}

	// Enqueue all child jobs to Asynq for immediate processing
	if s.taskEnqueuer != nil {
		enqueuedCount := 0
		for _, childJob := range childJobs {
			if err := s.taskEnqueuer.EnqueueAIGeneration(childJob.ID.String(), string(childJob.Type)); err != nil {
				log.Warn("failed to enqueue lesson job, will be picked up by poll", "jobID", childJob.ID, "error", err)
			} else {
				enqueuedCount++
			}
		}
		log.Info("enqueued lesson jobs to Asynq", "enqueued", enqueuedCount, "total", len(childJobs))
	}

	log.Info("queued all lesson generation jobs", "totalLessons", totalLessons, "parentJobID", parentJob.ID)
	return &GenerateAllLessonsResult{Job: parentJob}, nil
}

// ProcessLessonGenerationJob processes a lesson content generation job.
func (s *AIGenerationService) ProcessLessonGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if s.checkJobCancelled(ctx, job.ID) {
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
	_ = s.jobRepo.Update(ctx, job)

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		return s.failJob(ctx, job, "failed to read course content")
	}

	// Get lesson info from outline
	if lessonInfo.SectionIndex >= len(content.Content.Sections) {
		return s.failJob(ctx, job, "section index out of range")
	}

	section := content.Content.Sections[lessonInfo.SectionIndex]
	sectionTitle, _ := section["title"].(string)

	var lessons []interface{}
	if l, ok := section["lessons"].([]interface{}); ok {
		lessons = l
	}
	if lessonInfo.LessonIndex >= len(lessons) {
		return s.failJob(ctx, job, "lesson index out of range")
	}

	lessonData, ok := lessons[lessonInfo.LessonIndex].(map[string]interface{})
	if !ok {
		return s.failJob(ctx, job, "invalid lesson data")
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
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		return s.failJob(ctx, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Build SME knowledge from wizard data (only selected SMEs)
	var smeKnowledge []service.SMEKnowledgeInput
	var targetAudience service.TargetAudienceInput

	if content.WizardData != nil {
		// Convert selected SME personas to AI input format
		selectedSMESet := make(map[string]bool)
		for _, id := range content.WizardData.SelectedSMEIDs {
			selectedSMESet[id] = true
		}
		for _, sme := range content.WizardData.SMEPersonas {
			if selectedSMESet[sme.ID] {
				smeKnowledge = append(smeKnowledge, service.SMEKnowledgeInput{
					SMEName:  sme.JobTitle,
					Domain:   strings.Join(sme.Skills, ", "),
					Summary:  fmt.Sprintf("%s. Voice: %s", sme.Description, sme.Voice),
					Keywords: sme.Skills,
				})
			}
		}

		// Convert selected audience personas to AI input format
		selectedAudienceSet := make(map[string]bool)
		for _, id := range content.WizardData.SelectedAudienceIDs {
			selectedAudienceSet[id] = true
		}
		var roles []string
		var goals []string
		var backgrounds []string
		for _, aud := range content.WizardData.AudiencePersonas {
			if selectedAudienceSet[aud.ID] {
				roles = append(roles, aud.Role)
				goals = append(goals, aud.Goals...)
				backgrounds = append(backgrounds, fmt.Sprintf("%s: %s", aud.Name, aud.Description))
			}
		}
		if len(roles) > 0 {
			targetAudience = service.TargetAudienceInput{
				Role:              strings.Join(roles, ", "),
				LearningGoals:     goals,
				TypicalBackground: strings.Join(backgrounds, "; "),
			}
		}
	}

	// Get additional context from wizard data
	var lessonAdditionalContext string
	if content.WizardData != nil && content.WizardData.AdditionalContext != "" {
		lessonAdditionalContext = content.WizardData.AdditionalContext
	}

	// Check if Internal Data Only mode is enabled
	var internalDataOnly bool
	var ragContext []service.RAGChunkInput
	if content.WizardData != nil && content.WizardData.InternalDataOnly {
		internalDataOnly = true
		log.Info("Internal Data Only mode enabled, fetching RAG context for lesson",
			"lessonTitle", lessonTitle)

		// Fetch RAG context for the lesson using learning objectives as queries
		if s.knowledgeSearcher != nil && job.CourseID != nil {
			// Build search query from lesson title and learning objectives
			searchQueries := []string{lessonTitle + " " + lessonDesc}
			for _, obj := range learningObjectives {
				searchQueries = append(searchQueries, obj)
			}

			// Execute RAG queries and collect chunks
			seenChunks := make(map[string]bool) // Deduplicate by content hash
			for _, query := range searchQueries {
				chunks, err := s.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 5)
				if err != nil {
					log.Warn("RAG search failed for lesson", "query", query, "error", err)
					continue
				}
				for _, chunk := range chunks {
					// Simple deduplication by first 100 chars of content
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
							SourceID:        chunk.SourceID.String(),
							SourceName:      chunk.SourceName,
							Content:         chunk.Content,
							ChunkIndex:      chunkIndex,
							SimilarityScore: chunk.SimilarityScore,
						})
					}
				}
			}
			log.Info("Fetched RAG context for lesson",
				"lessonTitle", lessonTitle,
				"chunkCount", len(ragContext))
		}
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
		return s.failJob(ctx, job, fmt.Sprintf("AI generation failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing lesson content..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = lessonResult.TokensUsed
	_ = s.jobRepo.Update(ctx, job)

	// Build S3 lesson with components
	now := time.Now()
	s3Components := make([]S3LessonComponent, len(lessonResult.Components))
	for i, compResult := range lessonResult.Components {
		s3Components[i] = S3LessonComponent{
			ID:                   uuid.New().String(),
			Type:                 compResult.Type,
			Order:                int32(compResult.Order),
			ContentJSON:          json.RawMessage(compResult.ContentJSON),
			LearningObjectiveIDs: []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		}
	}

	s3Lesson := S3GeneratedLesson{
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

	// Atomically add lesson to content using optimistic concurrency.
	// This prevents race conditions when multiple lesson jobs run in parallel.
	var atomicContent S3CourseContent
	if err := s.contentStorage.UpdateCourseContentAtomic(
		ctx,
		job.TenantID,
		*job.CourseID,
		&atomicContent,
		func() error {
			upsertS3Lesson(&atomicContent, s3Lesson)
			return nil
		},
	); err != nil {
		log.Error("failed to atomically store lesson content", "error", err)
		return s.failJob(ctx, job, "failed to store lesson content")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, lessonResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	job.ResultPath = nil // Clear the temp data
	progressMsg = "Lesson generation complete"
	job.ProgressMessage = &progressMsg
	_ = s.jobRepo.Update(ctx, job)

	s.publishJobEvent(ctx, "completed", job)

	log.Info("lesson generation completed", "tokensUsed", lessonResult.TokensUsed)

	// Check parent job completion
	if job.ParentJobID != nil {
		if err := s.checkAndCompleteParentJob(ctx, *job.ParentJobID); err != nil {
			log.Error("failed to check parent job completion", "error", err)
		}
	}

	return nil
}

// checkAndCompleteParentJob checks child job progress and updates the parent job.
func (s *AIGenerationService) checkAndCompleteParentJob(ctx context.Context, parentJobID uuid.UUID) error {
	log := s.logger.With("parentJobID", parentJobID)

	result, err := s.jobRepo.FinalizeParentJob(
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
		// Update progress only
		parentJob, err := s.jobRepo.GetByID(ctx, parentJobID)
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
		_ = s.jobRepo.Update(ctx, parentJob)
		log.Info("parent job progress update", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount, "pending", result.TotalCount-doneCount)
		return nil
	}

	// Finalized - send notification
	log.Info("parent job finalized", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount, "wasFinalized", result.WasFinalized)

	// If there are failed jobs, log which ones failed for debugging
	if result.FailedCount > 0 {
		failedJobs, err := s.jobRepo.ListByParentID(ctx, parentJobID)
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

	parentJob, err := s.jobRepo.GetByID(ctx, parentJobID)
	if err != nil || parentJob == nil || parentJob.CourseID == nil {
		return nil
	}

	// Publish job completion event to frontend via SSE
	// This is critical - without this, the frontend will show the job as "processing" forever
	if result.FailedCount > 0 {
		s.publishJobEvent(ctx, "failed", parentJob)
	} else {
		s.publishJobEvent(ctx, "completed", parentJob)
	}

	courseTitle := "Your Course"
	if result.FailedCount > 0 {
		errMsg := fmt.Sprintf("%d lesson(s) failed to generate", result.FailedCount)
		if s.completionNotifier != nil {
			_ = s.completionNotifier.NotifyCourseFailed(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle, errMsg)
		}
	} else {
		if s.completionNotifier != nil {
			_ = s.completionNotifier.NotifyCourseComplete(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle)
		}
	}

	return nil
}

// ProcessComponentRegenJob processes a component regeneration job.
func (s *AIGenerationService) ProcessComponentRegenJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Parse input from result path
	var input ComponentRegenInput
	if job.ResultPath != nil {
		if err := json.Unmarshal([]byte(*job.ResultPath), &input); err != nil {
			return s.failJob(ctx, job, "failed to parse job input")
		}
	} else {
		return s.failJob(ctx, job, "job missing input data")
	}

	// Update progress
	progressMsg := "Regenerating component with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 20
	_ = s.jobRepo.Update(ctx, job)
	s.publishJobEvent(ctx, "updated", job)

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		return s.failJob(ctx, job, "failed to read course content")
	}

	// Find the generated lesson
	lessonUUID, err := uuid.Parse(input.LessonID)
	if err != nil {
		return s.failJob(ctx, job, "invalid lesson ID")
	}

	var targetLesson *S3GeneratedLesson
	var lessonIndex int
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonUUID.String() {
			targetLesson = &content.GeneratedLessons[i]
			lessonIndex = i
			break
		}
	}
	if targetLesson == nil {
		return s.failJob(ctx, job, "lesson not found")
	}

	// Find the component to regenerate
	componentUUID, err := uuid.Parse(input.ComponentID)
	if err != nil {
		return s.failJob(ctx, job, "invalid component ID")
	}

	var targetComponent *S3LessonComponent
	var componentIndex int
	for i := range targetLesson.Components {
		if targetLesson.Components[i].ID == componentUUID.String() {
			targetComponent = &targetLesson.Components[i]
			componentIndex = i
			break
		}
	}
	if targetComponent == nil {
		return s.failJob(ctx, job, "component not found")
	}

	// Update progress
	job.ProgressPercent = 40
	_ = s.jobRepo.Update(ctx, job)

	// Get AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		return s.failJob(ctx, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Build lesson context with sibling component content for better AI context
	type siblingComponentContext struct {
		Type    string `json:"type"`
		Order   int    `json:"order"`
		Content string `json:"content"`
	}
	var siblingComponents []siblingComponentContext
	for _, comp := range targetLesson.Components {
		if comp.ID != componentUUID.String() {
			siblingComponents = append(siblingComponents, siblingComponentContext{
				Type:    comp.Type,
				Order:   int(comp.Order),
				Content: string(comp.ContentJSON),
			})
		}
	}

	var lessonContext string
	if len(siblingComponents) > 0 {
		siblingJSON, _ := json.Marshal(siblingComponents)
		lessonContext = fmt.Sprintf("Course: %s\nLesson: %s\n\nOther components in this lesson (for context):\n%s",
			content.Settings.Title, targetLesson.Title, string(siblingJSON))
	} else {
		lessonContext = fmt.Sprintf("Course: %s\nLesson: %s", content.Settings.Title, targetLesson.Title)
	}

	// Build target audience from wizard data if alignment targets are provided
	var targetAudience service.TargetAudienceInput
	if content.WizardData != nil && len(input.PersonaIDs) > 0 {
		personaSet := make(map[string]bool)
		for _, id := range input.PersonaIDs {
			personaSet[id] = true
		}

		var roles []string
		var goals []string
		var backgrounds []string

		// Check SME personas
		for _, sme := range content.WizardData.SMEPersonas {
			if personaSet[sme.ID] {
				roles = append(roles, sme.JobTitle)
				backgrounds = append(backgrounds, fmt.Sprintf("SME: %s - %s", sme.JobTitle, sme.Description))
			}
		}

		// Check audience personas
		for _, aud := range content.WizardData.AudiencePersonas {
			if personaSet[aud.ID] {
				roles = append(roles, aud.Role)
				goals = append(goals, aud.Goals...)
				backgrounds = append(backgrounds, fmt.Sprintf("%s: %s", aud.Name, aud.Description))
			}
		}

		if len(roles) > 0 || len(goals) > 0 {
			targetAudience = service.TargetAudienceInput{
				Role:              strings.Join(roles, ", "),
				LearningGoals:     goals,
				TypicalBackground: strings.Join(backgrounds, "; "),
			}
		}
	}

	// Build modification prompt with learning objectives if specified
	modPrompt := input.ModificationPrompt
	if len(input.LearningObjectiveIDs) > 0 {
		// Get the learning objectives from the outline
		for _, section := range content.Content.Sections {
			if lessons, ok := section["lessons"].([]interface{}); ok {
				for _, lessonData := range lessons {
					if lesson, ok := lessonData.(map[string]interface{}); ok {
						if lesson["id"] == targetLesson.OutlineLessonID {
							if los, ok := lesson["learningObjectives"].([]interface{}); ok {
								var selectedLOs []string
								for i, lo := range los {
									loID := fmt.Sprintf("lo-%d", i)
									for _, selectedID := range input.LearningObjectiveIDs {
										if loID == selectedID {
											if loStr, ok := lo.(string); ok {
												selectedLOs = append(selectedLOs, loStr)
											}
											break
										}
									}
								}
								if len(selectedLOs) > 0 {
									modPrompt = fmt.Sprintf("%s\n\nTarget these learning objectives:\n- %s",
										modPrompt, strings.Join(selectedLOs, "\n- "))
								}
							}
						}
					}
				}
			}
		}
	}

	// Regenerate the component
	regenResult, err := aiProvider.RegenerateComponent(ctx, service.RegenerateComponentRequest{
		ComponentType:      targetComponent.Type,
		CurrentContentJSON: string(targetComponent.ContentJSON),
		ModificationPrompt: modPrompt,
		LessonContext:      lessonContext,
		TargetAudience:     targetAudience,
	})
	if err != nil {
		log.Error("AI regeneration failed", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("AI regeneration failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 80
	progressMsg = "Saving regenerated component..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = regenResult.TokensUsed
	_ = s.jobRepo.Update(ctx, job)

	// Update the component with new content
	content.GeneratedLessons[lessonIndex].Components[componentIndex].ContentJSON = json.RawMessage(regenResult.ContentJSON)
	content.GeneratedLessons[lessonIndex].Components[componentIndex].UpdatedAt = time.Now()

	// Save updated content back to MinIO
	if err := s.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		return s.failJob(ctx, job, "failed to save updated content")
	}

	// Mark job as completed
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	now := time.Now()
	job.CompletedAt = &now
	completedMsg := "Component regenerated successfully"
	job.ProgressMessage = &completedMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job status", "error", err)
	}

	s.publishJobEvent(ctx, "completed", job)
	log.Info("component regeneration completed", "tokens", regenResult.TokensUsed)

	return nil
}

// GetJob retrieves a generation job by ID.
func (s *AIGenerationService) GetJob(ctx context.Context, kratosID uuid.UUID, jobID uuid.UUID) (*entity.GenerationJob, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	job, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil || job == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("job not found")
	}

	return job, nil
}

// ListJobs retrieves generation jobs with optional filtering.
func (s *AIGenerationService) ListJobs(ctx context.Context, kratosID uuid.UUID, opts entity.GenerationJobListOptions) ([]*entity.GenerationJob, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	jobs, err := s.jobRepo.List(ctx, opts)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return jobs, nil
}

// CancelJob cancels a queued or processing job.
func (s *AIGenerationService) CancelJob(ctx context.Context, kratosID uuid.UUID, jobID uuid.UUID) (*entity.GenerationJob, error) {
	log := s.logger.With("kratosID", kratosID, "jobID", jobID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	job, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil || job == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("job not found")
	}

	if job.Status != valueobject.GenerationJobStatusQueued && job.Status != valueobject.GenerationJobStatusProcessing {
		return nil, domainerrors.ErrInvalidInput.WithMessage("can only cancel queued or processing jobs")
	}

	now := time.Now()
	cancelMsg := "Cancelled by user"

	// Cancel children if parent job
	if job.Type == valueobject.GenerationJobTypeFullCourse {
		children, err := s.jobRepo.ListByParentID(ctx, jobID)
		if err == nil {
			for _, child := range children {
				if child.Status == valueobject.GenerationJobStatusQueued || child.Status == valueobject.GenerationJobStatusProcessing {
					child.Status = valueobject.GenerationJobStatusCancelled
					child.CompletedAt = &now
					childMsg := "Cancelled: parent job cancelled"
					child.ProgressMessage = &childMsg
					_ = s.jobRepo.Update(ctx, child)
				}
			}
		}
	}

	job.Status = valueobject.GenerationJobStatusCancelled
	job.CompletedAt = &now
	job.ProgressMessage = &cancelMsg

	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to cancel job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("job cancelled")
	return job, nil
}

// GetUserIDByKratosID returns the user's internal ID from their Kratos ID.
func (s *AIGenerationService) GetUserIDByKratosID(ctx context.Context, kratosID uuid.UUID) (uuid.UUID, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return uuid.Nil, domainerrors.ErrUserNotFound
	}
	return user.ID, nil
}

// ProcessNextQueuedJob processes the next queued generation job.
func (s *AIGenerationService) ProcessNextQueuedJob(ctx context.Context) error {
	return s.processNextJob(ctx)
}

// ProcessJobByID processes a specific generation job by its ID.
func (s *AIGenerationService) ProcessJobByID(ctx context.Context, jobID string) error {
	log := s.logger.With("jobID", jobID)

	id, err := uuid.Parse(jobID)
	if err != nil {
		return fmt.Errorf("invalid job ID: %w", err)
	}

	adminCtx := tenant.WithSuperAdmin(ctx, true)
	job, err := s.jobRepo.ClaimJobByID(adminCtx, id)
	if err != nil {
		log.Error("failed to claim job", "error", err)
		return err
	}

	if job == nil {
		log.Info("job not available for claim")
		return nil
	}

	tenantCtx := tenant.WithTenantID(adminCtx, job.TenantID)

	switch job.Type {
	case valueobject.GenerationJobTypeCourseOutline:
		return s.ProcessOutlineGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeLessonContent:
		return s.ProcessLessonGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeComponentRegen:
		return s.ProcessComponentRegenJob(tenantCtx, job)
	default:
		return s.failJob(tenantCtx, job, fmt.Sprintf("unknown job type: %s", job.Type))
	}
}

func (s *AIGenerationService) processNextJob(ctx context.Context) error {
	adminCtx := tenant.WithSuperAdmin(ctx, true)
	job, err := s.jobRepo.GetNextQueued(adminCtx)
	if err != nil {
		return err
	}

	if job == nil {
		return nil
	}

	tenantCtx := tenant.WithTenantID(adminCtx, job.TenantID)

	switch job.Type {
	case valueobject.GenerationJobTypeCourseOutline:
		return s.ProcessOutlineGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeLessonContent:
		return s.ProcessLessonGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeComponentRegen:
		return s.ProcessComponentRegenJob(tenantCtx, job)
	default:
		return s.failJob(tenantCtx, job, fmt.Sprintf("unknown job type: %s", job.Type))
	}
}

func (s *AIGenerationService) failJob(ctx context.Context, job *entity.GenerationJob, errMsg string) error {
	// Log detailed info about the failing job for debugging
	s.logger.Error("JOB FAILED",
		"jobID", job.ID,
		"jobType", job.Type,
		"courseID", job.CourseID,
		"parentJobID", job.ParentJobID,
		"resultPath", job.ResultPath,
		"errorMessage", errMsg,
	)

	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now
	_ = s.jobRepo.Update(ctx, job)
	s.publishJobEvent(ctx, "failed", job)
	return fmt.Errorf("%s", errMsg)
}

func (s *AIGenerationService) checkJobCancelled(ctx context.Context, jobID uuid.UUID) bool {
	select {
	case <-ctx.Done():
		return true
	default:
	}

	currentJob, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return false
	}
	return currentJob.Status == valueobject.GenerationJobStatusCancelled
}

func (s *AIGenerationService) publishJobEvent(ctx context.Context, eventType string, job *entity.GenerationJob) {
	if s.jobEventPublisher == nil {
		return
	}
	_ = s.jobEventPublisher.PublishJobEvent(ctx, job.CreatedByUserID, eventType, job)
}

func (s *AIGenerationService) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	if s.contentStorage == nil {
		return nil, domainerrors.ErrInternal.WithMessage("content storage not configured")
	}

	var content S3CourseContent
	if err := s.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	return &content, nil
}

func (s *AIGenerationService) writeCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content *S3CourseContent) error {
	if s.contentStorage == nil {
		return domainerrors.ErrInternal.WithMessage("content storage not configured")
	}

	if err := s.contentStorage.WriteCourseContent(ctx, tenantID, courseID, content); err != nil {
		return domainerrors.ErrInternal.WithCause(err)
	}
	return nil
}

func findS3Lesson(content *S3CourseContent, lessonID string) *S3GeneratedLesson {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonID {
			return &content.GeneratedLessons[i]
		}
	}
	return nil
}

func upsertS3Lesson(content *S3CourseContent, lesson S3GeneratedLesson) {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lesson.ID {
			content.GeneratedLessons[i] = lesson
			return
		}
	}
	content.GeneratedLessons = append(content.GeneratedLessons, lesson)
}

// GenerateComponentImage generates an image for an image placeholder component.
func (s *AIGenerationService) GenerateComponentImage(ctx context.Context, kratosID uuid.UUID, req GenerateComponentImageRequest) (*GenerateComponentImageResult, error) {
	log := s.logger.With("kratosID", kratosID, "componentID", req.ComponentID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, tenantID, req.CourseID)
	if err != nil {
		log.Error("failed to read course content", "error", err)
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	// Find lesson and component
	s3Lesson := findS3Lesson(content, req.LessonID.String())
	if s3Lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("lesson not found")
	}

	var componentIndex int = -1
	for i, comp := range s3Lesson.Components {
		if comp.ID == req.ComponentID.String() {
			componentIndex = i
			break
		}
	}

	if componentIndex < 0 {
		return nil, domainerrors.ErrNotFound.WithMessage("component not found")
	}

	// Get AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, tenantID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Generate image
	imageResult, err := aiProvider.GenerateImage(ctx, service.GenerateImageRequest{
		Prompt:      req.Prompt,
		AspectRatio: req.AspectRatio,
	})
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if s.imageStorage == nil {
		return nil, domainerrors.ErrInternal.WithMessage("image storage not configured")
	}

	// Store image
	ext := ".png"
	if imageResult.MimeType == "image/jpeg" {
		ext = ".jpg"
	}

	storagePath := fmt.Sprintf("tenants/%s/courses/%s/images/%s-%s%s",
		tenantID.String(),
		req.CourseID.String(),
		req.LessonID.String(),
		req.ComponentID.String(),
		ext,
	)

	if err := s.imageStorage.PutContent(ctx, storagePath, imageResult.ImageData, imageResult.MimeType); err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	imageURL, err := s.imageStorage.GenerateDownloadURL(ctx, storagePath, 24*time.Hour)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Atomically update the component with the generated image.
	// This uses optimistic concurrency to prevent race conditions.
	var atomicContent S3CourseContent
	var updatedJSON json.RawMessage
	if err := s.contentStorage.UpdateCourseContentAtomic(
		ctx,
		tenantID,
		req.CourseID,
		&atomicContent,
		func() error {
			// Re-find lesson in the freshly read content
			atomicLesson := findS3Lesson(&atomicContent, req.LessonID.String())
			if atomicLesson == nil {
				return domainerrors.ErrNotFound.WithMessage("lesson not found")
			}

			// Find component index in the fresh content
			var atomicCompIndex int = -1
			for i, comp := range atomicLesson.Components {
				if comp.ID == req.ComponentID.String() {
					atomicCompIndex = i
					break
				}
			}
			if atomicCompIndex < 0 {
				return domainerrors.ErrNotFound.WithMessage("component not found")
			}

			// Update component
			var imageContent map[string]interface{}
			_ = json.Unmarshal(atomicLesson.Components[atomicCompIndex].ContentJSON, &imageContent)
			if imageContent == nil {
				imageContent = make(map[string]interface{})
			}

			imageContent["storagePath"] = storagePath
			imageContent["url"] = imageURL
			if _, exists := imageContent["image_description"]; !exists {
				imageContent["image_description"] = req.Prompt
			}

			updatedJSON, _ = json.Marshal(imageContent)
			atomicLesson.Components[atomicCompIndex].ContentJSON = updatedJSON
			atomicLesson.Components[atomicCompIndex].UpdatedAt = time.Now()
			return nil
		},
	); err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	compID, _ := uuid.Parse(s3Lesson.Components[componentIndex].ID)
	component := &entity.LessonComponent{
		ID:          compID,
		TenantID:    tenantID,
		LessonID:    req.LessonID,
		ContentJSON: updatedJSON,
	}

	return &GenerateComponentImageResult{
		ImageURL:  imageURL,
		Component: component,
	}, nil
}

// GenerateComponentImageRequest contains the inputs for component image generation.
type GenerateComponentImageRequest struct {
	CourseID    uuid.UUID
	LessonID    uuid.UUID
	ComponentID uuid.UUID
	Prompt      string
	AspectRatio string
}

// GenerateComponentImageResult contains the result of image generation.
type GenerateComponentImageResult struct {
	ImageURL  string
	Component *entity.LessonComponent
}

// UpdateLessonComponentsRequest contains the inputs for updating lesson components.
type UpdateLessonComponentsRequest struct {
	CourseID   uuid.UUID
	LessonID   uuid.UUID
	Components []UpdateComponentInput
}

// UpdateComponentInput represents a single component update.
type UpdateComponentInput struct {
	ID                   string
	Type                 valueobject.LessonComponentType
	Order                int32
	ContentJSON          json.RawMessage
	LearningObjectiveIDs []string
}

// UpdateLessonComponentsResult contains the updated lesson.
type UpdateLessonComponentsResult struct {
	Lesson *entity.GeneratedLesson
}

// UpdateLessonComponents saves manual edits to lesson components.
func (s *AIGenerationService) UpdateLessonComponents(ctx context.Context, kratosID uuid.UUID, req UpdateLessonComponentsRequest) (*UpdateLessonComponentsResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Atomically update lesson components using optimistic concurrency.
	// This prevents race conditions with concurrent lesson generation or image generation.
	var atomicContent S3CourseContent
	var updatedComponents []S3LessonComponent
	var s3Lesson *S3GeneratedLesson

	if err := s.contentStorage.UpdateCourseContentAtomic(
		ctx,
		tenantID,
		req.CourseID,
		&atomicContent,
		func() error {
			// Find or create lesson in the freshly read content
			s3Lesson = findS3Lesson(&atomicContent, req.LessonID.String())
			if s3Lesson == nil {
				s3Lesson = &S3GeneratedLesson{
					ID:          req.LessonID.String(),
					Components:  []S3LessonComponent{},
					GeneratedAt: time.Now(),
				}
			}

			// Build updated components
			now := time.Now()
			updatedComponents = make([]S3LessonComponent, len(req.Components))
			for i, input := range req.Components {
				compID := input.ID
				createdAt := now
				if len(input.ID) > 5 && input.ID[:5] == "temp-" {
					compID = uuid.New().String()
				} else {
					for _, existing := range s3Lesson.Components {
						if existing.ID == input.ID {
							createdAt = existing.CreatedAt
							break
						}
					}
				}

				updatedComponents[i] = S3LessonComponent{
					ID:                   compID,
					Type:                 string(input.Type),
					Order:                input.Order,
					ContentJSON:          input.ContentJSON,
					LearningObjectiveIDs: input.LearningObjectiveIDs,
					CreatedAt:            createdAt,
					UpdatedAt:            now,
				}
			}

			s3Lesson.Components = updatedComponents
			upsertS3Lesson(&atomicContent, *s3Lesson)
			return nil
		},
	); err != nil {
		return nil, err
	}

	lessonID, _ := uuid.Parse(s3Lesson.ID)
	lesson := &entity.GeneratedLesson{
		ID:          lessonID,
		TenantID:    tenantID,
		CourseID:    req.CourseID,
		Title:       s3Lesson.Title,
		GeneratedAt: s3Lesson.GeneratedAt,
		Components:  make([]entity.LessonComponent, len(updatedComponents)),
	}

	for i, comp := range updatedComponents {
		compID, _ := uuid.Parse(comp.ID)
		lesson.Components[i] = entity.LessonComponent{
			ID:          compID,
			TenantID:    tenantID,
			LessonID:    lessonID,
			Type:        valueobject.LessonComponentType(comp.Type),
			Position:    comp.Order,
			ContentJSON: comp.ContentJSON,
		}
	}

	return &UpdateLessonComponentsResult{Lesson: lesson}, nil
}

// GetGeneratedLesson retrieves a generated lesson by ID from MinIO.
func (s *AIGenerationService) GetGeneratedLesson(ctx context.Context, kratosID uuid.UUID, lessonID uuid.UUID) (*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// This method requires knowing the courseID to read from MinIO
	// For now, return not found since we'd need courseID
	return nil, domainerrors.ErrNotFound.WithMessage("lesson not found - courseID required")
}

// ListGeneratedLessons retrieves all generated lessons for a course from MinIO.
func (s *AIGenerationService) ListGeneratedLessons(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) ([]*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	content, err := s.readCourseContent(ctx, tenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	lessons := make([]*entity.GeneratedLesson, 0, len(content.GeneratedLessons))
	for _, s3Lesson := range content.GeneratedLessons {
		lessonID, _ := uuid.Parse(s3Lesson.ID)
		sectionID, _ := uuid.Parse(s3Lesson.SectionID)
		outlineLessonID, _ := uuid.Parse(s3Lesson.OutlineLessonID)

		lesson := &entity.GeneratedLesson{
			ID:              lessonID,
			TenantID:        tenantID,
			CourseID:        courseID,
			SectionID:       sectionID,
			OutlineLessonID: outlineLessonID,
			Title:           s3Lesson.Title,
			SegueText:       s3Lesson.SegueText,
			GeneratedAt:     s3Lesson.GeneratedAt,
			Components:      make([]entity.LessonComponent, len(s3Lesson.Components)),
		}

		for i, comp := range s3Lesson.Components {
			compID, _ := uuid.Parse(comp.ID)
			lesson.Components[i] = entity.LessonComponent{
				ID:          compID,
				TenantID:    tenantID,
				LessonID:    lessonID,
				Type:        valueobject.LessonComponentType(comp.Type),
				Position:    comp.Order,
				ContentJSON: comp.ContentJSON,
			}
		}

		lessons = append(lessons, lesson)
	}

	return lessons, nil
}

// GetCourseOutline retrieves the outline for a course from MinIO.
func (s *AIGenerationService) GetCourseOutline(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*entity.CourseOutline, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	content, err := s.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	if len(content.Content.Sections) == 0 {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	// Convert to entity
	outline := &entity.CourseOutline{
		ID:             uuid.New(), // Generated
		TenantID:       *user.TenantID,
		CourseID:       courseID,
		Version:        1,
		ApprovalStatus: valueobject.OutlineApprovalStatusApproved, // Auto-approved in new flow
		GeneratedAt:    time.Now(),
		Sections:       make([]entity.OutlineSection, 0, len(content.Content.Sections)),
	}

	for sIdx, section := range content.Content.Sections {
		sectionID, _ := section["id"].(string)
		sectionTitle, _ := section["title"].(string)
		sectionDesc, _ := section["description"].(string)

		sec := entity.OutlineSection{
			ID:          uuid.MustParse(sectionID),
			TenantID:    *user.TenantID,
			OutlineID:   outline.ID,
			Title:       sectionTitle,
			Description: sectionDesc,
			Position:    int32(sIdx + 1),
			Lessons:     []entity.OutlineLesson{},
		}

		var lessons []interface{}
		if l, ok := section["lessons"].([]interface{}); ok {
			lessons = l
		}

		for lIdx, lessonData := range lessons {
			lessonMap, _ := lessonData.(map[string]interface{})
			lessonID, _ := lessonMap["id"].(string)
			lessonTitle, _ := lessonMap["title"].(string)
			lessonDesc, _ := lessonMap["description"].(string)

			lesson := entity.OutlineLesson{
				ID:          uuid.MustParse(lessonID),
				TenantID:    *user.TenantID,
				SectionID:   sec.ID,
				Title:       lessonTitle,
				Description: lessonDesc,
				Position:    int32(lIdx + 1),
			}

			if duration, ok := lessonMap["estimatedDurationMinutes"].(float64); ok {
				d := int32(duration)
				lesson.EstimatedDurationMinutes = &d
			}

			if los, ok := lessonMap["learningObjectives"].([]interface{}); ok {
				for _, lo := range los {
					if str, ok := lo.(string); ok {
						lesson.LearningObjectives = append(lesson.LearningObjectives, str)
					}
				}
			}

			if isLast, ok := lessonMap["isLastInSection"].(bool); ok {
				lesson.IsLastInSection = isLast
			}
			if isLast, ok := lessonMap["isLastInCourse"].(bool); ok {
				lesson.IsLastInCourse = isLast
			}

			sec.Lessons = append(sec.Lessons, lesson)
		}

		outline.Sections = append(outline.Sections, sec)
	}

	return outline, nil
}

// GetWizardData retrieves the wizard data (personas, tone) stored with a course.
// This is used by the editor for realignment features.
func (s *AIGenerationService) GetWizardData(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*S3WizardData, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	content, err := s.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	return content.WizardData, nil
}

// ApproveCourseOutline is a no-op in the new flow (outlines auto-approved).
func (s *AIGenerationService) ApproveCourseOutline(ctx context.Context, kratosID uuid.UUID, outlineID uuid.UUID) (*entity.CourseOutline, error) {
	// In the simplified flow, outlines are auto-approved
	// This is kept for API compatibility
	return nil, domainerrors.ErrNotFound.WithMessage("approve not needed - outlines auto-approved in new flow")
}

// RejectCourseOutline is a no-op in the new flow.
func (s *AIGenerationService) RejectCourseOutline(ctx context.Context, kratosID uuid.UUID, outlineID uuid.UUID, reason string) (*entity.CourseOutline, error) {
	return nil, domainerrors.ErrNotFound.WithMessage("reject not available in new flow")
}

// UpdateCourseOutline updates an existing outline in MinIO.
func (s *AIGenerationService) UpdateCourseOutline(ctx context.Context, kratosID uuid.UUID, courseID, outlineID uuid.UUID, sections []UpdateCourseOutlineSection) (*entity.CourseOutline, error) {
	// For now, return not implemented
	return nil, domainerrors.ErrNotFound.WithMessage("update outline not yet implemented for MinIO-only storage")
}

// UpdateCourseOutlineSection represents a section in the update request.
type UpdateCourseOutlineSection struct {
	ID          uuid.UUID
	Title       string
	Description string
	Order       int32
	Lessons     []UpdateCourseOutlineLesson
}

// UpdateCourseOutlineLesson represents a lesson in the update request.
type UpdateCourseOutlineLesson struct {
	ID                       uuid.UUID
	Title                    string
	Description              string
	Order                    int32
	EstimatedDurationMinutes *int32
	LearningObjectives       []string
}

// GenerateLessonContent starts a single lesson content generation job (not used in batch flow).
func (s *AIGenerationService) GenerateLessonContent(ctx context.Context, kratosID uuid.UUID, req GenerateLessonContentRequest) (*GenerateLessonContentResult, error) {
	return nil, domainerrors.ErrNotFound.WithMessage("single lesson generation not available - use GenerateAllLessons")
}

// GenerateLessonContentRequest contains inputs for lesson content generation.
type GenerateLessonContentRequest struct {
	CourseID        uuid.UUID
	OutlineLessonID uuid.UUID
}

// GenerateLessonContentResult contains the created job.
type GenerateLessonContentResult struct {
	Job *entity.GenerationJob
}

// ComponentRegenInput stores inputs for component regeneration job.
type ComponentRegenInput struct {
	CourseID             string   `json:"courseId"`
	LessonID             string   `json:"lessonId"`
	ComponentID          string   `json:"componentId"`
	ModificationPrompt   string   `json:"modificationPrompt"`
	PersonaIDs           []string `json:"personaIds,omitempty"`
	LearningObjectiveIDs []string `json:"learningObjectiveIds,omitempty"`
}

// RegenerateComponent starts a job to regenerate a single lesson component.
func (s *AIGenerationService) RegenerateComponent(ctx context.Context, kratosID uuid.UUID, req RegenerateComponentRequest) (*RegenerateComponentResult, error) {
	log := s.logger.With("method", "RegenerateComponent", "courseId", req.CourseID, "lessonId", req.LessonID, "componentId", req.ComponentID)

	// Get user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		log.Error("failed to get user", "error", err)
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		log.Error("user has no tenant")
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Verify course content exists and user has access (via tenant-scoped read)
	_, err = s.readCourseContent(ctx, *user.TenantID, req.CourseID)
	if err != nil {
		log.Error("failed to get course content", "error", err)
		return nil, domainerrors.ErrNotFound.WithMessage("course not found")
	}

	// Store input info for the job processor
	input := ComponentRegenInput{
		CourseID:           req.CourseID.String(),
		LessonID:           req.LessonID.String(),
		ComponentID:        req.ComponentID.String(),
		ModificationPrompt: req.ModificationPrompt,
	}

	if req.AlignmentTargets != nil {
		input.PersonaIDs = req.AlignmentTargets.PersonaIDs
		input.LearningObjectiveIDs = req.AlignmentTargets.LearningObjectiveIDs
	}

	inputJSON, err := json.Marshal(input)
	if err != nil {
		log.Error("failed to marshal input", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	resultPath := string(inputJSON)

	// Create the job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeComponentRegen,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		ResultPath:      &resultPath,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create generation job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Publish job created event
	s.publishJobEvent(ctx, "created", job)

	log.Info("created component regeneration job", "jobId", job.ID)

	return &RegenerateComponentResult{Job: job}, nil
}

// AlignmentTargets specifies personas and learning objectives for realignment.
type AlignmentTargets struct {
	PersonaIDs           []string
	LearningObjectiveIDs []string
}

// RegenerateComponentRequest contains inputs for component regeneration.
type RegenerateComponentRequest struct {
	CourseID           uuid.UUID
	LessonID           uuid.UUID
	ComponentID        uuid.UUID
	ModificationPrompt string
	AlignmentTargets   *AlignmentTargets
}

// RegenerateComponentResult contains the created job.
type RegenerateComponentResult struct {
	Job *entity.GenerationJob
}

// RunBackground starts the background job processing loop.
func (s *AIGenerationService) RunBackground(ctx context.Context, interval time.Duration) {
	log := s.logger.With("job", "ai-generation-worker")
	log.Info("starting AI generation background job", "interval", interval)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info("AI generation background job stopped")
			return
		case <-ticker.C:
			if err := s.processNextJob(ctx); err != nil {
				log.Error("error processing job", "error", err)
			}
		}
	}
}
