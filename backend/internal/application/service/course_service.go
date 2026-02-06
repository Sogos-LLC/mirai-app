package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/service/content"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// Type aliases pointing to the canonical definitions in the content package.
type S3CourseContent = content.S3CourseContent
type S3WizardData = content.WizardData
type S3SMEPersona = content.SMEPersona
type S3AudiencePersona = content.AudiencePersona
type S3ToneOption = content.ToneOption
type S3GeneratedLesson = content.GeneratedLesson
type S3LessonComponent = content.LessonComponent
type S3CurriculumMap = content.CurriculumMap
type S3CurriculumRow = content.CurriculumRow
type S3CurriculumCell = content.CurriculumCell
type S3CurriculumValidationIssue = content.CurriculumValidationIssue
type S3CoursePlan = content.CoursePlan
type S3DocumentAnalysis = content.DocumentAnalysis
type S3SectionHint = content.SectionHint
type S3PlannedSection = content.PlannedSection
type S3PlannedLesson = content.PlannedLesson
type ProvenanceChunk = content.ProvenanceChunk
type ComponentProvenance = content.ComponentProvenance
type LessonProvenance = content.LessonProvenance
type OutlineProvenance = content.OutlineProvenance
type CourseContent = content.CourseContent
type CourseSettings = content.CourseSettings

// CourseService handles course and library operations.
// Uses a hybrid model: metadata in PostgreSQL, content in S3.
type CourseService struct {
	courseRepo repository.CourseRepository
	folderRepo repository.FolderRepository
	userRepo   repository.UserRepository
	storage    *storage.TenantAwareStorage
	cache      cache.Cache
	logger     service.Logger
}

// NewCourseService creates a new course service.
func NewCourseService(
	courseRepo repository.CourseRepository,
	folderRepo repository.FolderRepository,
	userRepo repository.UserRepository,
	storage *storage.TenantAwareStorage,
	cache cache.Cache,
	logger service.Logger,
) *CourseService {
	return &CourseService{
		courseRepo: courseRepo,
		folderRepo: folderRepo,
		userRepo:   userRepo,
		storage:    storage,
		cache:      cache,
		logger:     logger,
	}
}

// CourseStatus represents the publication state.
type CourseStatus string

const (
	CourseStatusDraft     CourseStatus = "draft"
	CourseStatusPublished CourseStatus = "published"
	CourseStatusGenerated CourseStatus = "generated"
)

// StoredCourse represents the full course data returned to clients.
// Combines metadata from PostgreSQL and content from S3.
type StoredCourse struct {
	ID                 string           `json:"id"`
	Version            int              `json:"version"`
	Status             CourseStatus     `json:"status"`
	Metadata           CourseMetadata   `json:"metadata"`
	Settings           CourseSettings   `json:"settings"`
	WizardData         *S3WizardData    `json:"wizardData,omitempty"`
	Personas           []map[string]any `json:"personas"`
	LearningObjectives []map[string]any `json:"learningObjectives"`
	AssessmentSettings map[string]any   `json:"assessmentSettings"`
	Content            CourseContent    `json:"content"`
	Exports            []map[string]any `json:"exports,omitempty"`
}

// CourseMetadata contains metadata about the course.
type CourseMetadata struct {
	ID         string    `json:"id"`
	Version    int       `json:"version"`
	Status     string    `json:"status"`
	CreatedAt  time.Time `json:"createdAt"`
	ModifiedAt time.Time `json:"modifiedAt"`
	CreatedBy  string    `json:"createdBy,omitempty"`
}

// LibraryEntry represents a course listing (metadata only).
type LibraryEntry struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	Status        CourseStatus `json:"status"`
	Folder        string       `json:"folder"`
	Tags          []string     `json:"tags"`
	CreatedAt     time.Time    `json:"createdAt"`
	ModifiedAt    time.Time    `json:"modifiedAt"`
	CreatedBy     string       `json:"createdBy,omitempty"`
	ThumbnailPath string       `json:"thumbnailPath,omitempty"`
}

// Library represents the library response.
type Library struct {
	Version     string         `json:"version"`
	LastUpdated time.Time      `json:"lastUpdated"`
	Courses     []LibraryEntry `json:"courses"`
	Folders     []Folder       `json:"folders"`
}

