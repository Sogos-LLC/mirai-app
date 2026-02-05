package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	contentpkg "github.com/sogos/mirai-backend/internal/application/service/content"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

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
// If knowledge sources are selected and no approved plan exists, it creates
// a course_planning job instead to analyze documents before outline generation.
func (s *AIGenerationService) GenerateCourseOutline(ctx context.Context, kratosID uuid.UUID, req GenerateCourseOutlineRequest) (*GenerateCourseOutlineResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Check if this course has knowledge sources and needs planning first
	jobType := valueobject.GenerationJobTypeCourseOutline
	if s.planHandler != nil {
		content, err := s.readCourseContent(ctx, *user.TenantID, req.CourseID)
		if err == nil && content.WizardData != nil {
			hasKnowledgeSources := len(content.WizardData.SelectedTeamDocIDs) > 0 || len(content.WizardData.SelectedGlobalDocIDs) > 0
			hasApprovedPlan := content.CoursePlan != nil && content.CoursePlan.Status == "approved"
			if hasKnowledgeSources && !hasApprovedPlan {
				jobType = valueobject.GenerationJobTypeCoursePlanning
				log.Info("knowledge sources detected, creating planning job instead of outline")
			}
		}
	}

	// Create the job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            jobType,
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
	log.Info("generation job created", "jobID", job.ID, "type", jobType)

	// Enqueue for immediate processing
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue job, will be picked up by poll", "error", err)
		}
	}

	return &GenerateCourseOutlineResult{Job: job}, nil
}

// GenerateCoursePlanRequest contains the inputs for plan generation.
type GenerateCoursePlanRequest struct {
	CourseID uuid.UUID
}

// GenerateCoursePlanResult contains the created job.
type GenerateCoursePlanResult struct {
	Job *entity.GenerationJob
}

// GenerateCoursePlan starts a course planning job.
func (s *AIGenerationService) GenerateCoursePlan(ctx context.Context, kratosID uuid.UUID, req GenerateCoursePlanRequest) (*GenerateCoursePlanResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeCoursePlanning,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create planning job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	s.publishJobEvent(ctx, "created", job)
	log.Info("course planning job created", "jobID", job.ID)

	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueAIGeneration(job.ID.String(), string(job.Type)); err != nil {
			log.Warn("failed to enqueue planning job, will be picked up by poll", "error", err)
		}
	}

	return &GenerateCoursePlanResult{Job: job}, nil
}

