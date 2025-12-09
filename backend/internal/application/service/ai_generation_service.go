package service

import (
	"context"
	"encoding/json"
	"fmt"
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
// Since Gemini clients require API keys at construction time and keys are per-tenant,
// this factory creates a fresh client for each request using the tenant's decrypted API key.
type AIProviderFactory interface {
	GetProvider(ctx context.Context, tenantID uuid.UUID) (service.AIProvider, error)
}

// JobNotifier sends notifications about generation job status changes.
type JobNotifier interface {
	NotifyJobProgress(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, jobType string, status string, progress int) error
}

// CourseCompletionNotifier sends notifications when full course generation completes.
type CourseCompletionNotifier interface {
	// NotifyCourseComplete sends notification when all lessons are generated.
	NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error
	// NotifyCourseFailed sends notification when course generation fails.
	NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// OutlineCompletionNotifier sends notifications when outline generation completes.
type OutlineCompletionNotifier interface {
	// NotifyOutlineReady sends notification when course outline is generated and ready for review.
	NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error
	// NotifyOutlineFailed sends notification when outline generation fails.
	NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// TaskEnqueuer enqueues background tasks for processing.
// This enables event-driven job processing (push) in addition to polling (sweep).
type TaskEnqueuer interface {
	// EnqueueAIGeneration enqueues an AI generation job for immediate processing.
	EnqueueAIGeneration(jobID, jobType string) error
}

// ImageStorage abstracts image storage operations.
type ImageStorage interface {
	// PutContent stores raw content to storage.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	// GenerateDownloadURL generates a presigned URL for downloads.
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
}

// JobEventPublisher publishes real-time job events via pub/sub.
type JobEventPublisher interface {
	PublishJobEvent(ctx context.Context, userID uuid.UUID, eventType string, job *entity.GenerationJob) error
}

// AIGenerationService handles AI-powered content generation.
type AIGenerationService struct {
	userRepo           repository.UserRepository
	jobRepo            repository.GenerationJobRepository
	outlineRepo        repository.CourseOutlineRepository
	sectionRepo        repository.OutlineSectionRepository
	lessonRepo         repository.OutlineLessonRepository
	genLessonRepo      repository.GeneratedLessonRepository
	componentRepo      repository.LessonComponentRepository // Deprecated: components now stored in MinIO
	genInputRepo       repository.CourseGenerationInputRepository
	aiSettingsRepo     repository.TenantAISettingsRepository
	aiProviderFactory  AIProviderFactory
	notifier           JobNotifier
	completionNotifier CourseCompletionNotifier
	outlineNotifier    OutlineCompletionNotifier
	taskEnqueuer       TaskEnqueuer                  // For event-driven job processing (optional, falls back to polling)
	imageStorage       ImageStorage                  // For storing generated images
	contentStorage     *storage.TenantAwareStorage   // For storing course content (lessons, components) in MinIO
	jobEventPublisher  JobEventPublisher             // For real-time job event streaming (optional)
	logger             service.Logger
}

// NewAIGenerationService creates a new AI generation service.
func NewAIGenerationService(
	userRepo repository.UserRepository,
	jobRepo repository.GenerationJobRepository,
	outlineRepo repository.CourseOutlineRepository,
	sectionRepo repository.OutlineSectionRepository,
	lessonRepo repository.OutlineLessonRepository,
	genLessonRepo repository.GeneratedLessonRepository,
	componentRepo repository.LessonComponentRepository,
	genInputRepo repository.CourseGenerationInputRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	aiProviderFactory AIProviderFactory,
	notifier JobNotifier,
	completionNotifier CourseCompletionNotifier,
	outlineNotifier OutlineCompletionNotifier,
	taskEnqueuer TaskEnqueuer, // Can be nil - falls back to polling
	imageStorage ImageStorage, // For storing generated images (can be nil if not needed)
	contentStorage *storage.TenantAwareStorage, // For storing course content in MinIO
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:           userRepo,
		jobRepo:            jobRepo,
		outlineRepo:        outlineRepo,
		sectionRepo:        sectionRepo,
		lessonRepo:         lessonRepo,
		genLessonRepo:      genLessonRepo,
		componentRepo:      componentRepo,
		genInputRepo:       genInputRepo,
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

	// Store generation input
	genInput := &entity.CourseGenerationInput{
		ID:                uuid.New(),
		TenantID:          *user.TenantID,
		CourseID:          req.CourseID,
		SMEIDs:            []uuid.UUID{}, // Initialize as empty slice (DB requires NOT NULL)
		TargetAudienceIDs: []uuid.UUID{}, // Initialize as empty slice (DB requires NOT NULL)
		DesiredOutcome:    req.DesiredOutcome,
		CreatedAt:         time.Now(),
		UpdatedAt:         time.Now(),
	}
	if req.AdditionalContext != "" {
		genInput.AdditionalContext = &req.AdditionalContext
	}

	if err := s.genInputRepo.Create(ctx, genInput); err != nil {
		log.Error("failed to store generation input", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
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

	// Publish job created event for real-time streaming
	s.publishJobEvent(ctx, "created", job)

	log.Info("course outline generation job created", "jobID", job.ID)

	// Push: Enqueue for immediate processing (if task enqueuer available)
	// Sweep: Poll task will pick it up if enqueue fails or enqueuer is nil
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue job for immediate processing, will be picked up by poll", "error", err)
		}
	}

	return &GenerateCourseOutlineResult{Job: job}, nil
}

// ProcessOutlineGenerationJob processes an outline generation job.
// This is called by the background worker.
// Note: Job is already claimed as 'processing' with started_at set by GetNextQueued.
func (s *AIGenerationService) ProcessOutlineGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "courseID", job.CourseID)

	// Check for cancellation at start
	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Job is already marked as 'processing' by GetNextQueued (atomic claim)
	// Just update the progress message
	progressMsg := "Preparing course generation..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress message", "error", err)
	}

	// Get generation input
	genInput, err := s.genInputRepo.GetByCourseID(ctx, *job.CourseID)
	if err != nil || genInput == nil {
		return s.failJob(ctx, job, "failed to get generation input")
	}

	// Update progress
	job.ProgressPercent = 40
	progressMsg = "Generating course outline with AI..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress", "progress", 40, "error", err)
	}

	// Check for cancellation before expensive AI call
	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job cancelled before AI generation")
		return s.markJobCancelled(ctx, job)
	}

	// Generate outline with AI
	additionalContext := ""
	if genInput.AdditionalContext != nil {
		additionalContext = *genInput.AdditionalContext
	}

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	outlineResult, err := aiProvider.GenerateCourseOutline(ctx, service.GenerateOutlineRequest{
		CourseTitle:       "", // Will be fetched or passed
		DesiredOutcome:    genInput.DesiredOutcome,
		SMEKnowledge:      []service.SMEKnowledgeInput{}, // Empty since SME removed
		TargetAudience:    service.TargetAudienceInput{}, // Empty since target audience removed
		AdditionalContext: additionalContext,
	})
	if err != nil {
		log.Error("AI outline generation failed", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("AI generation failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing outline..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = outlineResult.TokensUsed
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress", "progress", 70, "error", err)
	}

	// Get next version number for this course (handles regeneration after rejection)
	nextVersion, err := s.outlineRepo.GetNextVersion(ctx, *job.CourseID)
	if err != nil {
		log.Error("failed to get next version", "error", err)
		return s.failJob(ctx, job, "failed to determine outline version")
	}

	// Build all entities first with pre-generated UUIDs for atomic creation
	outline := &entity.CourseOutline{
		ID:             uuid.New(),
		TenantID:       job.TenantID,
		CourseID:       *job.CourseID,
		Version:        nextVersion,
		ApprovalStatus: valueobject.OutlineApprovalStatusPendingReview,
		GeneratedAt:    time.Now(),
	}

	var sections []entity.OutlineSection
	var lessons []entity.OutlineLesson

	for _, sectionResult := range outlineResult.Sections {
		section := entity.OutlineSection{
			ID:          uuid.New(),
			TenantID:    job.TenantID,
			OutlineID:   outline.ID,
			Title:       sectionResult.Title,
			Description: sectionResult.Description,
			Position:    int32(sectionResult.Order),
			CreatedAt:   time.Now(),
		}
		sections = append(sections, section)

		for _, lessonResult := range sectionResult.Lessons {
			duration := int32(lessonResult.EstimatedDurationMinutes)
			lesson := entity.OutlineLesson{
				ID:                       uuid.New(),
				TenantID:                 job.TenantID,
				SectionID:                section.ID,
				Title:                    lessonResult.Title,
				Description:              lessonResult.Description,
				Position:                 int32(lessonResult.Order),
				EstimatedDurationMinutes: &duration,
				LearningObjectives:       lessonResult.LearningObjectives,
				IsLastInSection:          lessonResult.IsLastInSection,
				IsLastInCourse:           lessonResult.IsLastInCourse,
				CreatedAt:                time.Now(),
			}
			lessons = append(lessons, lesson)
		}
	}

	// Atomically create outline with all sections and lessons
	// If any part fails, the entire operation is rolled back
	if err := s.outlineRepo.CreateCompleteOutline(ctx, outline, sections, lessons); err != nil {
		log.Error("failed to create outline atomically", "error", err)
		return s.failJob(ctx, job, "failed to store outline")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, outlineResult.TokensUsed)

	// Count sections and lessons for notification
	sectionCount := len(outlineResult.Sections)
	lessonCount := 0
	for _, section := range outlineResult.Sections {
		lessonCount += len(section.Lessons)
	}

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	progressMsg = "Outline generation complete"
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to mark job as completed", "error", err)
	}

	// Publish job completed event for real-time streaming
	s.publishJobEvent(ctx, "completed", job)

	// Send outline ready notification with email (tenant-isolated via user lookup)
	if s.outlineNotifier != nil {
		courseTitle := genInput.DesiredOutcome // Use desired outcome as course context
		if len(courseTitle) > 50 {
			courseTitle = courseTitle[:47] + "..."
		}
		if err := s.outlineNotifier.NotifyOutlineReady(ctx, job.CreatedByUserID, *job.CourseID, courseTitle, sectionCount, lessonCount); err != nil {
			log.Error("failed to send outline ready notification", "error", err)
		}
	}

	log.Info("outline generation completed", "tokensUsed", outlineResult.TokensUsed, "sections", sectionCount, "lessons", lessonCount)
	return nil
}