// Folder represents a folder in the hierarchy.
type Folder struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Parent   string   `json:"parent,omitempty"`
	Type     string   `json:"type,omitempty"`
	Children []string `json:"children,omitempty"`
}

// ListCoursesFilter contains filter options for listing courses.
type ListCoursesFilter struct {
	Status *CourseStatus
	Folder *string
	Tags   []string
	Limit  int
	Offset int
}

// ListCoursesResult contains the result of listing courses with pagination info.
type ListCoursesResult struct {
	Courses    []LibraryEntry
	TotalCount int
	HasMore    bool
}

// listCoursesCacheKey builds a deterministic cache key for ListCourses.
// All keys start with "courses:" so InvalidatePattern("courses:*") clears them.
func listCoursesCacheKey(filter ListCoursesFilter, limit, offset int) string {
	var parts []string
	parts = append(parts, "courses:list")
	if filter.Status != nil {
		parts = append(parts, "s="+string(*filter.Status))
	}
	if filter.Folder != nil && *filter.Folder != "" {
		parts = append(parts, "f="+*filter.Folder)
	}
	if len(filter.Tags) > 0 {
		parts = append(parts, "t="+strings.Join(filter.Tags, ","))
	}
	parts = append(parts, fmt.Sprintf("l=%d:o=%d", limit, offset))
	return strings.Join(parts, ":")
}

// ListCourses returns courses matching the filter with pagination support.
func (s *CourseService) ListCourses(ctx context.Context, kratosID uuid.UUID, filter ListCoursesFilter) (ListCoursesResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return ListCoursesResult{}, domainerrors.ErrUserNotFound
	}

	// Apply pagination defaults and limits
	limit := filter.Limit
	if limit <= 0 {
		limit = 20 // Default page size
	}
	if limit > 100 {
		limit = 100 // Max page size
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	// Try cache first
	cacheKey := listCoursesCacheKey(filter, limit, offset)
	var cached ListCoursesResult
	if entry, err := s.cache.Get(ctx, cacheKey, &cached); err == nil && entry != nil {
		return cached, nil
	}

	opts := entity.CourseListOptions{
		Limit:  limit,
		Offset: offset,
	}

	if filter.Status != nil {
		status := entity.ParseCourseStatus(string(*filter.Status))
		opts.Status = &status
	}

	if filter.Folder != nil && *filter.Folder != "" {
		folderID, err := uuid.Parse(*filter.Folder)
		if err == nil {
			opts.FolderID = &folderID
		}
	}

	if len(filter.Tags) > 0 {
		opts.Tags = filter.Tags
	}

	// Get total count for pagination
	totalCount, err := s.courseRepo.Count(ctx, opts)
	if err != nil {
		s.logger.Error("failed to count courses", "error", err)
		return ListCoursesResult{}, domainerrors.ErrInternal.WithCause(err)
	}

	courses, err := s.courseRepo.List(ctx, opts)
	if err != nil {
		s.logger.Error("failed to list courses", "error", err)
		return ListCoursesResult{}, domainerrors.ErrInternal.WithCause(err)
	}

	entries := make([]LibraryEntry, 0, len(courses))
	for _, c := range courses {
		var folderStr string
		if c.FolderID != nil {
			folderStr = c.FolderID.String()
		}
		var thumbPath string
		if c.ThumbnailPath != nil {
			thumbPath = *c.ThumbnailPath
		}

		entries = append(entries, LibraryEntry{
			ID:            c.ID.String(),
			Title:         c.Title,
			Status:        CourseStatus(c.Status.String()),
			Folder:        folderStr,
			Tags:          c.CategoryTags,
			CreatedAt:     c.CreatedAt,
			ModifiedAt:    c.UpdatedAt,
			CreatedBy:     c.CreatedByUserID.String(),
			ThumbnailPath: thumbPath,
		})
	}

	result := ListCoursesResult{
		Courses:    entries,
		TotalCount: totalCount,
		HasMore:    offset+len(entries) < totalCount,
	}

	// Cache the result — mutations invalidate "courses:*" so this stays fresh
	_, _ = s.cache.Set(ctx, cacheKey, result, "", 0)

	return result, nil
}

