package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

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
	ID                 string                 `json:"id"`
	Version            int                    `json:"version"`
	Status             CourseStatus           `json:"status"`
	Metadata           CourseMetadata         `json:"metadata"`
	Settings           CourseSettings         `json:"settings"`
	Personas           []map[string]any       `json:"personas"`
	LearningObjectives []map[string]any       `json:"learningObjectives"`
	AssessmentSettings map[string]any         `json:"assessmentSettings"`
	Content            CourseContent          `json:"content"`
	Exports            []map[string]any       `json:"exports,omitempty"`
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

// CourseSettings contains course configuration.
type CourseSettings struct {
	Title             string   `json:"title"`
	DesiredOutcome    string   `json:"desiredOutcome"`
	DestinationFolder string   `json:"destinationFolder"`
	CategoryTags      []string `json:"categoryTags"`
	DataSource        string   `json:"dataSource"`
}

// CourseContent contains the course structure.
type CourseContent struct {
	Sections     []map[string]any `json:"sections"`
	CourseBlocks []map[string]any `json:"courseBlocks"`
}

// S3CourseContent is stored in S3 - the heavy content payload.
type S3CourseContent struct {
	Settings           CourseSettings   `json:"settings"`
	Personas           []map[string]any `json:"personas"`
	LearningObjectives []map[string]any `json:"learningObjectives"`
	AssessmentSettings map[string]any   `json:"assessmentSettings"`
	Content            CourseContent    `json:"content"`
	Exports            []map[string]any `json:"exports,omitempty"`
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
}

