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

// AIGenerationService handles AI-powered content generation.
type AIGenerationService struct {
	userRepo            repository.UserRepository
	smeRepo             repository.SMERepository
	smeKnowledgeRepo    repository.SMEKnowledgeRepository
	audienceRepo        repository.TargetAudienceRepository
	jobRepo             repository.GenerationJobRepository
	outlineRepo         repository.CourseOutlineRepository
	sectionRepo         repository.OutlineSectionRepository
	lessonRepo          repository.OutlineLessonRepository
	genLessonRepo       repository.GeneratedLessonRepository
	componentRepo       repository.LessonComponentRepository
	genInputRepo        repository.CourseGenerationInputRepository
	aiSettingsRepo      repository.TenantAISettingsRepository
	aiProviderFactory   AIProviderFactory
	notifier            JobNotifier
	completionNotifier  CourseCompletionNotifier
	logger              service.Logger
}

// NewAIGenerationService creates a new AI generation service.
func NewAIGenerationService(
	userRepo repository.UserRepository,
	smeRepo repository.SMERepository,
	smeKnowledgeRepo repository.SMEKnowledgeRepository,
	audienceRepo repository.TargetAudienceRepository,
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
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:            userRepo,
		smeRepo:             smeRepo,
		smeKnowledgeRepo:    smeKnowledgeRepo,
		audienceRepo:        audienceRepo,
		jobRepo:             jobRepo,
		outlineRepo:         outlineRepo,
		sectionRepo:         sectionRepo,
		lessonRepo:          lessonRepo,
		genLessonRepo:       genLessonRepo,
		componentRepo:       componentRepo,
		genInputRepo:        genInputRepo,
		aiSettingsRepo:      aiSettingsRepo,
		aiProviderFactory:   aiProviderFactory,
		notifier:            notifier,
		completionNotifier:  completionNotifier,
		logger:              logger,
	}
}