// GetCourse retrieves a course by ID.
func (s *CourseService) GetCourse(ctx context.Context, kratosID uuid.UUID, id string) (*StoredCourse, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	courseID, err := uuid.Parse(id)
	if err != nil {
		return nil, domainerrors.ErrInvalidInput.WithMessage("invalid course ID")
	}

	// Get metadata from PostgreSQL
	course, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil {
		s.logger.Error("failed to get course", "courseID", id, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if course == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course not found")
	}

	// Get content from S3 (single request instead of checking existence first)
	var s3Content S3CourseContent
	if err := s.storage.ReadCourseContent(ctx, course.TenantID, course.ID, &s3Content); err != nil {
		// Check if content doesn't exist
		if errors.Is(err, storage.ErrObjectNotFound) {
			s.logger.Error("course content not found in storage",
				"courseID", id,
				"tenantID", course.TenantID,
				"contentPath", course.ContentPath)
			return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
		}
		s.logger.Error("failed to read course content from S3", "courseID", id, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Combine metadata and content
	var folderStr string
	if course.FolderID != nil {
		folderStr = course.FolderID.String()
	}

	return &StoredCourse{
		ID:      course.ID.String(),
		Version: int(course.Version),
		Status:  CourseStatus(course.Status.String()),
		Metadata: CourseMetadata{
			ID:         course.ID.String(),
			Version:    int(course.Version),
			Status:     course.Status.String(),
			CreatedAt:  course.CreatedAt,
			ModifiedAt: course.UpdatedAt,
			CreatedBy:  course.CreatedByUserID.String(),
		},
		Settings: CourseSettings{
			Title:             course.Title,
			DesiredOutcome:    s3Content.Settings.DesiredOutcome,
			DestinationFolder: folderStr,
			CategoryTags:      course.CategoryTags,
			DataSource:        s3Content.Settings.DataSource,
		},
		WizardData:         s3Content.WizardData,
		Personas:           s3Content.Personas,
		LearningObjectives: s3Content.LearningObjectives,
		AssessmentSettings: s3Content.AssessmentSettings,
		Content:            s3Content.Content,
		Exports:            s3Content.Exports,
	}, nil
}

// CreateCourse creates a new course.
func (s *CourseService) CreateCourse(ctx context.Context, kratosID uuid.UUID, input *StoredCourse) (*StoredCourse, error) {
	log := s.logger.With("kratosID", kratosID)
	startTotal := time.Now()

	startStep := time.Now()
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	log.Info("[PERF] GetByKratosID", "elapsed", time.Since(startStep))
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrInternal.WithMessage("user has no tenant")
	}
	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	now := time.Now()
	courseID := uuid.New()

	// DEBUG: Track courseID through the system
	log.Info("[DEBUG-COURSEID] CreateCourse generated new courseID",
		"courseID", courseID.String(),
		"title", input.Settings.Title,
		"tenantID", user.TenantID.String())

	// Parse folder ID if provided
	var folderID *uuid.UUID
	if input.Settings.DestinationFolder != "" {
		fID, err := uuid.Parse(input.Settings.DestinationFolder)
		if err == nil {
			folderID = &fID
		}
	}

	// Create course entity for PostgreSQL
	course := &entity.Course{
		ID:              courseID,
		TenantID:        *user.TenantID,
		CompanyID:       *user.CompanyID,
		CreatedByUserID: user.ID,
		Title:           input.Settings.Title,
		Status:          entity.CourseStatusDraft,
		Version:         1,
		FolderID:        folderID,
		CategoryTags:    input.Settings.CategoryTags,
		ContentPath:     s.storage.CoursePath(*user.TenantID, courseID),
	}

	if course.Title == "" {
		course.Title = "Untitled Course"
	}
	if course.CategoryTags == nil {
		course.CategoryTags = []string{}
	}

	// Create S3 content
	s3Content := S3CourseContent{
		Settings: CourseSettings{
			Title:             course.Title,
			DesiredOutcome:    input.Settings.DesiredOutcome,
			DestinationFolder: input.Settings.DestinationFolder,
			CategoryTags:      course.CategoryTags,
			DataSource:        input.Settings.DataSource,
		},
		WizardData:         input.WizardData,
		Personas:           input.Personas,
		LearningObjectives: input.LearningObjectives,
		AssessmentSettings: input.AssessmentSettings,
		Content:            input.Content,
		Exports:            []map[string]any{},
	}

	// Initialize defaults
	if s3Content.Personas == nil {
		s3Content.Personas = []map[string]any{}
	}
	if s3Content.LearningObjectives == nil {
		s3Content.LearningObjectives = []map[string]any{}
	}
	if s3Content.AssessmentSettings == nil {
		s3Content.AssessmentSettings = map[string]any{
			"enableEmbeddedKnowledgeChecks": false,
			"enableFinalExam":               false,
		}
	}
	if s3Content.Content.Sections == nil {
		s3Content.Content.Sections = []map[string]any{}
	}
	if s3Content.Content.CourseBlocks == nil {
		s3Content.Content.CourseBlocks = []map[string]any{}
	}
	if s3Content.Settings.DataSource == "" {
		s3Content.Settings.DataSource = "open-web"
	}

	// Write content to S3 first
	startStep = time.Now()
	if err := s.storage.WriteCourseContent(ctx, *user.TenantID, courseID, &s3Content); err != nil {
		log.Error("failed to write course content to storage", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	log.Info("[PERF] WriteCourseContent", "elapsed", time.Since(startStep),
		"courseID", courseID,
		"tenantID", user.TenantID,
		"path", s.storage.CoursePath(*user.TenantID, courseID))

	// Insert metadata into PostgreSQL
	startStep = time.Now()
	if err := s.courseRepo.Create(ctx, course); err != nil {
		// Attempt to clean up S3 content
		_ = s.storage.DeleteCourseContent(ctx, *user.TenantID, courseID)
		log.Error("failed to create course in database", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	log.Info("[PERF] courseRepo.Create", "elapsed", time.Since(startStep))

	// Invalidate cache
	startStep = time.Now()
	_ = s.cache.InvalidatePattern(ctx, "courses:*")
	log.Info("[PERF] cache.InvalidatePattern", "elapsed", time.Since(startStep))

	log.Info("[PERF] CreateCourse total", "elapsed", time.Since(startTotal), "courseID", course.ID)

	return &StoredCourse{
		ID:      course.ID.String(),
		Version: int(course.Version),
		Status:  CourseStatusDraft,
		Metadata: CourseMetadata{
			ID:         course.ID.String(),
			Version:    int(course.Version),
			Status:     string(CourseStatusDraft),
			CreatedAt:  now,
			ModifiedAt: now,
			CreatedBy:  user.ID.String(),
		},
		Settings:           s3Content.Settings,
		WizardData:         s3Content.WizardData,
		Personas:           s3Content.Personas,
		LearningObjectives: s3Content.LearningObjectives,
		AssessmentSettings: s3Content.AssessmentSettings,
		Content:            s3Content.Content,
		Exports:            s3Content.Exports,
	}, nil
}

// UpdateCourse updates an existing course.
func (s *CourseService) UpdateCourse(ctx context.Context, kratosID uuid.UUID, id string, updates *StoredCourse) (*StoredCourse, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", id)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	courseID, err := uuid.Parse(id)
	if err != nil {
		return nil, domainerrors.ErrInvalidInput.WithMessage("invalid course ID")
	}

	// Get existing course
	course, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil {
		log.Error("failed to get course", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if course == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course not found")
	}

	// Load existing S3 content (single request instead of checking existence first)
	var s3Content S3CourseContent
	if err := s.storage.ReadCourseContent(ctx, course.TenantID, course.ID, &s3Content); err != nil {
		if errors.Is(err, storage.ErrObjectNotFound) {
			log.Error("course content not found - cannot update",
				"tenantID", course.TenantID,
				"contentPath", course.ContentPath)
			return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
		}
		log.Error("failed to read course content from S3", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Apply updates to metadata
	if updates.Settings.Title != "" {
		course.Title = updates.Settings.Title
		s3Content.Settings.Title = updates.Settings.Title
	}
	if updates.Settings.DesiredOutcome != "" {
		s3Content.Settings.DesiredOutcome = updates.Settings.DesiredOutcome
	}
	if updates.Settings.DestinationFolder != "" {
		folderID, err := uuid.Parse(updates.Settings.DestinationFolder)
		if err == nil {
			course.FolderID = &folderID
		}
		s3Content.Settings.DestinationFolder = updates.Settings.DestinationFolder
	}
	if len(updates.Settings.CategoryTags) > 0 {
		course.CategoryTags = updates.Settings.CategoryTags
		s3Content.Settings.CategoryTags = updates.Settings.CategoryTags
	}
	if updates.Settings.DataSource != "" {
		s3Content.Settings.DataSource = updates.Settings.DataSource
	}
	if len(updates.Personas) > 0 {
		s3Content.Personas = updates.Personas
	}
	if len(updates.LearningObjectives) > 0 {
		s3Content.LearningObjectives = updates.LearningObjectives
	}
	if updates.AssessmentSettings != nil {
		s3Content.AssessmentSettings = updates.AssessmentSettings
	}
	if updates.Content.Sections != nil || updates.Content.CourseBlocks != nil {
		s3Content.Content = updates.Content
	}
	if updates.Status != "" {
		course.Status = entity.ParseCourseStatus(string(updates.Status))
	}

	course.Version++

	// Update S3 content
	if err := s.storage.WriteCourseContent(ctx, course.TenantID, course.ID, &s3Content); err != nil {
		log.Error("failed to update course content in S3", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update PostgreSQL metadata
	if err := s.courseRepo.Update(ctx, course); err != nil {
		log.Error("failed to update course in database", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Invalidate cache (TenantCache automatically prefixes keys with tenant:{id}:)
	_ = s.cache.Delete(ctx, cache.TenantCacheKeys.Course(id))
	_ = s.cache.InvalidatePattern(ctx, "courses:*")

	log.Info("course updated")

	var folderStr string
	if course.FolderID != nil {
		folderStr = course.FolderID.String()
	}

	return &StoredCourse{
		ID:      course.ID.String(),
		Version: int(course.Version),
		Status:  CourseStatus(course.Status.String()),
		Metadata: CourseMetadata{
			ID:         course.ID.String(),
			Version:    int(course.Version),
			Status:     course.Status.String(),
			CreatedAt:  course.CreatedAt,
			ModifiedAt: course.UpdatedAt,
			CreatedBy:  course.CreatedByUserID.String(),
		},
		Settings: CourseSettings{
			Title:             course.Title,
			DesiredOutcome:    s3Content.Settings.DesiredOutcome,
			DestinationFolder: folderStr,
			CategoryTags:      course.CategoryTags,
			DataSource:        s3Content.Settings.DataSource,
		},
		WizardData:         s3Content.WizardData,
		Personas:           s3Content.Personas,
		LearningObjectives: s3Content.LearningObjectives,
		AssessmentSettings: s3Content.AssessmentSettings,
		Content:            s3Content.Content,
		Exports:            s3Content.Exports,
	}, nil
}

// DeleteCourse deletes a course.
func (s *CourseService) DeleteCourse(ctx context.Context, kratosID uuid.UUID, id string) error {
	log := s.logger.With("kratosID", kratosID, "courseID", id)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	courseID, err := uuid.Parse(id)
	if err != nil {
		return domainerrors.ErrInvalidInput.WithMessage("invalid course ID")
	}

	// Get course to get tenant ID for S3 path
	course, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil {
		log.Error("failed to get course", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
	if course == nil {
		return domainerrors.ErrNotFound.WithMessage("course not found")
	}

	// Delete from PostgreSQL
	if err := s.courseRepo.Delete(ctx, courseID); err != nil {
		log.Error("failed to delete course from database", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// Delete from S3
	if err := s.storage.DeleteCourseContent(ctx, course.TenantID, course.ID); err != nil {
		log.Error("failed to delete course content from S3", "error", err)
		// Don't fail the operation - the DB record is already deleted
	}

	// Invalidate cache (TenantCache automatically prefixes keys with tenant:{id}:)
	_ = s.cache.Delete(ctx, cache.TenantCacheKeys.Course(id))
	_ = s.cache.InvalidatePattern(ctx, "courses:*")
	_ = s.cache.InvalidatePattern(ctx, "folder:*")

	log.Info("course deleted")
	return nil
}