// ProcessCoursePlanningJob processes a course planning job by delegating to the PlanHandler.
func (s *AIGenerationService) ProcessCoursePlanningJob(ctx context.Context, job *entity.GenerationJob) error {
	if s.planHandler == nil {
		return s.failJob(ctx, job, "plan handler not configured")
	}
	return s.planHandler.Process(ctx, job)
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

	// Precondition: Check curriculum map is approved if required by tenant settings
	// This ensures coverage validation is complete before generating lessons
	requireApproval := true // Default to requiring approval
	if s.knowledgeSettingsProvider != nil {
		knowledgeSettings, err := s.knowledgeSettingsProvider.GetKnowledgeSettingsByTenantID(ctx, *user.TenantID)
		if err != nil {
			log.Warn("failed to get knowledge settings, using default (require approval)", "error", err)
		} else {
			requireApproval = knowledgeSettings.RequireCurriculumApproval
		}
	}

	if requireApproval && content.CurriculumMap != nil && content.CurriculumMap.Status != "approved" {
		log.Warn("lesson generation blocked: curriculum map not approved",
			"curriculumMapStatus", content.CurriculumMap.Status,
		)
		return nil, domainerrors.ErrInvalidInput.WithMessage("curriculum map must be approved before generating lessons")
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
	case valueobject.GenerationJobTypeCoursePlanning:
		return s.ProcessCoursePlanningJob(tenantCtx, job)
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

// ProcessNextQueuedJob processes the next queued generation job.
func (s *AIGenerationService) ProcessNextQueuedJob(ctx context.Context) error {
	return s.processNextJob(ctx)
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
	case valueobject.GenerationJobTypeCoursePlanning:
		return s.ProcessCoursePlanningJob(tenantCtx, job)
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

	// Track KnowledgeScope for constraint validation after generation
	var knowledgeScope *valueobject.KnowledgeScope

	// Check if knowledge sources were selected in the wizard
	// CRITICAL: We now ALWAYS use selected knowledge for grounding, not just in InternalDataOnly mode
	// InternalDataOnly mode means: use ONLY knowledge (no AI synthesis beyond sources)
	// Normal mode means: use knowledge for grounding, but AI can expand on it
	var selectedDocIDs []string
	hasSelectedKnowledge := false
	if content.WizardData != nil {
		selectedDocIDs = append(selectedDocIDs, content.WizardData.SelectedTeamDocIDs...)
		selectedDocIDs = append(selectedDocIDs, content.WizardData.SelectedGlobalDocIDs...)
		hasSelectedKnowledge = len(selectedDocIDs) > 0
		outlineRequest.InternalDataOnly = content.WizardData.InternalDataOnly
	}

	log.Info("[AI.RAG] Knowledge context check",
		"hasSelectedKnowledge", hasSelectedKnowledge,
		"selectedDocCount", len(selectedDocIDs),
		"internalDataOnly", outlineRequest.InternalDataOnly,
	)

	// Fetch RAG context when knowledge sources are selected
	// This enables knowledge-grounded generation in ALL modes
	if hasSelectedKnowledge && s.knowledgeSearcher != nil {
		log.Info("[AI.RAG] Fetching RAG context from selected knowledge sources")

		// Fetch knowledge sources for the course to get document indices
		sources, err := s.knowledgeSearcher.ListByCourse(ctx, *job.CourseID)
		if err != nil {
			log.Warn("failed to list knowledge sources", "error", err)
		} else {
			// Build a set of selected source IDs for filtering
			selectedSet := make(map[string]bool)
			for _, id := range selectedDocIDs {
				selectedSet[id] = true
			}

			// Build document indices from sources (only from selected sources)
			for _, src := range sources {
				if !selectedSet[src.ID.String()] {
					continue // Skip sources not selected in wizard
				}
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

			// Build KnowledgeScope and calculate constraints
			var scopeErr error
			knowledgeScope, scopeErr = BuildKnowledgeScope(sources, selectedDocIDs, job.CreatedByUserID)
			if scopeErr != nil {
				log.Warn("failed to build knowledge scope", "error", scopeErr)
			} else if knowledgeScope != nil {
				// Calculate constraints from scope
				constraints, constraintErr := valueobject.CalculateCourseConstraints(
					knowledgeScope,
					outlineRequest.InternalDataOnly,
					valueobject.DefaultConstraintsConfig(),
				)
				if constraintErr != nil {
					log.Warn("failed to calculate constraints", "error", constraintErr)
				} else {
					outlineRequest.Constraints = &service.CourseConstraintsInput{
						MinSections:          constraints.MinSections,
						MaxSections:          constraints.MaxSections,
						MinLessonsPerSection: constraints.MinLessonsPerSection,
						MaxLessonsPerSection: constraints.MaxLessonsPerSection,
						MinTotalLessons:      constraints.MinTotalLessons,
						MaxTotalLessons:      constraints.MaxTotalLessons,
						RecommendedDepth:     constraints.RecommendedDepth,
					}
					log.Info("[AI.Constraints] Course constraints calculated from knowledge scope",
						"minSections", constraints.MinSections,
						"maxSections", constraints.MaxSections,
						"minLessons", constraints.MinTotalLessons,
						"maxLessons", constraints.MaxTotalLessons,
						"estimatedFromDocs", constraints.CalculatedFromDocs,
						"estimatedLessons", constraints.EstimatedLessons,
					)
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
				chunks, err := s.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 15)
				if err != nil {
					log.Warn("RAG search failed", "query", query, "error", err)
					continue
				}
				for _, chunk := range chunks {
					// Only include chunks from selected sources
					if !selectedSet[chunk.SourceID.String()] {
						continue
					}
					// Deduplicate chunks
					if seenChunks[chunk.ID] {
						continue
					}
					seenChunks[chunk.ID] = true
					outlineRequest.RAGContext = append(outlineRequest.RAGContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      int(*chunk.ChunkIndex),
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "course",
					})
				}
			}
			log.Info("[AI.RAG] Course knowledge context retrieved",
				"documentIndices", len(outlineRequest.DocumentIndices),
				"chunks", len(outlineRequest.RAGContext),
			)
		}
	}

	// Also search team-level knowledge if available and sources were selected
	if hasSelectedKnowledge && s.teamKnowledgeSearcher != nil && s.teamResolver != nil {
		team, err := s.teamResolver.GetTeamByTenant(ctx, job.TenantID)
		if err != nil {
			log.Warn("failed to resolve team for tenant", "error", err)
		} else if team != nil {
			log.Info("[AI.RAG] Searching team knowledge", "teamID", team.ID)

			// Build a set of selected source IDs for filtering
			selectedSet := make(map[string]bool)
			for _, id := range selectedDocIDs {
				selectedSet[id] = true
			}

			// Search team knowledge with the same queries
			teamQueries := []string{
				content.Settings.Title,
				content.Settings.DesiredOutcome,
			}
			if additionalContext != "" {
				teamQueries = append(teamQueries, additionalContext)
			}

			seenTeamChunks := make(map[string]bool)
			// Copy existing chunk IDs to avoid duplicates across course and team
			for _, chunk := range outlineRequest.RAGContext {
				seenTeamChunks[chunk.SourceID+"-"+fmt.Sprintf("%d", chunk.ChunkIndex)] = true
			}

			for _, query := range teamQueries {
				chunks, err := s.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, query, 15)
				if err != nil {
					log.Warn("Team RAG search failed", "query", query, "error", err)
					continue
				}
				for _, chunk := range chunks {
					// Only include chunks from selected sources
					if !selectedSet[chunk.SourceID.String()] {
						continue
					}
					chunkKey := chunk.SourceID.String() + "-" + fmt.Sprintf("%d", *chunk.ChunkIndex)
					if seenTeamChunks[chunkKey] {
						continue
					}
					seenTeamChunks[chunkKey] = true
					outlineRequest.RAGContext = append(outlineRequest.RAGContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      int(*chunk.ChunkIndex),
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "team",
					})
				}
			}
			log.Info("[AI.RAG] Added team knowledge context", "totalChunks", len(outlineRequest.RAGContext))
		}
	}

	// Log final RAG context summary
	if len(outlineRequest.RAGContext) > 0 {
		log.Info("[AI.RAG] Final outline generation context",
			"totalChunks", len(outlineRequest.RAGContext),
			"documentIndices", len(outlineRequest.DocumentIndices),
			"internalDataOnly", outlineRequest.InternalDataOnly,
		)
	} else if hasSelectedKnowledge {
		log.Warn("[AI.RAG] Knowledge sources selected but no RAG context retrieved - check vector DB and embeddings")
	}

	// Generate outline with AI, with retry on constraint violations
	const maxConstraintRetries = 2
	var outlineResult *service.GenerateOutlineResult
	var lastViolations []valueobject.ConstraintViolation

	for attempt := 0; attempt <= maxConstraintRetries; attempt++ {
		if attempt > 0 {
			log.Info("[AI.Constraints] Retrying outline generation after constraint violations",
				"attempt", attempt+1,
				"maxAttempts", maxConstraintRetries+1,
			)
			// Strengthen the prompt with violation feedback
			outlineRequest.AdditionalContext = buildConstraintRetryContext(
				outlineRequest.AdditionalContext,
				lastViolations,
				outlineRequest.Constraints,
			)
		}

		var genErr error
		outlineResult, genErr = aiProvider.GenerateCourseOutline(ctx, outlineRequest)
		if genErr != nil {
			log.Error("AI outline generation failed", "error", genErr, "attempt", attempt+1)
			return s.failJob(ctx, job, fmt.Sprintf("AI generation failed: %v", genErr))
		}

		// Validate against constraints if provided
		if outlineRequest.Constraints == nil || knowledgeScope == nil {
			break // No constraints to validate
		}

		constraints, _ := valueobject.CalculateCourseConstraints(
			knowledgeScope,
			outlineRequest.InternalDataOnly,
			valueobject.DefaultConstraintsConfig(),
		)
		if constraints == nil {
			break
		}

		// Count sections and lessons
		sectionCount := len(outlineResult.Sections)
		totalLessons := 0
		lessonCountsPerSection := make([]int, sectionCount)
		for i, section := range outlineResult.Sections {
			lessonCountsPerSection[i] = len(section.Lessons)
			totalLessons += len(section.Lessons)
		}

		// Validate
		lastViolations = constraints.Validate(sectionCount, totalLessons, lessonCountsPerSection)
		if len(lastViolations) == 0 {
			log.Info("[AI.Constraints] Generated outline passes all constraints",
				"sectionCount", sectionCount,
				"totalLessons", totalLessons,
				"attempt", attempt+1,
			)
			break // Success!
		}

		// Log violations
		log.Warn("[AI.Constraints] Generated outline violates constraints",
			"violations", len(lastViolations),
			"sectionCount", sectionCount,
			"totalLessons", totalLessons,
			"attempt", attempt+1,
		)
		for _, v := range lastViolations {
			log.Warn("[AI.Constraints] Violation", "field", v.Field, "expected", v.Expected, "actual", v.Actual)
		}

		// If this was the last attempt, proceed with the violated result
		if attempt == maxConstraintRetries {
			log.Warn("[AI.Constraints] Max retries reached, proceeding with constraint violations")
		}
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing outline..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = outlineResult.TokensUsed
	_ = s.jobRepo.Update(ctx, job)

	// Calculate section grounding scores based on RAG context
	// If RAG chunks were provided, distribute a baseline grounding score across sections
	// This now works for ALL modes when knowledge is selected, not just InternalDataOnly
	var sectionGroundingScores []float32
	if len(outlineRequest.RAGContext) > 0 {
		// Calculate grounding score based on RAG coverage
		// More chunks = higher grounding, but cap at reasonable max
		chunksPerSection := float32(len(outlineRequest.RAGContext)) / float32(len(outlineResult.Sections))
		for range outlineResult.Sections {
			// Base score calculation:
			// - With InternalDataOnly: higher base (0.5) since content is strictly from sources
			// - Without InternalDataOnly: lower base (0.3) since AI can synthesize beyond sources
			var baseScore float32
			if outlineRequest.InternalDataOnly {
				baseScore = 0.5
			} else {
				baseScore = 0.3
			}
			score := baseScore + (chunksPerSection / 20.0)
			if score > 0.95 {
				score = 0.95
			}
			sectionGroundingScores = append(sectionGroundingScores, score)
		}
		log.Info("[AI.RAG] Calculated section grounding scores",
			"avgScore", func() float32 {
				var sum float32
				for _, s := range sectionGroundingScores {
					sum += s
				}
				return sum / float32(len(sectionGroundingScores))
			}(),
			"sectionCount", len(sectionGroundingScores),
		)
	} else {
		// No RAG context = 0 grounding (fully synthesized)
		for range outlineResult.Sections {
			sectionGroundingScores = append(sectionGroundingScores, 0.0)
		}
	}

	// Build section provenance with detailed chunk attribution
	type sectionProvenance struct {
		ChunkIDs     []string          `json:"chunkIds"`
		SourceChunks []ProvenanceChunk `json:"sourceChunks"`
		TeamTokens   int32             `json:"teamTokens"`
		GlobalTokens int32             `json:"globalTokens"`
		CourseTokens int32             `json:"courseTokens"`
	}
	var sectionProvenances []sectionProvenance

	if len(outlineRequest.RAGContext) > 0 {
		chunksPerSection := len(outlineRequest.RAGContext) / len(outlineResult.Sections)
		if chunksPerSection < 1 {
			chunksPerSection = 1
		}
		for i := range outlineResult.Sections {
			start := i * chunksPerSection
			end := start + chunksPerSection
			if end > len(outlineRequest.RAGContext) {
				end = len(outlineRequest.RAGContext)
			}
			if i == len(outlineResult.Sections)-1 {
				end = len(outlineRequest.RAGContext)
			}

			prov := sectionProvenance{}
			for j := start; j < end && j < len(outlineRequest.RAGContext); j++ {
				chunk := outlineRequest.RAGContext[j]
				prov.ChunkIDs = append(prov.ChunkIDs, chunk.ChunkID)

				// Build detailed source chunk
				excerpt := chunk.Content
				if len(excerpt) > 200 {
					excerpt = excerpt[:200] + "..."
				}
				prov.SourceChunks = append(prov.SourceChunks, ProvenanceChunk{
					ChunkID:         chunk.ChunkID,
					SourceID:        chunk.SourceID,
					SourceName:      chunk.SourceName,
					Excerpt:         excerpt,
					SimilarityScore: chunk.SimilarityScore,
					Scope:           chunk.Scope,
				})

				// Estimate tokens (rough: 4 chars per token)
				tokenCount := int32(len(chunk.Content) / 4)
				switch chunk.Scope {
				case "team":
					prov.TeamTokens += tokenCount
				case "global":
					prov.GlobalTokens += tokenCount
				case "course":
					prov.CourseTokens += tokenCount
				}
			}
			sectionProvenances = append(sectionProvenances, prov)
		}
	} else {
		for range outlineResult.Sections {
			sectionProvenances = append(sectionProvenances, sectionProvenance{})
		}
	}

	// Convert AI result to content sections format
	sections := make([]map[string]any, 0, len(outlineResult.Sections))
	totalLessons := 0
	for sIdx, sectionResult := range outlineResult.Sections {
		sectionGrounding := sectionGroundingScores[sIdx]

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
				"groundingScore":           sectionGrounding, // Inherit section's grounding score
			}
			lessons = append(lessons, lesson)
			totalLessons++
		}

		// Build provenance for this section
		prov := sectionProvenances[sIdx]
		section := map[string]any{
			"id":                   uuid.New().String(),
			"title":                sectionResult.Title,
			"description":          sectionResult.Description,
			"order":                sIdx + 1,
			"lessons":              lessons,
			"level":                sectionResult.Level,
			"intent":               sectionResult.Intent,
			"emphasis":             sectionResult.Emphasis,
			"mappedOutcomeIndices": sectionResult.MappedOutcomeIndices,
			"groundingScore":       sectionGrounding,
			"contributingChunkIds": prov.ChunkIDs,
			"provenance": map[string]any{
				"sourceChunks": prov.SourceChunks,
				"teamTokens":   prov.TeamTokens,
				"globalTokens": prov.GlobalTokens,
				"courseTokens": prov.CourseTokens,
			},
		}
		sections = append(sections, section)
	}

	// Calculate outline-level aggregate provenance
	outlineProvenance := &OutlineProvenance{
		GeneratedAt:        time.Now().UTC(),
		ConstraintsApplied: outlineRequest.Constraints != nil,
		ConstraintsMet:     len(lastViolations) == 0,
	}
	uniqueSources := make(map[string]bool)
	for _, prov := range sectionProvenances {
		outlineProvenance.TotalChunks += len(prov.ChunkIDs)
		outlineProvenance.TeamTokens += prov.TeamTokens
		outlineProvenance.GlobalTokens += prov.GlobalTokens
		outlineProvenance.CourseTokens += prov.CourseTokens
		for _, sc := range prov.SourceChunks {
			uniqueSources[sc.SourceID] = true
		}
	}
	outlineProvenance.TotalSources = len(uniqueSources)

	// Calculate aggregate grounding score
	if len(sectionGroundingScores) > 0 {
		var sum float32
		for _, s := range sectionGroundingScores {
			sum += s
		}
		outlineProvenance.GroundingScore = sum / float32(len(sectionGroundingScores))
	}

	log.Info("[AI.Provenance] Outline provenance calculated",
		"totalSources", outlineProvenance.TotalSources,
		"totalChunks", outlineProvenance.TotalChunks,
		"groundingScore", outlineProvenance.GroundingScore,
		"constraintsApplied", outlineProvenance.ConstraintsApplied,
		"constraintsMet", outlineProvenance.ConstraintsMet,
	)

	// Update content with generated outline and provenance
	content.Content.Sections = sections
	content.OutlineProvenance = outlineProvenance

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
	var searchQueries []string
	if content.WizardData != nil && content.WizardData.InternalDataOnly {
		internalDataOnly = true
		log.Info("Internal Data Only mode enabled, fetching RAG context for lesson",
			"lessonTitle", lessonTitle)

		// Fetch RAG context for the lesson using learning objectives as queries
		if s.knowledgeSearcher != nil && job.CourseID != nil {
			// Build search query from lesson title and learning objectives
			searchQueries = []string{lessonTitle + " " + lessonDesc}
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
			log.Info("Fetched RAG context for lesson",
				"lessonTitle", lessonTitle,
				"chunkCount", len(ragContext))
		}

		// Also search team-level knowledge for lesson content
		if s.teamKnowledgeSearcher != nil && s.teamResolver != nil {
			team, err := s.teamResolver.GetTeamByTenant(ctx, job.TenantID)
			if err != nil {
				log.Warn("failed to resolve team for tenant", "error", err)
			} else if team != nil {
				log.Info("[AI.RAG] Searching team knowledge for lesson", "teamID", team.ID, "lessonTitle", lessonTitle)

				// Build search queries for team knowledge
				teamSearchQueries := []string{lessonTitle + " " + lessonDesc}
				for _, obj := range learningObjectives {
					teamSearchQueries = append(teamSearchQueries, obj)
				}

				// Track already seen content (using simple hash)
				teamSeenChunks := make(map[string]bool)
				for _, chunk := range ragContext {
					hashKey := chunk.Content
					if len(hashKey) > 100 {
						hashKey = hashKey[:100]
					}
					teamSeenChunks[hashKey] = true
				}

				for _, query := range teamSearchQueries {
					chunks, err := s.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, query, 5)
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

	// Build provenance from RAG context
	provenance := contentpkg.BuildComponentProvenance(ragContext, searchQueries)

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
			Provenance:           provenance,
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
	s3Lesson.AggregateProvenance = contentpkg.AggregateProvenance(s3Components)
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

// buildConstraintRetryContext appends violation feedback to the additional context
// to help the AI correct its output on retry.
func buildConstraintRetryContext(
	existingContext string,
	violations []valueobject.ConstraintViolation,
	constraints *service.CourseConstraintsInput,
) string {
	var sb strings.Builder

	if existingContext != "" {
		sb.WriteString(existingContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("**IMPORTANT CORRECTION REQUIRED**\n")
	sb.WriteString("Your previous response violated the mandatory constraints. Please correct:\n\n")

	for _, v := range violations {
		sb.WriteString(fmt.Sprintf("- %s: You provided %s, but must be %s\n", v.Field, v.Actual, v.Expected))
	}

	sb.WriteString("\n**Reminder of constraints:**\n")
	if constraints != nil {
		sb.WriteString(fmt.Sprintf("- Sections: %d to %d\n", constraints.MinSections, constraints.MaxSections))
		sb.WriteString(fmt.Sprintf("- Lessons per section: %d to %d\n", constraints.MinLessonsPerSection, constraints.MaxLessonsPerSection))
		sb.WriteString(fmt.Sprintf("- Total lessons: %d to %d\n", constraints.MinTotalLessons, constraints.MaxTotalLessons))
	}

	sb.WriteString("\nPlease regenerate the outline within these bounds.")
	return sb.String()
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
