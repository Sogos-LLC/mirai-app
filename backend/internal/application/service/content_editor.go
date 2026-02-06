package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// GetCoursePlanResult contains the course plan from S3.
type GetCoursePlanResult struct {
	Plan *S3CoursePlan
}

// GetCoursePlan retrieves the course plan from S3.
func (s *AIGenerationService) GetCoursePlan(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*GetCoursePlanResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}
	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	content, err := s.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return &GetCoursePlanResult{Plan: content.CoursePlan}, nil
}

// ApproveCoursePlanResult contains the approved course plan.
type ApproveCoursePlanResult struct {
	Plan *S3CoursePlan
}

// ApproveCoursePlan marks the course plan as approved.
func (s *AIGenerationService) ApproveCoursePlan(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*ApproveCoursePlanResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", courseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}
	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	content, err := s.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if content.CoursePlan == nil {
		return nil, domainerrors.ErrNotFound
	}

	now := time.Now()
	content.CoursePlan.Status = "approved"
	content.CoursePlan.ApprovedAt = &now

	if err := s.writeCourseContent(ctx, *user.TenantID, courseID, content); err != nil {
		log.Error("failed to write approved plan", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("course plan approved", "sections", len(content.CoursePlan.PlannedSections))
	return &ApproveCoursePlanResult{Plan: content.CoursePlan}, nil
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

// GetCourseOutlineWithWizardDataResult contains both the outline and wizard data from a single S3 read.
type GetCourseOutlineWithWizardDataResult struct {
	Outline    *entity.CourseOutline
	WizardData *S3WizardData
}

// GetCourseOutlineWithWizardData retrieves both the outline and wizard data
// from a single S3 read, avoiding duplicate reads that GetCourseOutline + GetWizardData would cause.
func (s *AIGenerationService) GetCourseOutlineWithWizardData(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*GetCourseOutlineWithWizardDataResult, error) {
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

	outline, err := buildOutlineFromContent(content, *user.TenantID, courseID)
	if err != nil {
		return nil, err
	}

	return &GetCourseOutlineWithWizardDataResult{
		Outline:    outline,
		WizardData: content.WizardData,
	}, nil
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

	return buildOutlineFromContent(content, *user.TenantID, courseID)
}

// buildOutlineFromContent converts S3 course content sections into an entity.CourseOutline.
func buildOutlineFromContent(content *S3CourseContent, tenantID uuid.UUID, courseID uuid.UUID) (*entity.CourseOutline, error) {
	if len(content.Content.Sections) == 0 {
		return nil, domainerrors.ErrNotFound.WithMessage("outline not found")
	}

	outline := &entity.CourseOutline{
		ID:             uuid.New(),
		TenantID:       tenantID,
		CourseID:       courseID,
		Version:        1,
		ApprovalStatus: valueobject.OutlineApprovalStatusApproved,
		GeneratedAt:    time.Now(),
		Sections:       make([]entity.OutlineSection, 0, len(content.Content.Sections)),
	}

	for sIdx, section := range content.Content.Sections {
		sectionID, _ := section["id"].(string)
		sectionTitle, _ := section["title"].(string)
		sectionDesc, _ := section["description"].(string)

		sec := entity.OutlineSection{
			ID:          uuid.MustParse(sectionID),
			TenantID:    tenantID,
			OutlineID:   outline.ID,
			Title:       sectionTitle,
			Description: sectionDesc,
			Position:    int32(sIdx + 1),
			Lessons:     []entity.OutlineLesson{},
		}

		if level, ok := section["level"].(string); ok {
			sec.Level = level
		}
		if intent, ok := section["intent"].(string); ok {
			sec.Intent = intent
		}
		if emphasis, ok := section["emphasis"].(string); ok {
			sec.Emphasis = emphasis
		}
		if gs, ok := section["groundingScore"].(float64); ok {
			sec.GroundingScore = float32(gs)
		}
		if chunks, ok := section["contributingChunkIds"].([]interface{}); ok {
			for _, c := range chunks {
				if str, ok := c.(string); ok {
					sec.ContributingChunkIDs = append(sec.ContributingChunkIDs, str)
				}
			}
		}
		if outcomes, ok := section["mappedOutcomeIds"].([]interface{}); ok {
			for _, o := range outcomes {
				if str, ok := o.(string); ok {
					sec.MappedOutcomeIDs = append(sec.MappedOutcomeIDs, str)
				}
			}
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
				TenantID:    tenantID,
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

// UpdateCourseOutlineSection represents a section in the update request.
type UpdateCourseOutlineSection struct {
	ID          uuid.UUID
	Title       string
	Description string
	Order       int32
	Lessons     []UpdateCourseOutlineLesson
	// Section metadata for curriculum alignment
	MappedOutcomeIDs []string
	Level            string
	Intent           string
	Emphasis         string
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

// UpdateCourseOutline updates an existing outline in MinIO.
func (s *AIGenerationService) UpdateCourseOutline(ctx context.Context, kratosID uuid.UUID, courseID, outlineID uuid.UUID, sections []UpdateCourseOutlineSection) (*entity.CourseOutline, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", courseID)

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

	// Build a map of existing sections by ID for fast lookup
	existingSections := make(map[string]map[string]any)
	for _, sec := range content.Content.Sections {
		if id, ok := sec["id"].(string); ok {
			existingSections[id] = sec
		}
	}

	// Apply updates to the sections
	updatedSections := make([]map[string]any, 0, len(sections))
	for _, update := range sections {
		sectionID := update.ID.String()
		existing, found := existingSections[sectionID]
		if !found {
			continue
		}

		// Update basic fields
		existing["title"] = update.Title
		existing["description"] = update.Description

		// Update metadata fields
		if update.Level != "" {
			existing["level"] = update.Level
		}
		if update.Intent != "" {
			existing["intent"] = update.Intent
		}
		if update.Emphasis != "" {
			existing["emphasis"] = update.Emphasis
		}
		if len(update.MappedOutcomeIDs) > 0 {
			existing["mappedOutcomeIds"] = update.MappedOutcomeIDs
		}

		// Update lessons
		if existingLessons, ok := existing["lessons"].([]interface{}); ok && len(update.Lessons) > 0 {
			lessonMap := make(map[string]interface{})
			for _, l := range existingLessons {
				if lm, ok := l.(map[string]interface{}); ok {
					if lid, ok := lm["id"].(string); ok {
						lessonMap[lid] = lm
					}
				}
			}

			updatedLessons := make([]interface{}, 0)
			for _, ul := range update.Lessons {
				lid := ul.ID.String()
				if existingLesson, ok := lessonMap[lid]; ok {
					if lm, ok := existingLesson.(map[string]interface{}); ok {
						lm["title"] = ul.Title
						lm["description"] = ul.Description
						if ul.LearningObjectives != nil {
							lm["learningObjectives"] = ul.LearningObjectives
						}
						updatedLessons = append(updatedLessons, lm)
					}
				}
			}
			existing["lessons"] = updatedLessons
		}

		updatedSections = append(updatedSections, existing)
	}

	content.Content.Sections = updatedSections

	if err := s.writeCourseContent(ctx, *user.TenantID, courseID, content); err != nil {
		log.Error("failed to write updated outline", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("outline updated in S3", "sections", len(updatedSections))

	// Return the updated outline
	return s.GetCourseOutline(ctx, kratosID, courseID)
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
			entComp := entity.LessonComponent{
				ID:          compID,
				TenantID:    tenantID,
				LessonID:    lessonID,
				Type:        valueobject.LessonComponentType(comp.Type),
				Position:    comp.Order,
				ContentJSON: comp.ContentJSON,
			}
			if comp.Provenance != nil {
				entComp.Provenance = s3ComponentProvenanceToEntity(comp.Provenance)
			}
			lesson.Components[i] = entComp
		}

		// Map aggregate provenance
		if s3Lesson.AggregateProvenance != nil {
			lesson.AggregateProvenance = s3LessonProvenanceToEntity(s3Lesson.AggregateProvenance)
			lesson.GroundingScore = s3Lesson.AggregateProvenance.GroundingScore
			lesson.SourceCount = s3Lesson.AggregateProvenance.SourceCount
			lesson.GroundedTokens = s3Lesson.AggregateProvenance.CourseTokens + s3Lesson.AggregateProvenance.TeamTokens + s3Lesson.AggregateProvenance.GlobalTokens
			lesson.TotalTokens = s3Lesson.AggregateProvenance.TotalTokens
		}

		lessons = append(lessons, lesson)
	}

	return lessons, nil
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

// readCourseContent reads course content from MinIO.
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

// writeCourseContent writes course content to MinIO.
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

// s3ComponentProvenanceToEntity converts S3 ComponentProvenance to entity type.
func s3ComponentProvenanceToEntity(prov *ComponentProvenance) *entity.ComponentProvenance {
	if prov == nil {
		return nil
	}
	entProv := &entity.ComponentProvenance{
		Queries:      prov.Queries,
		TeamTokens:   prov.TeamTokens,
		GlobalTokens: prov.GlobalTokens,
		CourseTokens: prov.CourseTokens,
		TotalTokens:  prov.TotalTokens,
		GeneratedAt:  prov.GeneratedAt,
	}
	for _, chunk := range prov.SourceChunks {
		entProv.SourceChunks = append(entProv.SourceChunks, entity.ProvenanceChunk{
			ChunkID:         chunk.ChunkID,
			SourceID:        chunk.SourceID,
			SourceName:      chunk.SourceName,
			Excerpt:         chunk.Excerpt,
			SimilarityScore: chunk.SimilarityScore,
			Scope:           chunk.Scope,
		})
	}
	return entProv
}

// s3LessonProvenanceToEntity converts S3 LessonProvenance to entity type.
func s3LessonProvenanceToEntity(prov *LessonProvenance) *entity.LessonProvenance {
	if prov == nil {
		return nil
	}
	return &entity.LessonProvenance{
		GroundingScore:   prov.GroundingScore,
		TeamTokens:       prov.TeamTokens,
		GlobalTokens:     prov.GlobalTokens,
		CourseTokens:     prov.CourseTokens,
		UngroundedTokens: prov.UngroundedTokens,
		TotalTokens:      prov.TotalTokens,
		SourceCount:      prov.SourceCount,
	}
}