// GenerateCourseOutlineRequest contains the inputs for outline generation.
type GenerateCourseOutlineRequest struct {
	CourseID          uuid.UUID
	CourseTitle       string
	SMEIDs            []uuid.UUID
	TargetAudienceIDs []uuid.UUID
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

	// Validate SMEs exist and user has access
	for _, smeID := range req.SMEIDs {
		sme, err := s.smeRepo.GetByID(ctx, smeID)
		if err != nil || sme == nil {
			return nil, domainerrors.ErrSMENotFound
		}
	}

	// Validate target audiences exist
	for _, audienceID := range req.TargetAudienceIDs {
		audience, err := s.audienceRepo.GetByID(ctx, audienceID)
		if err != nil || audience == nil {
			return nil, domainerrors.ErrTargetAudienceNotFound
		}
	}

	// Store generation input
	genInput := &entity.CourseGenerationInput{
		ID:                uuid.New(),
		TenantID:          *user.TenantID,
		CourseID:          req.CourseID,
		SMEIDs:            req.SMEIDs,
		TargetAudienceIDs: req.TargetAudienceIDs,
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

	log.Info("course outline generation job created", "jobID", job.ID)
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
	progressMsg := "Gathering SME knowledge..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress message", "error", err)
	}

	// Get generation input
	genInput, err := s.genInputRepo.GetByCourseID(ctx, *job.CourseID)
	if err != nil || genInput == nil {
		return s.failJob(ctx, job, "failed to get generation input")
	}

	// Gather SME knowledge
	smeKnowledge := make([]service.SMEKnowledgeInput, 0, len(genInput.SMEIDs))
	for _, smeID := range genInput.SMEIDs {
		sme, err := s.smeRepo.GetByID(ctx, smeID)
		if err != nil || sme == nil {
			continue
		}

		chunks, err := s.smeKnowledgeRepo.ListBySMEID(ctx, smeID)
		if err != nil {
			log.Warn("failed to get SME knowledge chunks", "smeID", smeID, "error", err)
			continue
		}

		chunkTexts := make([]string, len(chunks))
		keywords := make([]string, 0)
		for i, chunk := range chunks {
			chunkTexts[i] = chunk.Content
			keywords = append(keywords, chunk.Keywords...)
		}

		summary := ""
		if sme.KnowledgeSummary != nil {
			summary = *sme.KnowledgeSummary
		}

		smeKnowledge = append(smeKnowledge, service.SMEKnowledgeInput{
			SMEName:  sme.Name,
			Domain:   sme.Domain,
			Summary:  summary,
			Chunks:   chunkTexts,
			Keywords: keywords,
		})
	}

	if len(smeKnowledge) == 0 {
		return s.failJob(ctx, job, "no SME knowledge available")
	}

	// Update progress
	job.ProgressPercent = 20
	progressMsg = "Analyzing target audience..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job progress", "progress", 20, "error", err)
	}

	// Get target audience
	var targetAudience service.TargetAudienceInput
	if len(genInput.TargetAudienceIDs) > 0 {
		audience, err := s.audienceRepo.GetByID(ctx, genInput.TargetAudienceIDs[0])
		if err == nil && audience != nil {
			targetAudience = service.TargetAudienceInput{
				Role:            audience.Role,
				ExperienceLevel: string(audience.ExperienceLevel),
				LearningGoals:   audience.LearningGoals,
				Prerequisites:   audience.Prerequisites,
				Challenges:      audience.Challenges,
				Motivations:     audience.Motivations,
			}
			if audience.IndustryContext != nil {
				targetAudience.IndustryContext = *audience.IndustryContext
			}
			if audience.TypicalBackground != nil {
				targetAudience.TypicalBackground = *audience.TypicalBackground
			}
		}
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
		SMEKnowledge:      smeKnowledge,
		TargetAudience:    targetAudience,
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

	// Create outline entity
	outline := &entity.CourseOutline{
		ID:             uuid.New(),
		TenantID:       job.TenantID,
		CourseID:       *job.CourseID,
		Version:        1,
		ApprovalStatus: valueobject.OutlineApprovalStatusPendingReview,
		GeneratedAt:    time.Now(),
	}

	if err := s.outlineRepo.Create(ctx, outline); err != nil {
		log.Error("failed to create outline", "error", err)
		return s.failJob(ctx, job, "failed to store outline")
	}

	// Create sections and lessons
	for _, sectionResult := range outlineResult.Sections {
		section := &entity.OutlineSection{
			ID:          uuid.New(),
			TenantID:    job.TenantID,
			OutlineID:   outline.ID,
			Title:       sectionResult.Title,
			Description: sectionResult.Description,
			Position:    int32(sectionResult.Order),
			CreatedAt:   time.Now(),
		}

		if err := s.sectionRepo.Create(ctx, section); err != nil {
			log.Error("failed to create section", "error", err)
			continue
		}

		for _, lessonResult := range sectionResult.Lessons {
			duration := int32(lessonResult.EstimatedDurationMinutes)
			lesson := &entity.OutlineLesson{
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

			if err := s.lessonRepo.Create(ctx, lesson); err != nil {
				log.Error("failed to create lesson", "error", err)
			}
		}
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
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to mark job as completed", "error", err)
	}

	// Notify user of completion (tenant-isolated via user lookup)
	if s.notifier != nil {
		if err := s.notifier.NotifyJobProgress(ctx, job.CreatedByUserID, job.ID, "Course Outline", "completed", 100); err != nil {
			log.Error("failed to send completion notification", "error", err)
		}
	}

	log.Info("outline generation completed", "tokensUsed", outlineResult.TokensUsed)
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

	log.Info("lesson content generation job created", "jobID", job.ID)
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

	// Get generation input for SME knowledge and audience
	genInput, err := s.genInputRepo.GetByCourseID(ctx, *job.CourseID)
	if err != nil || genInput == nil {
		return s.failJob(ctx, job, "generation input not found")
	}

	// Gather SME knowledge (similar to outline generation)
	smeKnowledge := make([]service.SMEKnowledgeInput, 0)
	for _, smeID := range genInput.SMEIDs {
		sme, err := s.smeRepo.GetByID(ctx, smeID)
		if err != nil || sme == nil {
			continue
		}

		chunks, _ := s.smeKnowledgeRepo.ListBySMEID(ctx, smeID)
		chunkTexts := make([]string, len(chunks))
		for i, chunk := range chunks {
			chunkTexts[i] = chunk.Content
		}

		summary := ""
		if sme.KnowledgeSummary != nil {
			summary = *sme.KnowledgeSummary
		}

		smeKnowledge = append(smeKnowledge, service.SMEKnowledgeInput{
			SMEName: sme.Name,
			Domain:  sme.Domain,
			Summary: summary,
			Chunks:  chunkTexts,
		})
	}

	// Get target audience
	var targetAudience service.TargetAudienceInput
	if len(genInput.TargetAudienceIDs) > 0 {
		audience, _ := s.audienceRepo.GetByID(ctx, genInput.TargetAudienceIDs[0])
		if audience != nil {
			targetAudience = service.TargetAudienceInput{
				Role:            audience.Role,
				ExperienceLevel: string(audience.ExperienceLevel),
				LearningGoals:   audience.LearningGoals,
				Prerequisites:   audience.Prerequisites,
				Challenges:      audience.Challenges,
				Motivations:     audience.Motivations,
			}
		}
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
		SMEKnowledge:       smeKnowledge,
		TargetAudience:     targetAudience,
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

	// Create components
	for _, compResult := range lessonResult.Components {
		compType, _ := valueobject.ParseLessonComponentType(compResult.Type)
		component := &entity.LessonComponent{
			ID:          uuid.New(),
			TenantID:    job.TenantID,
			LessonID:    genLesson.ID,
			Type:        compType,
			Position:    int32(compResult.Order),
			ContentJSON: json.RawMessage(compResult.ContentJSON),
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}

		if err := s.componentRepo.Create(ctx, component); err != nil {
			log.Error("failed to create component", "error", err)
		}
	}

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
func (s *AIGenerationService) checkAndCompleteParentJob(ctx context.Context, parentJobID uuid.UUID) error {
	log := s.logger.With("parentJobID", parentJobID)

	// Use atomic method to check completion and get stats with proper locking
	// This prevents race conditions when multiple children complete simultaneously
	result, err := s.jobRepo.TryFinalizeParentJob(ctx, parentJobID)
	if err != nil {
		return fmt.Errorf("failed to check parent job status: %w", err)
	}

	if result == nil {
		return nil // Parent job not found
	}

	// If another worker already finalized, nothing to do
	if !result.WasFinalized && result.AllComplete {
		log.Info("parent job already finalized by another worker")
		return nil
	}

	// Calculate progress percentage (10% reserved for initial queuing, 90% for lesson generation)
	doneCount := result.CompletedCount + result.FailedCount
	progressPercent := int32(10)
	if result.TotalCount > 0 {
		progressPercent = int32(10 + (90 * doneCount / result.TotalCount))
	}

	// Get parent job for update
	parentJob, err := s.jobRepo.GetByID(ctx, parentJobID)
	if err != nil || parentJob == nil {
		return fmt.Errorf("failed to get parent job: %w", err)
	}

	progressMsg := fmt.Sprintf("Generated %d of %d lessons...", result.CompletedCount, result.TotalCount)

	// Update parent progress
	parentJob.ProgressPercent = progressPercent
	parentJob.ProgressMessage = &progressMsg
	parentJob.TokensUsed = result.TotalTokens

	// If not all complete, just update progress
	if !result.AllComplete {
		if err := s.jobRepo.Update(ctx, parentJob); err != nil {
			log.Error("failed to update parent job progress", "progress", progressPercent, "error", err)
		} else {
			log.Info("parent job progress updated", "progress", progressPercent, "completed", result.CompletedCount, "total", result.TotalCount)
		}
		return nil
	}

	// We won the race - finalize the parent job
	log.Info("all children complete, finalizing parent job", "completed", result.CompletedCount, "failed", result.FailedCount)

	now := time.Now()
	parentJob.CompletedAt = &now

	// Get course title for notification
	courseTitle := "Course"
	if parentJob.CourseID != nil {
		courseTitle = "Your Course"
	}

	if result.FailedCount > 0 {
		parentJob.Status = valueobject.GenerationJobStatusFailed
		errMsg := fmt.Sprintf("%d lesson(s) failed to generate", result.FailedCount)
		parentJob.ErrorMessage = &errMsg
		finalMsg := "Course generation failed"
		parentJob.ProgressMessage = &finalMsg
		parentJob.ProgressPercent = 100

		if err := s.jobRepo.Update(ctx, parentJob); err != nil {
			log.Error("failed to mark parent job as failed", "error", err)
		}

		// Send failure notification
		if s.completionNotifier != nil && parentJob.CourseID != nil {
			if err := s.completionNotifier.NotifyCourseFailed(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle, errMsg); err != nil {
				log.Error("failed to send course failure notification", "error", err)
			}
		}

		log.Info("parent job marked as failed", "failedCount", result.FailedCount)
	} else {
		parentJob.Status = valueobject.GenerationJobStatusCompleted
		finalMsg := "All lessons generated successfully"
		parentJob.ProgressMessage = &finalMsg
		parentJob.ProgressPercent = 100

		if err := s.jobRepo.Update(ctx, parentJob); err != nil {
			log.Error("failed to mark parent job as completed", "error", err)
		}

		// Send completion notification with email
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

	// Queue individual lesson generation jobs with parent_job_id
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

			if err := s.jobRepo.Create(ctx, job); err != nil {
				log.Error("failed to create lesson job", "outlineLessonID", outlineLessonID, "error", err)
				// Continue with other lessons
			}
		}
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
func (s *AIGenerationService) GetGeneratedLesson(ctx context.Context, kratosID uuid.UUID, lessonID uuid.UUID) (*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	lesson, err := s.genLessonRepo.GetByID(ctx, lessonID)
	if err != nil || lesson == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("generated lesson not found")
	}

	// Load components
	components, err := s.componentRepo.ListByLessonID(ctx, lesson.ID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	lesson.Components = make([]entity.LessonComponent, len(components))
	for i, c := range components {
		lesson.Components[i] = *c
	}

	return lesson, nil
}

// ListGeneratedLessons retrieves all generated lessons for a course.
func (s *AIGenerationService) ListGeneratedLessons(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) ([]*entity.GeneratedLesson, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	lessons, err := s.genLessonRepo.ListByCourseID(ctx, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Load components for each lesson
	for _, lesson := range lessons {
		components, err := s.componentRepo.ListByLessonID(ctx, lesson.ID)
		if err != nil {
			continue // Skip if components fail to load
		}
		lesson.Components = make([]entity.LessonComponent, len(components))
		for i, c := range components {
			lesson.Components[i] = *c
		}
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