// ListCourses returns courses matching the filter.
func (s *CourseService) ListCourses(ctx context.Context, kratosID uuid.UUID, filter ListCoursesFilter) ([]LibraryEntry, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	opts := entity.CourseListOptions{
		Limit: 100, // Default limit
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

	courses, err := s.courseRepo.List(ctx, opts)
	if err != nil {
		s.logger.Error("failed to list courses", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
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

	return entries, nil
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

	// Check if content exists in MinIO/S3 before attempting to read
	exists, err := s.storage.CourseContentExists(ctx, course.TenantID, course.ID)
	if err != nil {
		s.logger.Error("failed to check course content existence",
			"courseID", id,
			"tenantID", course.TenantID,
			"error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if !exists {
		s.logger.Error("course content not found in storage",
			"courseID", id,
			"tenantID", course.TenantID,
			"contentPath", course.ContentPath)
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	// Get content from S3
	var s3Content S3CourseContent
	if err := s.storage.ReadCourseContent(ctx, course.TenantID, course.ID, &s3Content); err != nil {
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

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
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
	if err := s.storage.WriteCourseContent(ctx, *user.TenantID, courseID, &s3Content); err != nil {
		log.Error("failed to write course content to storage", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	log.Info("course content written to storage",
		"courseID", courseID,
		"tenantID", user.TenantID,
		"path", s.storage.CoursePath(*user.TenantID, courseID))

	// Insert metadata into PostgreSQL
	if err := s.courseRepo.Create(ctx, course); err != nil {
		// Attempt to clean up S3 content
		_ = s.storage.DeleteCourseContent(ctx, *user.TenantID, courseID)
		log.Error("failed to create course in database", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Invalidate cache
	_ = s.cache.InvalidatePattern(ctx, "courses:*")

	log.Info("course created", "courseID", course.ID)

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

	// Check if content exists in MinIO/S3 before attempting to read
	exists, err := s.storage.CourseContentExists(ctx, course.TenantID, course.ID)
	if err != nil {
		log.Error("failed to check course content existence", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	if !exists {
		log.Error("course content not found - cannot update",
			"tenantID", course.TenantID,
			"contentPath", course.ContentPath)
		return nil, domainerrors.ErrNotFound.WithMessage("course content not found")
	}

	// Load existing S3 content
	var s3Content S3CourseContent
	if err := s.storage.ReadCourseContent(ctx, course.TenantID, course.ID, &s3Content); err != nil {
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

	// Invalidate cache
	_ = s.cache.Delete(ctx, cache.CacheKeys.Course(id))
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

	// Invalidate cache
	_ = s.cache.Delete(ctx, cache.CacheKeys.Course(id))
	_ = s.cache.InvalidatePattern(ctx, "courses:*")
	_ = s.cache.InvalidatePattern(ctx, "folder:*")

	log.Info("course deleted")
	return nil
}

// GetFolderHierarchy returns the folder structure.
func (s *CourseService) GetFolderHierarchy(ctx context.Context, kratosID uuid.UUID, includeCounts bool) ([]Folder, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrInternal.WithMessage("user has no tenant")
	}

	// Ensure default folders exist (Shared and user's Private folder)
	if err := s.ensureDefaultFolders(ctx, user); err != nil {
		s.logger.Error("failed to ensure default folders", "error", err)
		// Continue even if folder creation fails
	}

	// Pass user ID to filter PERSONAL folders - users only see their own private folder
	folders, err := s.folderRepo.GetHierarchy(ctx, user.ID)
	if err != nil {
		s.logger.Error("failed to get folder hierarchy", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Build parent-child map
	childrenMap := make(map[string][]string)
	for _, f := range folders {
		if f.ParentID != nil {
			parentStr := f.ParentID.String()
			childrenMap[parentStr] = append(childrenMap[parentStr], f.ID.String())
		}
	}

	result := make([]Folder, 0, len(folders))
	for _, f := range folders {
		var parentStr string
		if f.ParentID != nil {
			parentStr = f.ParentID.String()
		}

		result = append(result, Folder{
			ID:       f.ID.String(),
			Name:     f.Name,
			Parent:   parentStr,
			Type:     f.Type.String(),
			Children: childrenMap[f.ID.String()],
		})
	}

	return result, nil
}

// ensureDefaultFolders creates default folders (Shared and user's Private) if they don't exist.
func (s *CourseService) ensureDefaultFolders(ctx context.Context, user *entity.User) error {
	if user.TenantID == nil {
		return nil
	}

	// Check for Shared folder
	sharedFolder, err := s.folderRepo.GetSharedFolder(ctx, *user.TenantID)
	if err != nil {
		return err
	}

	if sharedFolder == nil {
		// Create Shared folder
		sharedFolder = &entity.Folder{
			TenantID: *user.TenantID,
			Name:     "Shared",
			Type:     entity.FolderTypeLibrary,
		}
		if err := s.folderRepo.Create(ctx, sharedFolder); err != nil {
			s.logger.Error("failed to create shared folder", "error", err)
		} else {
			s.logger.Info("created shared folder", "folderID", sharedFolder.ID)
		}
	}

	// Check for user's Private folder
	privateFolder, err := s.folderRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		return err
	}

	if privateFolder == nil {
		// Create Private folder for this user
		privateFolder = &entity.Folder{
			TenantID: *user.TenantID,
			Name:     "Private",
			Type:     entity.FolderTypePersonal,
			UserID:   &user.ID,
		}
		if err := s.folderRepo.Create(ctx, privateFolder); err != nil {
			s.logger.Error("failed to create private folder", "error", err, "userID", user.ID)
		} else {
			s.logger.Info("created private folder", "folderID", privateFolder.ID, "userID", user.ID)
		}
	}

	return nil
}

// GetLibrary returns the full library.
func (s *CourseService) GetLibrary(ctx context.Context, kratosID uuid.UUID, includeCounts bool) (*Library, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Get courses
	courses, err := s.courseRepo.List(ctx, entity.CourseListOptions{Limit: 1000})
	if err != nil {
		s.logger.Error("failed to list courses", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Get folders - pass user ID to filter PERSONAL folders
	folders, err := s.folderRepo.GetHierarchy(ctx, user.ID)
	if err != nil {
		s.logger.Error("failed to get folder hierarchy", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Convert courses to library entries
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

	// Build parent-child map for folders
	childrenMap := make(map[string][]string)
	for _, f := range folders {
		if f.ParentID != nil {
			parentStr := f.ParentID.String()
			childrenMap[parentStr] = append(childrenMap[parentStr], f.ID.String())
		}
	}

	// Convert folders
	folderList := make([]Folder, 0, len(folders))
	for _, f := range folders {
		var parentStr string
		if f.ParentID != nil {
			parentStr = f.ParentID.String()
		}

		folderList = append(folderList, Folder{
			ID:       f.ID.String(),
			Name:     f.Name,
			Parent:   parentStr,
			Type:     f.Type.String(),
			Children: childrenMap[f.ID.String()],
		})
	}

	return &Library{
		Version:     "1.0",
		LastUpdated: time.Now(),
		Courses:     entries,
		Folders:     folderList,
	}, nil
}

// CreateFolder creates a new folder.
func (s *CourseService) CreateFolder(ctx context.Context, kratosID uuid.UUID, name string, parentID *string, folderType string) (*entity.Folder, error) {
	log := s.logger.With("kratosID", kratosID, "folderName", name)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrInternal.WithMessage("user has no tenant")
	}

	folder := &entity.Folder{
		TenantID: *user.TenantID,
		Name:     name,
		Type:     entity.ParseFolderType(folderType),
	}

	if parentID != nil && *parentID != "" {
		pID, err := uuid.Parse(*parentID)
		if err == nil {
			folder.ParentID = &pID
		}
	}

	if err := s.folderRepo.Create(ctx, folder); err != nil {
		log.Error("failed to create folder", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("folder created", "folderID", folder.ID)
	return folder, nil
}

// DeleteFolder deletes a folder.
func (s *CourseService) DeleteFolder(ctx context.Context, kratosID uuid.UUID, id string) error {
	log := s.logger.With("kratosID", kratosID, "folderID", id)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	folderID, err := uuid.Parse(id)
	if err != nil {
		return domainerrors.ErrInvalidInput.WithMessage("invalid folder ID")
	}

	// Check if folder has courses
	count, err := s.courseRepo.CountByFolder(ctx, folderID)
	if err != nil {
		log.Error("failed to count courses in folder", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
	if count > 0 {
		return domainerrors.ErrBadRequest.WithMessage(fmt.Sprintf("folder contains %d courses, move or delete them first", count))
	}

	// Check if folder has child folders
	children, err := s.folderRepo.ListByParent(ctx, &folderID)
	if err != nil {
		log.Error("failed to list child folders", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
	if len(children) > 0 {
		return domainerrors.ErrBadRequest.WithMessage("folder contains subfolders, delete them first")
	}

	if err := s.folderRepo.Delete(ctx, folderID); err != nil {
		log.Error("failed to delete folder", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("folder deleted")
	return nil
}