// GetCourseOutline retrieves the outline for a course.
func (s *AIGenerationService) GetCourseOutline(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*entity.CourseOutline, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	outline, err := s.outlineRepo.GetByCourseID(ctx, courseID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	// Load sections and lessons
	sections, err := s.sectionRepo.ListByOutlineID(ctx, outline.ID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	for _, section := range sections {
		lessons, err := s.lessonRepo.ListBySectionID(ctx, section.ID)
		if err != nil {
			continue
		}
		section.Lessons = make([]entity.OutlineLesson, len(lessons))
		for i, l := range lessons {
			section.Lessons[i] = *l
		}
	}

	outline.Sections = make([]entity.OutlineSection, len(sections))
	for i, s := range sections {
		outline.Sections[i] = *s
	}

	return outline, nil
}

// ApproveCourseOutline approves an outline for content generation.
func (s *AIGenerationService) ApproveCourseOutline(ctx context.Context, kratosID uuid.UUID, outlineID uuid.UUID) (*entity.CourseOutline, error) {
	log := s.logger.With("kratosID", kratosID, "outlineID", outlineID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	outline, err := s.outlineRepo.GetByID(ctx, outlineID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	now := time.Now()
	outline.ApprovalStatus = valueobject.OutlineApprovalStatusApproved
	outline.ApprovedAt = &now
	outline.ApprovedByUserID = &user.ID

	if err := s.outlineRepo.Update(ctx, outline); err != nil {
		log.Error("failed to approve outline", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Load sections and lessons to return complete outline
	sections, err := s.sectionRepo.ListByOutlineID(ctx, outline.ID)
	if err != nil {
		log.Error("failed to load sections", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	for _, section := range sections {
		lessons, err := s.lessonRepo.ListBySectionID(ctx, section.ID)
		if err != nil {
			continue
		}
		section.Lessons = make([]entity.OutlineLesson, len(lessons))
		for i, l := range lessons {
			section.Lessons[i] = *l
		}
	}

	outline.Sections = make([]entity.OutlineSection, len(sections))
	for i, sec := range sections {
		outline.Sections[i] = *sec
	}

	log.Info("outline approved", "sectionCount", len(outline.Sections))
	return outline, nil
}

// RejectCourseOutline rejects an outline with feedback.
func (s *AIGenerationService) RejectCourseOutline(ctx context.Context, kratosID uuid.UUID, outlineID uuid.UUID, reason string) (*entity.CourseOutline, error) {
	log := s.logger.With("kratosID", kratosID, "outlineID", outlineID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	outline, err := s.outlineRepo.GetByID(ctx, outlineID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	outline.ApprovalStatus = valueobject.OutlineApprovalStatusRejected
	outline.RejectionReason = &reason

	if err := s.outlineRepo.Update(ctx, outline); err != nil {
		log.Error("failed to reject outline", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("outline rejected", "reason", reason)
	return outline, nil
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

// UpdateCourseOutline updates an existing outline before approval.
func (s *AIGenerationService) UpdateCourseOutline(ctx context.Context, kratosID uuid.UUID, courseID, outlineID uuid.UUID, sections []UpdateCourseOutlineSection) (*entity.CourseOutline, error) {
	log := s.logger.With("kratosID", kratosID, "outlineID", outlineID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	outline, err := s.outlineRepo.GetByID(ctx, outlineID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	// Only allow editing pending/revision-requested outlines
	if outline.ApprovalStatus != valueobject.OutlineApprovalStatusPendingReview &&
		outline.ApprovalStatus != valueobject.OutlineApprovalStatusRevisionRequested {
		return nil, domainerrors.ErrForbidden.WithMessage("can only edit pending or revision-requested outlines")
	}

	// Update sections and lessons
	for _, sectionReq := range sections {
		section, err := s.sectionRepo.GetByID(ctx, sectionReq.ID)
		if err != nil {
			continue // Skip if not found
		}

		section.Title = sectionReq.Title
		section.Description = sectionReq.Description
		section.Position = sectionReq.Order

		if err := s.sectionRepo.Update(ctx, section); err != nil {
			log.Error("failed to update section", "sectionID", section.ID, "error", err)
			return nil, domainerrors.ErrInternal.WithCause(err)
		}

		// Update lessons within the section
		for _, lessonReq := range sectionReq.Lessons {
			lesson, err := s.lessonRepo.GetByID(ctx, lessonReq.ID)
			if err != nil {
				continue // Skip if not found
			}

			lesson.Title = lessonReq.Title
			lesson.Description = lessonReq.Description
			lesson.Position = lessonReq.Order
			lesson.EstimatedDurationMinutes = lessonReq.EstimatedDurationMinutes
			lesson.LearningObjectives = lessonReq.LearningObjectives

			if err := s.lessonRepo.Update(ctx, lesson); err != nil {
				log.Error("failed to update lesson", "lessonID", lesson.ID, "error", err)
				return nil, domainerrors.ErrInternal.WithCause(err)
			}
		}
	}

	// Reload the outline
	outline, err = s.outlineRepo.GetByID(ctx, outlineID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Load sections for the outline
	loadedSections, err := s.sectionRepo.ListByOutlineID(ctx, outlineID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	outline.Sections = make([]entity.OutlineSection, len(loadedSections))
	for i, section := range loadedSections {
		// Load lessons for each section
		lessons, _ := s.lessonRepo.ListBySectionID(ctx, section.ID)
		section.Lessons = make([]entity.OutlineLesson, len(lessons))
		for j, lesson := range lessons {
			section.Lessons[j] = *lesson
		}
		outline.Sections[i] = *section
	}

	log.Info("outline updated", "sectionsCount", len(sections))
	return outline, nil
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

// GenerateLessonContent starts a lesson content generation job.
func (s *AIGenerationService) GenerateLessonContent(ctx context.Context, kratosID uuid.UUID, req GenerateLessonContentRequest) (*GenerateLessonContentResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID, "lessonID", req.OutlineLessonID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Verify outline is approved
	outline, err := s.outlineRepo.GetByCourseID(ctx, req.CourseID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	if outline.ApprovalStatus != valueobject.OutlineApprovalStatusApproved {
		return nil, domainerrors.ErrInvalidInput.WithMessage("outline must be approved before generating content")
	}

	// Create the job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeLessonContent,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		OutlineLessonID: &req.OutlineLessonID, // References outline_lessons table
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create lesson generation job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Publish job created event for real-time streaming
	s.publishJobEvent(ctx, "created", job)

	log.Info("lesson content generation job created", "jobID", job.ID)

	// Push: Enqueue for immediate processing (if task enqueuer available)
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue job for immediate processing, will be picked up by poll", "error", err)
		}
	}

	return &GenerateLessonContentResult{Job: job}, nil
}

// ProcessLessonGenerationJob processes a lesson content generation job.
// This is called by the background worker.
// Note: Job is already claimed as 'processing' with started_at set by GetNextQueued.
func (s *AIGenerationService) ProcessLessonGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "outlineLessonID", job.OutlineLessonID)

	// Check for cancellation at start (e.g., parent job was cancelled)
	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Job is already marked as 'processing' by GetNextQueued (atomic claim)
	// Just update the progress message
	progressMsg := "Loading lesson context..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress message", "error", err)
	}

	// Get outline lesson using OutlineLessonID (references outline_lessons table)
	if job.OutlineLessonID == nil {
		return s.failJob(ctx, job, "outline lesson ID not set")
	}
	outlineLesson, err := s.lessonRepo.GetByID(ctx, *job.OutlineLessonID)
	if err != nil || outlineLesson == nil {
		return s.failJob(ctx, job, "outline lesson not found")
	}

	// Get section for context
	section, err := s.sectionRepo.GetByID(ctx, outlineLesson.SectionID)
	if err != nil || section == nil {
		return s.failJob(ctx, job, "section not found")
	}

	// Get generation input (may contain additional context)
	genInput, err := s.genInputRepo.GetByCourseID(ctx, *job.CourseID)
	if err != nil || genInput == nil {
		return s.failJob(ctx, job, "generation input not found")
	}

	// Update progress
	job.ProgressPercent = 30
	progressMsg = "Generating lesson content with AI..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress", "progress", 30, "error", err)
	}

	// Check for cancellation before expensive AI call
	if s.checkJobCancelled(ctx, job.ID) {
		log.Info("job cancelled before AI generation")
		return s.markJobCancelled(ctx, job)
	}

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Generate lesson content
	lessonResult, err := aiProvider.GenerateLessonContent(ctx, service.GenerateLessonRequest{
		CourseTitle:        "", // Could be fetched
		SectionTitle:       section.Title,
		LessonTitle:        outlineLesson.Title,
		LessonDescription:  outlineLesson.Description,
		LearningObjectives: outlineLesson.LearningObjectives,
		SMEKnowledge:       []service.SMEKnowledgeInput{}, // Empty since SME removed
		TargetAudience:     service.TargetAudienceInput{}, // Empty since target audience removed
		IsLastInSection:    outlineLesson.IsLastInSection,
		IsLastInCourse:     outlineLesson.IsLastInCourse,
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
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress", "progress", 70, "error", err)
	}

	// Create generated lesson
	genLesson := &entity.GeneratedLesson{
		ID:              uuid.New(),
		TenantID:        job.TenantID,
		CourseID:        *job.CourseID,
		SectionID:       section.ID,
		OutlineLessonID: outlineLesson.ID,
		Title:           outlineLesson.Title,
		GeneratedAt:     time.Now(),
	}
	if lessonResult.SegueText != "" {
		genLesson.SegueText = &lessonResult.SegueText
	}

	if err := s.genLessonRepo.Create(ctx, genLesson); err != nil {
		log.Error("failed to create generated lesson", "error", err)
		return s.failJob(ctx, job, "failed to store lesson")
	}

	// Build S3 components from AI result
	now := time.Now()
	s3Components := make([]S3LessonComponent, len(lessonResult.Components))
	for i, compResult := range lessonResult.Components {
		compType, _ := valueobject.ParseLessonComponentType(compResult.Type)
		s3Components[i] = S3LessonComponent{
			ID:                   uuid.New().String(),
			Type:                 string(compType),
			Order:                int32(compResult.Order),
			ContentJSON:          json.RawMessage(compResult.ContentJSON),
			LearningObjectiveIDs: []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
		}
	}

	// Create S3 lesson with components
	s3Lesson := S3GeneratedLesson{
		ID:              genLesson.ID.String(),
		SectionID:       genLesson.SectionID.String(),
		OutlineLessonID: genLesson.OutlineLessonID.String(),
		Title:           genLesson.Title,
		SegueText:       genLesson.SegueText,
		Components:      s3Components,
		GeneratedAt:     genLesson.GeneratedAt,
	}

	// Read existing content.json and add the new lesson
	content, err := s.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		// content.json doesn't exist yet, create a new one
		log.Info("creating new content.json for course", "courseID", job.CourseID)
		content = &S3CourseContent{
			GeneratedLessons: []S3GeneratedLesson{},
		}
	}

	// Add or update the lesson in content
	upsertS3Lesson(content, s3Lesson)

	// Write updated content back to MinIO
	if err := s.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		log.Error("failed to write components to MinIO", "error", err)
		return s.failJob(ctx, job, "failed to store lesson components")
	}

	log.Info("lesson components stored in MinIO", "componentCount", len(s3Components))

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, lessonResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	progressMsg = "Lesson generation complete"
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to mark job as completed", "error", err)
	}

	// Publish job completed event for real-time streaming
	s.publishJobEvent(ctx, "completed", job)

	// Only notify for standalone lesson generation (not part of full course generation)
	// Full course generation sends ONE notification when all lessons are done
	if s.notifier != nil && job.ParentJobID == nil {
		if err := s.notifier.NotifyJobProgress(ctx, job.CreatedByUserID, job.ID, "Lesson Content", "completed", 100); err != nil {
			log.Error("failed to send completion notification", "error", err)
		}
	}

	log.Info("lesson generation completed", "tokensUsed", lessonResult.TokensUsed)

	// Check if this job has a parent and if all siblings are complete
	if job.ParentJobID != nil {
		if err := s.checkAndCompleteParentJob(ctx, *job.ParentJobID); err != nil {
			log.Error("failed to check parent job completion", "parentJobID", job.ParentJobID, "error", err)
		}
	}

	return nil
}

// checkAndCompleteParentJob checks child job progress and updates the parent job.
// Uses atomic locking to prevent race conditions when multiple children complete simultaneously.
// The parent status update now happens INSIDE the atomic transaction via FinalizeParentJob.
func (s *AIGenerationService) checkAndCompleteParentJob(ctx context.Context, parentJobID uuid.UUID) error {
	log := s.logger.With("parentJobID", parentJobID)

	// Use the new atomic FinalizeParentJob which updates status inside the lock
	// This prevents the race where we win the lock but crash before updating status
	result, err := s.jobRepo.FinalizeParentJob(
		ctx,
		parentJobID,
		valueobject.GenerationJobStatusCompleted.String(), // status if all succeed
		valueobject.GenerationJobStatusFailed.String(),    // status if any fail
		"All lessons generated successfully",              // progress message
	)
	if err != nil {
		return fmt.Errorf("failed to finalize parent job: %w", err)
	}

	if result == nil {
		return nil // Parent job not found
	}

	// If another worker already finalized, nothing to do
	if !result.WasFinalized && result.AllComplete {
		log.Info("parent job already finalized by another worker")
		return nil
	}

	// If not all complete, just update progress (non-atomic is fine for progress)
	if !result.AllComplete {
		// Get parent job for progress update
		parentJob, err := s.jobRepo.GetByID(ctx, parentJobID)
		if err != nil || parentJob == nil {
			log.Error("failed to get parent job for progress update", "error", err)
			return nil
		}

		// Calculate progress percentage (10% reserved for initial queuing, 90% for lesson generation)
		doneCount := result.CompletedCount + result.FailedCount
		progressPercent := int32(10)
		if result.TotalCount > 0 {
			progressPercent = int32(10 + (90 * doneCount / result.TotalCount))
		}

		progressMsg := fmt.Sprintf("Generated %d of %d lessons...", result.CompletedCount, result.TotalCount)
		parentJob.ProgressPercent = progressPercent
		parentJob.ProgressMessage = &progressMsg
		parentJob.TokensUsed = result.TotalTokens

		if err := s.jobRepo.Update(ctx, parentJob); err != nil {
			log.Error("failed to update parent job progress", "progress", progressPercent, "error", err)
		} else {
			log.Info("parent job progress updated", "progress", progressPercent, "completed", result.CompletedCount, "total", result.TotalCount)
		}
		return nil
	}

	// We won the race and status was updated atomically - now send notifications
	log.Info("parent job finalized atomically", "completed", result.CompletedCount, "failed", result.FailedCount, "totalTokens", result.TotalTokens)

	// Get parent job to fetch course info for notification
	parentJob, err := s.jobRepo.GetByID(ctx, parentJobID)
	if err != nil || parentJob == nil {
		log.Error("failed to get parent job for notification", "error", err)
		return nil // Status already updated, notification failure is non-fatal
	}

	// Get course title for notification
	courseTitle := "Course"
	if parentJob.CourseID != nil {
		courseTitle = "Your Course"
	}

	// Send appropriate notification based on result
	if result.FailedCount > 0 {
		errMsg := fmt.Sprintf("%d lesson(s) failed to generate", result.FailedCount)
		if s.completionNotifier != nil && parentJob.CourseID != nil {
			if err := s.completionNotifier.NotifyCourseFailed(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle, errMsg); err != nil {
				log.Error("failed to send course failure notification", "error", err)
			}
		}
		log.Info("parent job marked as failed", "failedCount", result.FailedCount)
	} else {
		if s.completionNotifier != nil && parentJob.CourseID != nil {
			if err := s.completionNotifier.NotifyCourseComplete(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle); err != nil {
				log.Error("failed to send course completion notification", "error", err)
			}
		}
		log.Info("parent job marked as completed", "totalTokens", result.TotalTokens, "lessonsGenerated", result.TotalCount)
	}

	return nil
}

// GenerateAllLessonsResult contains the created job.
type GenerateAllLessonsResult struct {
	Job *entity.GenerationJob
}

// GenerateAllLessons starts lesson content generation jobs for all lessons in the course.
// Creates a FULL_COURSE parent job to track overall completion.
func (s *AIGenerationService) GenerateAllLessons(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*GenerateAllLessonsResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", courseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Get the approved outline for the course
	outline, err := s.outlineRepo.GetByCourseID(ctx, courseID)
	if err != nil || outline == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	if outline.ApprovalStatus != valueobject.OutlineApprovalStatusApproved {
		return nil, domainerrors.ErrForbidden.WithMessage("outline must be approved before generating lessons")
	}

	// Load sections with lessons
	loadedSections, err := s.sectionRepo.ListByOutlineID(ctx, outline.ID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	outline.Sections = make([]entity.OutlineSection, len(loadedSections))
	for i, section := range loadedSections {
		lessons, _ := s.lessonRepo.ListBySectionID(ctx, section.ID)
		section.Lessons = make([]entity.OutlineLesson, len(lessons))
		for j, lesson := range lessons {
			section.Lessons[j] = *lesson
		}
		outline.Sections[i] = *section
	}

	// Count total lessons
	totalLessons := 0
	for _, section := range outline.Sections {
		totalLessons += len(section.Lessons)
	}

	if totalLessons == 0 {
		return nil, domainerrors.ErrInvalidInput.WithMessage("no lessons in outline")
	}

	// Create a FULL_COURSE parent job to track overall completion
	parentJob := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeFullCourse,
		Status:          valueobject.GenerationJobStatusProcessing, // Parent is processing while children are queued
		CourseID:        &courseID,
		ProgressPercent: 0,
		MaxRetries:      0, // Parent job doesn't retry
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

	// Build all child jobs first with pre-generated UUIDs
	var childJobs []*entity.GenerationJob
	for _, section := range outline.Sections {
		for _, lesson := range section.Lessons {
			outlineLessonID := lesson.ID
			job := &entity.GenerationJob{
				ID:              uuid.New(),
				TenantID:        *user.TenantID,
				Type:            valueobject.GenerationJobTypeLessonContent,
				Status:          valueobject.GenerationJobStatusQueued,
				CourseID:        &courseID,
				OutlineLessonID: &outlineLessonID, // References outline_lessons table
				ParentJobID:     &parentJob.ID,    // Link to parent job
				ProgressPercent: 0,
				MaxRetries:      3,
				CreatedByUserID: user.ID,
				CreatedAt:       time.Now(),
			}
			childJobs = append(childJobs, job)
		}
	}

	// Atomically create all child jobs in a single transaction
	// If any fails, all are rolled back and we fail the parent job
	if err := s.jobRepo.CreateBatch(ctx, childJobs); err != nil {
		log.Error("failed to create lesson jobs atomically", "error", err)
		// Fail the parent job since no children were created
		_ = s.failJob(ctx, parentJob, fmt.Sprintf("failed to queue lesson jobs: %v", err))
		return nil, domainerrors.ErrInternal.WithMessage("failed to queue lesson generation jobs")
	}

	log.Info("queued all lesson generation jobs", "totalLessons", totalLessons, "parentJobID", parentJob.ID)
	return &GenerateAllLessonsResult{Job: parentJob}, nil
}

// RegenerateComponentRequest contains inputs for component regeneration.
type RegenerateComponentRequest struct {
	CourseID           uuid.UUID
	LessonID           uuid.UUID
	ComponentID        uuid.UUID
	ModificationPrompt string
}

// RegenerateComponentResult contains the created job.
type RegenerateComponentResult struct {
	Job *entity.GenerationJob
}

// RegenerateComponent starts a job to regenerate a single lesson component.
func (s *AIGenerationService) RegenerateComponent(ctx context.Context, kratosID uuid.UUID, req RegenerateComponentRequest) (*RegenerateComponentResult, error) {
	log := s.logger.With("kratosID", kratosID, "componentID", req.ComponentID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Verify the component exists
	component, err := s.componentRepo.GetByID(ctx, req.ComponentID)
	if err != nil || component == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("component not found")
	}

	// Verify the lesson exists
	lesson, err := s.genLessonRepo.GetByID(ctx, req.LessonID)
	if err != nil || lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("lesson not found")
	}

	// Create the regeneration job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeComponentRegen,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		LessonID:        &req.LessonID,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	// Store modification prompt as JSON in result path temporarily
	// The worker will read this and use it for regeneration
	inputData, _ := json.Marshal(map[string]string{
		"component_id":        req.ComponentID.String(),
		"modification_prompt": req.ModificationPrompt,
	})
	inputPath := string(inputData)
	job.ResultPath = &inputPath

	progressMsg := "Queued for component regeneration"
	job.ProgressMessage = &progressMsg

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create regeneration job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("component regeneration job created", "jobID", job.ID, "componentID", req.ComponentID)

	// Push: Enqueue for immediate processing (if task enqueuer available)
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue job for immediate processing, will be picked up by poll", "error", err)
		}
	}

	return &RegenerateComponentResult{Job: job}, nil
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
// If the job is a parent job (e.g., full_course), it also cascades cancellation to all child jobs.
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

	// If this is a parent job (full_course), cancel all child jobs first
	if job.Type == valueobject.GenerationJobTypeFullCourse {
		children, err := s.jobRepo.ListByParentID(ctx, jobID)
		if err == nil {
			cancelledChildren := 0
			for _, child := range children {
				// Only cancel queued or processing children
				if child.Status == valueobject.GenerationJobStatusQueued ||
					child.Status == valueobject.GenerationJobStatusProcessing {
					child.Status = valueobject.GenerationJobStatusCancelled
					child.CompletedAt = &now
					childMsg := "Cancelled: parent job cancelled"
					child.ProgressMessage = &childMsg
					if err := s.jobRepo.Update(ctx, child); err != nil {
						log.Warn("failed to cancel child job", "childJobID", child.ID, "error", err)
					} else {
						cancelledChildren++
					}
				}
			}
			log.Info("cancelled child jobs", "count", cancelledChildren, "total", len(children))
		}
	}

	// Cancel the main job
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

// GetGeneratedLesson retrieves a generated lesson by ID.
// Components are loaded from MinIO content.json for cost efficiency.
func (s *AIGenerationService) GetGeneratedLesson(ctx context.Context, kratosID uuid.UUID, lessonID uuid.UUID) (*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Get lesson metadata from PostgreSQL
	lesson, err := s.genLessonRepo.GetByID(ctx, lessonID)
	if err != nil || lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("generated lesson not found")
	}

	// Read course content from MinIO to get components
	content, err := s.readCourseContent(ctx, tenantID, lesson.CourseID)
	if err != nil {
		// If content.json doesn't exist yet, return lesson without components
		s.logger.Warn("course content not found in MinIO, returning empty components", "courseID", lesson.CourseID)
		lesson.Components = []entity.LessonComponent{}
		return lesson, nil
	}

	// Find the lesson in content.json
	s3Lesson := findS3Lesson(content, lessonID.String())
	if s3Lesson != nil {
		// Convert S3 components to entity components
		lesson.Components = make([]entity.LessonComponent, len(s3Lesson.Components))
		for i, s3Comp := range s3Lesson.Components {
			compID, _ := uuid.Parse(s3Comp.ID)
			lesson.Components[i] = entity.LessonComponent{
				ID:                   compID,
				TenantID:             tenantID,
				LessonID:             lessonID,
				Type:                 valueobject.LessonComponentType(s3Comp.Type),
				Position:             s3Comp.Order,
				ContentJSON:          s3Comp.ContentJSON,
				LearningObjectiveIDs: s3Comp.LearningObjectiveIDs,
				CreatedAt:            s3Comp.CreatedAt,
				UpdatedAt:            s3Comp.UpdatedAt,
			}
		}
	} else {
		lesson.Components = []entity.LessonComponent{}
	}

	// Refresh image URLs to ensure they work across devices
	s.refreshImageURLs(ctx, lesson.Components)

	return lesson, nil
}

// ListGeneratedLessons retrieves all generated lessons for a course.
// Components are loaded from MinIO content.json for cost efficiency.
func (s *AIGenerationService) ListGeneratedLessons(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) ([]*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Get lesson metadata from PostgreSQL
	lessons, err := s.genLessonRepo.ListByCourseID(ctx, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Read course content from MinIO to get components
	content, err := s.readCourseContent(ctx, tenantID, courseID)
	if err != nil {
		// If content.json doesn't exist yet, return lessons without components
		s.logger.Warn("course content not found in MinIO, returning empty components", "courseID", courseID)
		for _, lesson := range lessons {
			lesson.Components = []entity.LessonComponent{}
		}
		return lessons, nil
	}

	// Build a map of lesson ID -> S3 lesson for quick lookup
	s3LessonMap := make(map[string]*S3GeneratedLesson)
	for i := range content.GeneratedLessons {
		s3LessonMap[content.GeneratedLessons[i].ID] = &content.GeneratedLessons[i]
	}

	// Load components for each lesson from content.json
	for _, lesson := range lessons {
		s3Lesson, ok := s3LessonMap[lesson.ID.String()]
		if ok && s3Lesson != nil {
			// Convert S3 components to entity components
			lesson.Components = make([]entity.LessonComponent, len(s3Lesson.Components))
			for i, s3Comp := range s3Lesson.Components {
				compID, _ := uuid.Parse(s3Comp.ID)
				lesson.Components[i] = entity.LessonComponent{
					ID:                   compID,
					TenantID:             tenantID,
					LessonID:             lesson.ID,
					Type:                 valueobject.LessonComponentType(s3Comp.Type),
					Position:             s3Comp.Order,
					ContentJSON:          s3Comp.ContentJSON,
					LearningObjectiveIDs: s3Comp.LearningObjectiveIDs,
					CreatedAt:            s3Comp.CreatedAt,
					UpdatedAt:            s3Comp.UpdatedAt,
				}
			}
		} else {
			lesson.Components = []entity.LessonComponent{}
		}

		// Refresh image URLs to ensure they work across devices
		s.refreshImageURLs(ctx, lesson.Components)
	}

	return lessons, nil
}

// Helper to fail a job with an error message.
func (s *AIGenerationService) failJob(ctx context.Context, job *entity.GenerationJob, errMsg string) error {
	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now

	if err := s.jobRepo.Update(ctx, job); err != nil {
		s.logger.Error("failed to mark job as failed", "jobID", job.ID, "error", err)
	}

	// Publish job failed event for real-time streaming
	s.publishJobEvent(ctx, "failed", job)

	// Notify user of failure (tenant-isolated via user lookup)
	if s.notifier != nil {
		jobType := "Generation"
		switch job.Type {
		case valueobject.GenerationJobTypeCourseOutline:
			jobType = "Course Outline"
		case valueobject.GenerationJobTypeLessonContent:
			jobType = "Lesson Content"
		case valueobject.GenerationJobTypeComponentRegen:
			jobType = "Component Regeneration"
		}
		if err := s.notifier.NotifyJobProgress(ctx, job.CreatedByUserID, job.ID, jobType, "failed", 0); err != nil {
			s.logger.Error("failed to send failure notification", "jobID", job.ID, "error", err)
		}
	}

	return fmt.Errorf("%s", errMsg)
}

// checkJobCancelled checks if a job has been cancelled by re-fetching its status from the database.
// Returns true if the job was cancelled, false otherwise.
// This should be called at key points during long-running operations to allow early termination.
func (s *AIGenerationService) checkJobCancelled(ctx context.Context, jobID uuid.UUID) bool {
	// Check context cancellation first
	select {
	case <-ctx.Done():
		return true
	default:
	}

	// Check job status in database
	currentJob, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return false // Can't determine, assume not cancelled
	}
	return currentJob.Status == valueobject.GenerationJobStatusCancelled
}

// markJobCancelled marks a job as cancelled if it was cancelled during processing.
func (s *AIGenerationService) markJobCancelled(ctx context.Context, job *entity.GenerationJob) error {
	job.Status = valueobject.GenerationJobStatusCancelled
	now := time.Now()
	job.CompletedAt = &now
	msg := "Cancelled during processing"
	job.ProgressMessage = &msg

	if err := s.jobRepo.Update(ctx, job); err != nil {
		s.logger.Error("failed to mark job as cancelled", "jobID", job.ID, "error", err)
		return err
	}

	// Publish job cancelled event for real-time streaming
	s.publishJobEvent(ctx, "cancelled", job)

	return nil
}

// RunBackground starts the background job processing loop.
// This polls for queued generation jobs and processes them.
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
				log.Error("error processing generation job", "error", err)
			}
		}
	}
}

// ProcessNextQueuedJob processes the next queued generation job.
// This is called by the Asynq worker scheduler.
func (s *AIGenerationService) ProcessNextQueuedJob(ctx context.Context) error {
	return s.processNextJob(ctx)
}

// processNextJob processes the next queued generation job.
// Sets up tenant context from the job for proper RLS isolation.
func (s *AIGenerationService) processNextJob(ctx context.Context) error {
	s.logger.Debug("checking for queued generation jobs")

	// GetNextQueued uses FOR UPDATE SKIP LOCKED and runs with superadmin context
	// to allow picking up jobs from any tenant
	adminCtx := tenant.WithSuperAdmin(ctx, true)
	job, err := s.jobRepo.GetNextQueued(adminCtx)
	if err != nil {
		s.logger.Error("failed to get next queued job", "error", err)
		return err
	}

	if job == nil {
		s.logger.Debug("no queued generation jobs found")
		return nil // No jobs to process
	}

	// Set up tenant context from the job for RLS isolation
	// All subsequent operations will be scoped to this tenant
	// IMPORTANT: Build from adminCtx to preserve superadmin flag for worker operations
	tenantCtx := tenant.WithTenantID(adminCtx, job.TenantID)

	s.logger.Info("processing AI generation job", "jobID", job.ID, "type", job.Type, "tenantID", job.TenantID)

	// Process based on job type
	switch job.Type {
	case valueobject.GenerationJobTypeCourseOutline:
		return s.ProcessOutlineGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeLessonContent:
		return s.ProcessLessonGenerationJob(tenantCtx, job)
	default:
		// Unknown/unsupported job type - fail it so it doesn't stay stuck in 'processing'
		// This handles bad data in DB or enum parse failures from repository
		s.logger.Error("unknown or invalid job type, marking as failed", "type", job.Type, "jobID", job.ID)
		return s.failJob(tenantCtx, job, fmt.Sprintf("unknown job type: %s", job.Type))
	}
}

// ProcessJobByID processes a specific generation job by its ID.
// This is used by the Asynq worker to process a specific job.
// Uses atomic claim to ensure idempotency - safe if called multiple times.
func (s *AIGenerationService) ProcessJobByID(ctx context.Context, jobID string) error {
	log := s.logger.With("jobID", jobID)

	id, err := uuid.Parse(jobID)
	if err != nil {
		log.Error("invalid job ID", "error", err)
		return fmt.Errorf("invalid job ID: %w", err)
	}

	// Use superadmin context for atomic claim (before we know its tenant)
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	// Atomically claim the job - this ensures idempotency
	// If job is already claimed/processed, this returns nil (no error)
	job, err := s.jobRepo.ClaimJobByID(adminCtx, id)
	if err != nil {
		log.Error("failed to claim generation job", "error", err)
		return err
	}

	if job == nil {
		// Job doesn't exist or already claimed/processed - this is expected
		// with Asynq retries or duplicate deliveries
		log.Info("job not available for claim, may already be processed")
		return nil
	}

	log.Info("job claimed successfully", "type", job.Type, "tenantID", job.TenantID)

	// Set up tenant context from the job for RLS isolation
	// All subsequent operations will be scoped to this tenant
	// IMPORTANT: Build from adminCtx to preserve superadmin flag for worker operations
	tenantCtx := tenant.WithTenantID(adminCtx, job.TenantID)

	// Process based on job type
	switch job.Type {
	case valueobject.GenerationJobTypeCourseOutline:
		return s.ProcessOutlineGenerationJob(tenantCtx, job)
	case valueobject.GenerationJobTypeLessonContent:
		return s.ProcessLessonGenerationJob(tenantCtx, job)
	default:
		// Unknown/unsupported job type - fail it so it doesn't stay stuck in 'processing'
		// This handles bad data in DB or enum parse failures from repository
		log.Error("unknown or invalid job type, marking as failed", "type", job.Type)
		return s.failJob(tenantCtx, job, fmt.Sprintf("unknown job type: %s", job.Type))
	}
}

// =============================================================================
// Image Generation
// =============================================================================

// GenerateComponentImageRequest contains the inputs for component image generation.
type GenerateComponentImageRequest struct {
	CourseID    uuid.UUID
	LessonID    uuid.UUID
	ComponentID uuid.UUID
	Prompt      string
	AspectRatio string // e.g., "16:9", "1:1", "4:3"
}

// GenerateComponentImageResult contains the result of image generation.
type GenerateComponentImageResult struct {
	ImageURL  string
	Component *entity.LessonComponent
}

// GenerateComponentImage generates an image for an image placeholder component.
// It uses Gemini to generate the image, stores it in MinIO, and updates the component.
func (s *AIGenerationService) GenerateComponentImage(ctx context.Context, kratosID uuid.UUID, req GenerateComponentImageRequest) (*GenerateComponentImageResult, error) {
	log := s.logger.With("kratosID", kratosID, "componentID", req.ComponentID, "lessonID", req.LessonID)

	// Get user and tenant
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Verify the lesson exists
	lesson, err := s.genLessonRepo.GetByID(ctx, req.LessonID)
	if err != nil || lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("lesson not found")
	}

	// Read course content from MinIO to find the component
	content, err := s.readCourseContent(ctx, tenantID, req.CourseID)
	if err != nil {
		log.Error("failed to read course content from MinIO", "error", err)
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	// Find the lesson in content.json
	s3Lesson := findS3Lesson(content, req.LessonID.String())
	if s3Lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("lesson not found in content")
	}

	// Find the component in the lesson
	var component *entity.LessonComponent
	var componentIndex int = -1
	for i, s3Comp := range s3Lesson.Components {
		if s3Comp.ID == req.ComponentID.String() {
			compID, _ := uuid.Parse(s3Comp.ID)
			component = &entity.LessonComponent{
				ID:          compID,
				TenantID:    tenantID,
				LessonID:    req.LessonID,
				Type:        valueobject.LessonComponentType(s3Comp.Type),
				Position:    s3Comp.Order,
				ContentJSON: s3Comp.ContentJSON,
			}
			componentIndex = i
			break
		}
	}

	if component == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("component not found")
	}

	// Verify it's an image component
	if component.Type != valueobject.LessonComponentTypeImage {
		return nil, domainerrors.ErrBadRequest.WithMessage("component is not an image type")
	}

	// Get AI provider for this tenant
	aiProvider, err := s.aiProviderFactory.GetProvider(ctx, tenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Generate the image
	log.Info("generating image for component", "prompt", req.Prompt)

	imageResult, err := aiProvider.GenerateImage(ctx, service.GenerateImageRequest{
		Prompt:      req.Prompt,
		AspectRatio: req.AspectRatio,
	})
	if err != nil {
		log.Error("image generation failed", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Check if storage is configured
	if s.imageStorage == nil {
		return nil, domainerrors.ErrInternal.WithMessage("image storage not configured")
	}

	// Determine file extension from MIME type
	ext := ".png"
	if imageResult.MimeType == "image/jpeg" {
		ext = ".jpg"
	} else if imageResult.MimeType == "image/webp" {
		ext = ".webp"
	}

	// Store the image in MinIO with tenant-scoped path
	// Path: tenants/{tenant_id}/generated-images/{course_id}/{lesson_id}/{component_id}{ext}
	storagePath := fmt.Sprintf("tenants/%s/generated-images/%s/%s/%s%s",
		tenantID.String(),
		req.CourseID.String(),
		req.LessonID.String(),
		req.ComponentID.String(),
		ext,
	)

	err = s.imageStorage.PutContent(ctx, storagePath, imageResult.ImageData, imageResult.MimeType)
	if err != nil {
		log.Error("failed to store image in MinIO", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Generate a download URL (valid for 24 hours for viewing in the course editor)
	imageURL, err := s.imageStorage.GenerateDownloadURL(ctx, storagePath, 24*time.Hour)
	if err != nil {
		log.Error("failed to generate download URL", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update the component's content JSON with the new image URL
	// Parse existing content, update URL, save back
	var imageContent map[string]interface{}
	if err := json.Unmarshal(component.ContentJSON, &imageContent); err != nil {
		// If we can't parse, create new content
		imageContent = make(map[string]interface{})
	}

	imageContent["storagePath"] = storagePath // Store path for fresh URL generation on load
	imageContent["url"] = imageURL            // Include URL for immediate display
	// Keep the original image_description as a reference
	if _, exists := imageContent["image_description"]; !exists {
		imageContent["image_description"] = req.Prompt
	}

	updatedContentJSON, err := json.Marshal(imageContent)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update the component in MinIO content.json using the index we found earlier
	component.ContentJSON = updatedContentJSON
	if componentIndex >= 0 {
		s3Lesson.Components[componentIndex].ContentJSON = updatedContentJSON
		s3Lesson.Components[componentIndex].UpdatedAt = time.Now()

		// Write back to MinIO
		if err := s.writeCourseContent(ctx, tenantID, req.CourseID, content); err != nil {
			log.Error("failed to write course content for image update", "error", err)
			return nil, domainerrors.ErrInternal.WithCause(err)
		}
	}

	log.Info("image generated and stored successfully",
		"storagePath", storagePath,
		"tokensUsed", imageResult.TokensUsed,
	)

	return &GenerateComponentImageResult{
		ImageURL:  imageURL,
		Component: component,
	}, nil
}

// UpdateLessonComponentsRequest contains the inputs for updating lesson components.
type UpdateLessonComponentsRequest struct {
	CourseID   uuid.UUID
	LessonID   uuid.UUID
	Components []UpdateComponentInput
}

// UpdateComponentInput represents a single component update.
type UpdateComponentInput struct {
	ID                   string // Can be existing UUID or temp-* for new components
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
// Components are stored in MinIO content.json for cost efficiency.
func (s *AIGenerationService) UpdateLessonComponents(ctx context.Context, kratosID uuid.UUID, req UpdateLessonComponentsRequest) (*UpdateLessonComponentsResult, error) {
	// Get user and tenant
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	tenantID := *user.TenantID

	// Verify the lesson exists in PostgreSQL (metadata only)
	lesson, err := s.genLessonRepo.GetByID(ctx, req.LessonID)
	if err != nil || lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("lesson not found")
	}

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, tenantID, req.CourseID)
	if err != nil {
		s.logger.Error("failed to read course content from MinIO", "error", err, "courseID", req.CourseID)
		return nil, err
	}

	// Find or create the lesson in the content
	s3Lesson := findS3Lesson(content, req.LessonID.String())
	if s3Lesson == nil {
		// Lesson doesn't exist in content.json yet, create it
		s3Lesson = &S3GeneratedLesson{
			ID:              lesson.ID.String(),
			SectionID:       lesson.SectionID.String(),
			OutlineLessonID: lesson.OutlineLessonID.String(),
			Title:           lesson.Title,
			SegueText:       lesson.SegueText,
			GeneratedAt:     lesson.GeneratedAt,
			Components:      []S3LessonComponent{},
		}
	}

	// Build updated components from request
	now := time.Now()
	updatedComponents := make([]S3LessonComponent, len(req.Components))
	for i, input := range req.Components {
		// Check if this is a new component (temp-* prefix) or existing
		compID := input.ID
		createdAt := now
		if len(input.ID) > 5 && input.ID[:5] == "temp-" {
			// New component - generate UUID
			compID = uuid.New().String()
		} else {
			// Try to preserve createdAt from existing component
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

	// Update the lesson's components
	s3Lesson.Components = updatedComponents

	// Upsert the lesson in the content
	upsertS3Lesson(content, *s3Lesson)

	// Write updated content back to MinIO
	if err := s.writeCourseContent(ctx, tenantID, req.CourseID, content); err != nil {
		s.logger.Error("failed to write course content to MinIO", "error", err, "courseID", req.CourseID)
		return nil, err
	}

	// Convert to entity for response
	updatedLesson, err := s3LessonToEntity(s3Lesson, tenantID, req.CourseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Refresh image URLs to ensure they work across devices
	s.refreshImageURLs(ctx, updatedLesson.Components)

	s.logger.Info("lesson components updated in MinIO",
		"lessonID", req.LessonID,
		"courseID", req.CourseID,
		"componentCount", len(req.Components),
	)

	return &UpdateLessonComponentsResult{
		Lesson: updatedLesson,
	}, nil
}

// GetUserIDByKratosID returns the user's internal ID from their Kratos ID.
// Used for subscribing to real-time job events.
func (s *AIGenerationService) GetUserIDByKratosID(ctx context.Context, kratosID uuid.UUID) (uuid.UUID, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return uuid.Nil, domainerrors.ErrUserNotFound
	}
	return user.ID, nil
}

// publishJobEvent publishes a job event for real-time streaming.
// This is fire-and-forget - errors are logged but don't fail the operation.
func (s *AIGenerationService) publishJobEvent(ctx context.Context, eventType string, job *entity.GenerationJob) {
	if s.jobEventPublisher == nil {
		return
	}

	if err := s.jobEventPublisher.PublishJobEvent(ctx, job.CreatedByUserID, eventType, job); err != nil {
		s.logger.Warn("failed to publish job event",
			"error", err,
			"eventType", eventType,
			"jobID", job.ID,
		)
	}
}

// refreshImageURLs generates fresh presigned URLs for image components.
// This ensures images load correctly on any device by regenerating URLs from stored paths.
func (s *AIGenerationService) refreshImageURLs(ctx context.Context, components []entity.LessonComponent) {
	if s.imageStorage == nil {
		return
	}

	for i := range components {
		comp := &components[i]
		if comp.Type != valueobject.LessonComponentTypeImage {
			continue
		}

		var content map[string]interface{}
		if err := json.Unmarshal(comp.ContentJSON, &content); err != nil {
			continue
		}

		storagePath, ok := content["storagePath"].(string)
		if !ok || storagePath == "" {
			continue
		}

		// Generate fresh presigned URL (1 hour expiry for viewing)
		url, err := s.imageStorage.GenerateDownloadURL(ctx, storagePath, 1*time.Hour)
		if err != nil {
			s.logger.Warn("failed to generate image URL",
				"componentID", comp.ID,
				"storagePath", storagePath,
				"error", err,
			)
			continue
		}

		content["url"] = url
		updatedJSON, err := json.Marshal(content)
		if err != nil {
			continue
		}
		comp.ContentJSON = updatedJSON
	}
}

// ============================================================================
// MinIO Content Storage Helpers
// ============================================================================

// readCourseContent reads the course content.json from MinIO.
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

// writeCourseContent writes the course content.json to MinIO.
func (s *AIGenerationService) writeCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content *S3CourseContent) error {
	if s.contentStorage == nil {
		return domainerrors.ErrInternal.WithMessage("content storage not configured")
	}

	if err := s.contentStorage.WriteCourseContent(ctx, tenantID, courseID, content); err != nil {
		return domainerrors.ErrInternal.WithCause(err)
	}
	return nil
}

// findS3Lesson finds a lesson by ID in the S3CourseContent.
func findS3Lesson(content *S3CourseContent, lessonID string) *S3GeneratedLesson {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonID {
			return &content.GeneratedLessons[i]
		}
	}
	return nil
}

// upsertS3Lesson adds or updates a lesson in the S3CourseContent.
func upsertS3Lesson(content *S3CourseContent, lesson S3GeneratedLesson) {
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lesson.ID {
			content.GeneratedLessons[i] = lesson
			return
		}
	}
	// Not found, append
	content.GeneratedLessons = append(content.GeneratedLessons, lesson)
}

// s3LessonToEntity converts an S3GeneratedLesson to domain entity.
func s3LessonToEntity(s3Lesson *S3GeneratedLesson, tenantID, courseID uuid.UUID) (*entity.GeneratedLesson, error) {
	lessonID, err := uuid.Parse(s3Lesson.ID)
	if err != nil {
		return nil, err
	}

	sectionID, err := uuid.Parse(s3Lesson.SectionID)
	if err != nil {
		return nil, err
	}

	outlineLessonID, err := uuid.Parse(s3Lesson.OutlineLessonID)
	if err != nil {
		return nil, err
	}

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

	for i, s3Comp := range s3Lesson.Components {
		compID, err := uuid.Parse(s3Comp.ID)
		if err != nil {
			compID = uuid.New() // Generate new ID if parsing fails
		}

		lesson.Components[i] = entity.LessonComponent{
			ID:                   compID,
			TenantID:             tenantID,
			LessonID:             lessonID,
			Type:                 valueobject.LessonComponentType(s3Comp.Type),
			Position:             s3Comp.Order,
			ContentJSON:          s3Comp.ContentJSON,
			LearningObjectiveIDs: s3Comp.LearningObjectiveIDs,
			CreatedAt:            s3Comp.CreatedAt,
			UpdatedAt:            s3Comp.UpdatedAt,
		}
	}

	return lesson, nil
}

// entityToS3Lesson converts a domain entity to S3GeneratedLesson.
func entityToS3Lesson(lesson *entity.GeneratedLesson) S3GeneratedLesson {
	s3Lesson := S3GeneratedLesson{
		ID:              lesson.ID.String(),
		SectionID:       lesson.SectionID.String(),
		OutlineLessonID: lesson.OutlineLessonID.String(),
		Title:           lesson.Title,
		SegueText:       lesson.SegueText,
		GeneratedAt:     lesson.GeneratedAt,
		Components:      make([]S3LessonComponent, len(lesson.Components)),
	}

	for i, comp := range lesson.Components {
		s3Lesson.Components[i] = S3LessonComponent{
			ID:                   comp.ID.String(),
			Type:                 string(comp.Type),
			Order:                comp.Position,
			ContentJSON:          comp.ContentJSON,
			LearningObjectiveIDs: comp.LearningObjectiveIDs,
			CreatedAt:            comp.CreatedAt,
			UpdatedAt:            comp.UpdatedAt,
		}
	}

	return s3Lesson
}
