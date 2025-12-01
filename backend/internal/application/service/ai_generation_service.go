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
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// AIGenerationService handles AI-powered content generation.
type AIGenerationService struct {
	userRepo          repository.UserRepository
	smeRepo           repository.SMERepository
	smeKnowledgeRepo  repository.SMEKnowledgeRepository
	audienceRepo      repository.TargetAudienceRepository
	jobRepo           repository.GenerationJobRepository
	outlineRepo       repository.CourseOutlineRepository
	sectionRepo       repository.OutlineSectionRepository
	lessonRepo        repository.OutlineLessonRepository
	genLessonRepo     repository.GeneratedLessonRepository
	componentRepo     repository.LessonComponentRepository
	genInputRepo      repository.CourseGenerationInputRepository
	aiSettingsRepo    repository.TenantAISettingsRepository
	aiProvider        service.AIProvider
	logger            service.Logger
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
	aiProvider service.AIProvider,
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:         userRepo,
		smeRepo:          smeRepo,
		smeKnowledgeRepo: smeKnowledgeRepo,
		audienceRepo:     audienceRepo,
		jobRepo:          jobRepo,
		outlineRepo:      outlineRepo,
		sectionRepo:      sectionRepo,
		lessonRepo:       lessonRepo,
		genLessonRepo:    genLessonRepo,
		componentRepo:    componentRepo,
		genInputRepo:     genInputRepo,
		aiSettingsRepo:   aiSettingsRepo,
		aiProvider:       aiProvider,
		logger:           logger,
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
func (s *AIGenerationService) ProcessOutlineGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "courseID", job.CourseID)

	// Mark job as processing
	now := time.Now()
	job.Status = valueobject.GenerationJobStatusProcessing
	job.StartedAt = &now
	progressMsg := "Gathering SME knowledge..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
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
	_ = s.jobRepo.Update(ctx, job)

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
	_ = s.jobRepo.Update(ctx, job)

	// Generate outline with AI
	additionalContext := ""
	if genInput.AdditionalContext != nil {
		additionalContext = *genInput.AdditionalContext
	}

	outlineResult, err := s.aiProvider.GenerateCourseOutline(ctx, service.GenerateOutlineRequest{
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
	_ = s.jobRepo.Update(ctx, job)

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

	log.Info("outline approved")
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
		LessonID:        &req.OutlineLessonID,
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
func (s *AIGenerationService) ProcessLessonGenerationJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "lessonID", job.LessonID)

	// Mark job as processing
	now := time.Now()
	job.Status = valueobject.GenerationJobStatusProcessing
	job.StartedAt = &now
	progressMsg := "Loading lesson context..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
	}

	// Get outline lesson
	outlineLesson, err := s.lessonRepo.GetByID(ctx, *job.LessonID)
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
	_ = s.jobRepo.Update(ctx, job)

	// Generate lesson content
	lessonResult, err := s.aiProvider.GenerateLessonContent(ctx, service.GenerateLessonRequest{
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
	_ = s.jobRepo.Update(ctx, job)

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

	log.Info("lesson generation completed", "tokensUsed", lessonResult.TokensUsed)
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

	job.Status = valueobject.GenerationJobStatusCancelled
	now := time.Now()
	job.CompletedAt = &now
	msg := "Cancelled by user"
	job.ProgressMessage = &msg

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

	return fmt.Errorf(errMsg)
}
