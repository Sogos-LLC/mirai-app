package service

import (
	"context"
	"fmt"
	"path"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// CourseService handles course and library operations.
type CourseService struct {
	storage storage.StorageAdapter
	cache   cache.Cache
}

// NewCourseService creates a new course service.
func NewCourseService(storage storage.StorageAdapter, cache cache.Cache) *CourseService {
	return &CourseService{
		storage: storage,
		cache:   cache,
	}
}

// Storage paths
const (
	coursesDir  = "courses"
	libraryFile = "library.json"
)

// CourseStatus represents the publication state.
type CourseStatus string

const (
	CourseStatusDraft     CourseStatus = "draft"
	CourseStatusPublished CourseStatus = "published"
	CourseStatusGenerated CourseStatus = "generated"
)

// StoredCourse represents the full course data.
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

// LibraryEntry represents a course listing.
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

// Library represents the library index.
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
func (s *CourseService) ListCourses(ctx context.Context, filter ListCoursesFilter) ([]LibraryEntry, error) {
	library, err := s.loadLibrary(ctx)
	if err != nil {
		return nil, err
	}

	courses := library.Courses

	// Apply filters
	if filter.Status != nil {
		var filtered []LibraryEntry
		for _, c := range courses {
			if c.Status == *filter.Status {
				filtered = append(filtered, c)
			}
		}
		courses = filtered
	}

	if filter.Folder != nil && *filter.Folder != "" {
		var filtered []LibraryEntry
		for _, c := range courses {
			if c.Folder == *filter.Folder {
				filtered = append(filtered, c)
			}
		}
		courses = filtered
	}

	if len(filter.Tags) > 0 {
		var filtered []LibraryEntry
		for _, c := range courses {
			for _, tag := range filter.Tags {
				if contains(c.Tags, tag) {
					filtered = append(filtered, c)
					break
				}
			}
		}
		courses = filtered
	}

	// Sort by modified date (newest first)
	sort.Slice(courses, func(i, j int) bool {
		return courses[i].ModifiedAt.After(courses[j].ModifiedAt)
	})

	return courses, nil
}

// GetCourse retrieves a course by ID.
func (s *CourseService) GetCourse(ctx context.Context, id string) (*StoredCourse, error) {
	coursePath := path.Join(coursesDir, id+".json")

	var course StoredCourse
	if err := s.storage.ReadJSON(ctx, coursePath, &course); err != nil {
		return nil, fmt.Errorf("course not found: %s", id)
	}

	return &course, nil
}

// CreateCourse creates a new course.
func (s *CourseService) CreateCourse(ctx context.Context, input *StoredCourse) (*StoredCourse, error) {
	now := time.Now()

	// Generate ID if not provided
	if input.ID == "" {
		input.ID = "course-" + uuid.New().String()
	}

	// Initialize defaults
	course := &StoredCourse{
		ID:      input.ID,
		Version: 1,
		Status:  CourseStatusDraft,
		Metadata: CourseMetadata{
			ID:         input.ID,
			Version:    1,
			Status:     string(CourseStatusDraft),
			CreatedAt:  now,
			ModifiedAt: now,
		},
		Settings: CourseSettings{
			Title:             "Untitled Course",
			DesiredOutcome:    "",
			DestinationFolder: "",
			CategoryTags:      []string{},
			DataSource:        "open-web",
		},
		Personas:           []map[string]any{},
		LearningObjectives: []map[string]any{},
		AssessmentSettings: map[string]any{
			"enableEmbeddedKnowledgeChecks": false,
			"enableFinalExam":               false,
		},
		Content: CourseContent{
			Sections:     []map[string]any{},
			CourseBlocks: []map[string]any{},
		},
		Exports: []map[string]any{},
	}

	// Apply provided values
	if input.Settings.Title != "" {
		course.Settings.Title = input.Settings.Title
	}
	if input.Settings.DesiredOutcome != "" {
		course.Settings.DesiredOutcome = input.Settings.DesiredOutcome
	}
	if input.Settings.DestinationFolder != "" {
		course.Settings.DestinationFolder = input.Settings.DestinationFolder
	}
	if len(input.Settings.CategoryTags) > 0 {
		course.Settings.CategoryTags = input.Settings.CategoryTags
	}
	if input.Settings.DataSource != "" {
		course.Settings.DataSource = input.Settings.DataSource
	}
	if len(input.Personas) > 0 {
		course.Personas = input.Personas
	}
	if len(input.LearningObjectives) > 0 {
		course.LearningObjectives = input.LearningObjectives
	}
	if input.AssessmentSettings != nil {
		course.AssessmentSettings = input.AssessmentSettings
	}
	if input.Content.Sections != nil || input.Content.CourseBlocks != nil {
		course.Content = input.Content
	}

	// Save course file
	coursePath := path.Join(coursesDir, course.ID+".json")
	if err := s.storage.WriteJSON(ctx, coursePath, course); err != nil {
		return nil, fmt.Errorf("failed to save course: %w", err)
	}

	// Update library index
	if err := s.addToLibrary(ctx, course); err != nil {
		return nil, fmt.Errorf("failed to update library: %w", err)
	}

	// Invalidate cache
	_ = s.cache.InvalidatePattern(ctx, "courses:*")

	return course, nil
}

// UpdateCourse updates an existing course.
func (s *CourseService) UpdateCourse(ctx context.Context, id string, updates *StoredCourse) (*StoredCourse, error) {
	course, err := s.GetCourse(ctx, id)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	course.Version++
	course.Metadata.Version = course.Version
	course.Metadata.ModifiedAt = now

	// Apply updates
	if updates.Settings.Title != "" {
		course.Settings.Title = updates.Settings.Title
	}
	if updates.Settings.DesiredOutcome != "" {
		course.Settings.DesiredOutcome = updates.Settings.DesiredOutcome
	}
	if updates.Settings.DestinationFolder != "" {
		course.Settings.DestinationFolder = updates.Settings.DestinationFolder
	}
	if len(updates.Settings.CategoryTags) > 0 {
		course.Settings.CategoryTags = updates.Settings.CategoryTags
	}
	if updates.Settings.DataSource != "" {
		course.Settings.DataSource = updates.Settings.DataSource
	}
	if len(updates.Personas) > 0 {
		course.Personas = updates.Personas
	}
	if len(updates.LearningObjectives) > 0 {
		course.LearningObjectives = updates.LearningObjectives
	}
	if updates.AssessmentSettings != nil {
		course.AssessmentSettings = updates.AssessmentSettings
	}
	if updates.Content.Sections != nil || updates.Content.CourseBlocks != nil {
		course.Content = updates.Content
	}
	if updates.Status != "" {
		course.Status = updates.Status
		course.Metadata.Status = string(updates.Status)
	}

	// Save updated course
	coursePath := path.Join(coursesDir, course.ID+".json")
	if err := s.storage.WriteJSON(ctx, coursePath, course); err != nil {
		return nil, fmt.Errorf("failed to save course: %w", err)
	}

	// Update library index
	if err := s.updateLibraryEntry(ctx, course); err != nil {
		return nil, fmt.Errorf("failed to update library: %w", err)
	}

	// Invalidate cache
	_ = s.cache.Delete(ctx, cache.CacheKeys.Course(id))
	_ = s.cache.InvalidatePattern(ctx, "courses:*")

	return course, nil
}

// DeleteCourse deletes a course.
func (s *CourseService) DeleteCourse(ctx context.Context, id string) error {
	coursePath := path.Join(coursesDir, id+".json")

	if err := s.storage.Delete(ctx, coursePath); err != nil {
		return fmt.Errorf("failed to delete course: %w", err)
	}

	// Remove from library index
	if err := s.removeFromLibrary(ctx, id); err != nil {
		return fmt.Errorf("failed to update library: %w", err)
	}

	// Invalidate cache
	_ = s.cache.Delete(ctx, cache.CacheKeys.Course(id))
	_ = s.cache.InvalidatePattern(ctx, "courses:*")
	_ = s.cache.InvalidatePattern(ctx, "folder:*")

	return nil
}

// GetFolderHierarchy returns the folder structure.
func (s *CourseService) GetFolderHierarchy(ctx context.Context, includeCounts bool) ([]Folder, error) {
	library, err := s.loadLibrary(ctx)
	if err != nil {
		return nil, err
	}

	return library.Folders, nil
}

// GetLibrary returns the full library.
func (s *CourseService) GetLibrary(ctx context.Context, includeCounts bool) (*Library, error) {
	return s.loadLibrary(ctx)
}

// loadLibrary loads the library index, creating it if needed.
func (s *CourseService) loadLibrary(ctx context.Context) (*Library, error) {
	var library Library

	err := s.storage.ReadJSON(ctx, libraryFile, &library)
	if err != nil {
		// Initialize default library
		library = s.defaultLibrary()
		if err := s.storage.WriteJSON(ctx, libraryFile, &library); err != nil {
			return nil, err
		}
	}

	return &library, nil
}

// saveLibrary saves the library index.
func (s *CourseService) saveLibrary(ctx context.Context, library *Library) error {
	library.LastUpdated = time.Now()
	return s.storage.WriteJSON(ctx, libraryFile, library)
}

// addToLibrary adds a course to the library index.
func (s *CourseService) addToLibrary(ctx context.Context, course *StoredCourse) error {
	library, err := s.loadLibrary(ctx)
	if err != nil {
		return err
	}

	entry := LibraryEntry{
		ID:         course.ID,
		Title:      course.Settings.Title,
		Status:     course.Status,
		Folder:     course.Settings.DestinationFolder,
		Tags:       course.Settings.CategoryTags,
		CreatedAt:  course.Metadata.CreatedAt,
		ModifiedAt: course.Metadata.ModifiedAt,
	}

	library.Courses = append(library.Courses, entry)
	return s.saveLibrary(ctx, library)
}

// updateLibraryEntry updates a course entry in the library.
func (s *CourseService) updateLibraryEntry(ctx context.Context, course *StoredCourse) error {
	library, err := s.loadLibrary(ctx)
	if err != nil {
		return err
	}

	for i, entry := range library.Courses {
		if entry.ID == course.ID {
			library.Courses[i] = LibraryEntry{
				ID:         course.ID,
				Title:      course.Settings.Title,
				Status:     course.Status,
				Folder:     course.Settings.DestinationFolder,
				Tags:       course.Settings.CategoryTags,
				CreatedAt:  entry.CreatedAt,
				ModifiedAt: course.Metadata.ModifiedAt,
			}
			break
		}
	}

	return s.saveLibrary(ctx, library)
}

// removeFromLibrary removes a course from the library index.
func (s *CourseService) removeFromLibrary(ctx context.Context, id string) error {
	library, err := s.loadLibrary(ctx)
	if err != nil {
		return err
	}

	var filtered []LibraryEntry
	for _, entry := range library.Courses {
		if entry.ID != id {
			filtered = append(filtered, entry)
		}
	}
	library.Courses = filtered

	return s.saveLibrary(ctx, library)
}

// defaultLibrary creates the default library structure.
func (s *CourseService) defaultLibrary() Library {
	return Library{
		Version:     "1.0",
		LastUpdated: time.Now(),
		Courses:     []LibraryEntry{},
		Folders: []Folder{
			{ID: "library", Name: "Library", Type: "library", Children: []string{"team", "personal"}},
			{ID: "team", Name: "Team-Name", Parent: "library", Type: "team", Children: []string{"hr", "sales", "product", "engineering"}},
			{ID: "hr", Name: "Human Resources", Parent: "team", Type: "folder", Children: []string{"onboarding", "training", "compliance"}},
			{ID: "onboarding", Name: "Onboarding", Parent: "hr", Type: "folder"},
			{ID: "training", Name: "Training", Parent: "hr", Type: "folder"},
			{ID: "compliance", Name: "Compliance", Parent: "hr", Type: "folder"},
			{ID: "sales", Name: "Sales Enablement", Parent: "team", Type: "folder", Children: []string{"sales-product-knowledge", "sales-skills", "sales-tools"}},
			{ID: "sales-product-knowledge", Name: "Product Knowledge", Parent: "sales", Type: "folder"},
			{ID: "sales-skills", Name: "Sales Skills", Parent: "sales", Type: "folder"},
			{ID: "sales-tools", Name: "Tools & Systems", Parent: "sales", Type: "folder"},
			{ID: "product", Name: "Product", Parent: "team", Type: "folder", Children: []string{"product-features", "product-roadmap"}},
			{ID: "product-features", Name: "Feature Training", Parent: "product", Type: "folder"},
			{ID: "product-roadmap", Name: "Roadmap", Parent: "product", Type: "folder"},
			{ID: "engineering", Name: "Engineering", Parent: "team", Type: "folder", Children: []string{"eng-backend", "eng-frontend", "eng-devops"}},
			{ID: "eng-backend", Name: "Backend Development", Parent: "engineering", Type: "folder"},
			{ID: "eng-frontend", Name: "Frontend Development", Parent: "engineering", Type: "folder"},
			{ID: "eng-devops", Name: "DevOps", Parent: "engineering", Type: "folder"},
			{ID: "personal", Name: "Personal", Parent: "library", Type: "personal", Children: []string{"my-drafts", "completed-courses", "shared-with-me"}},
			{ID: "my-drafts", Name: "My Drafts", Parent: "personal", Type: "folder"},
			{ID: "completed-courses", Name: "Completed Courses", Parent: "personal", Type: "folder"},
			{ID: "shared-with-me", Name: "Shared with Me", Parent: "personal", Type: "folder"},
		},
	}
}

// contains checks if a slice contains a string.
func contains(slice []string, s string) bool {
	for _, item := range slice {
		if item == s {
			return true
		}
	}
	return false
}
