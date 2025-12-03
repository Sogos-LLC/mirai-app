package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// TenantAISettingsRepository defines the interface for tenant AI settings data access.
type TenantAISettingsRepository interface {
	// Get retrieves AI settings for a tenant (creates default if not exists).
	Get(ctx context.Context, tenantID uuid.UUID) (*entity.TenantAISettings, error)

	// Update updates AI settings.
	Update(ctx context.Context, settings *entity.TenantAISettings) error

	// IncrementTokenUsage increments the token usage counter.
	IncrementTokenUsage(ctx context.Context, tenantID uuid.UUID, tokens int64) error
}

// GenerationJobRepository defines the interface for generation job data access.
type GenerationJobRepository interface {
	// Create creates a new job.
	Create(ctx context.Context, job *entity.GenerationJob) error

	// GetByID retrieves a job by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error)

	// List retrieves jobs with optional filtering.
	List(ctx context.Context, opts entity.GenerationJobListOptions) ([]*entity.GenerationJob, error)

	// Update updates a job.
	Update(ctx context.Context, job *entity.GenerationJob) error

	// GetNextQueued atomically claims the next queued job for processing.
	// Updates status to 'processing' and sets started_at in one atomic operation.
	GetNextQueued(ctx context.Context) (*entity.GenerationJob, error)

	// ClaimJobByID atomically claims a specific job by ID for processing.
	// Returns the job if successfully claimed, nil if already processed/claimed.
	// Updates status to 'processing' and sets started_at in one atomic operation.
	ClaimJobByID(ctx context.Context, id uuid.UUID) (*entity.GenerationJob, error)

	// ListByParentID retrieves all child jobs for a parent job.
	ListByParentID(ctx context.Context, parentID uuid.UUID) ([]*entity.GenerationJob, error)

	// CheckAllChildrenComplete checks if all child jobs of a parent are completed.
	CheckAllChildrenComplete(ctx context.Context, parentID uuid.UUID) (bool, error)

	// TryFinalizeParentJob atomically checks if all children are complete and finalizes the parent job.
	// Returns the finalization result (completed count, failed count, total tokens) or nil if parent was already finalized.
	// Uses SELECT FOR UPDATE to prevent race conditions when multiple children complete simultaneously.
	TryFinalizeParentJob(ctx context.Context, parentID uuid.UUID) (*ParentJobFinalizationResult, error)
}

// ParentJobFinalizationResult contains the result of trying to finalize a parent job.
type ParentJobFinalizationResult struct {
	// WasFinalized indicates if this call successfully finalized the job (false if already finalized or not ready)
	WasFinalized bool
	// AllComplete indicates if all children are complete (regardless of who finalized)
	AllComplete bool
	// CompletedCount is the number of successfully completed children
	CompletedCount int
	// FailedCount is the number of failed children
	FailedCount int
	// TotalCount is the total number of children
	TotalCount int
	// TotalTokens is the sum of tokens used by all children
	TotalTokens int64
}

// CourseOutlineRepository defines the interface for course outline data access.
type CourseOutlineRepository interface {
	// Create creates a new outline.
	Create(ctx context.Context, outline *entity.CourseOutline) error

	// GetByID retrieves an outline by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseOutline, error)

	// GetByCourseID retrieves the latest outline for a course.
	GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseOutline, error)

	// GetByCourseIDAndVersion retrieves a specific version.
	GetByCourseIDAndVersion(ctx context.Context, courseID uuid.UUID, version int32) (*entity.CourseOutline, error)

	// Update updates an outline.
	Update(ctx context.Context, outline *entity.CourseOutline) error
}

// OutlineSectionRepository defines the interface for outline section data access.
type OutlineSectionRepository interface {
	// Create creates a new section.
	Create(ctx context.Context, section *entity.OutlineSection) error

	// GetByID retrieves a section by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineSection, error)

	// ListByOutlineID retrieves all sections for an outline.
	ListByOutlineID(ctx context.Context, outlineID uuid.UUID) ([]*entity.OutlineSection, error)

	// Update updates a section.
	Update(ctx context.Context, section *entity.OutlineSection) error

	// Delete deletes a section.
	Delete(ctx context.Context, id uuid.UUID) error
}

// OutlineLessonRepository defines the interface for outline lesson data access.
type OutlineLessonRepository interface {
	// Create creates a new lesson.
	Create(ctx context.Context, lesson *entity.OutlineLesson) error

	// GetByID retrieves a lesson by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineLesson, error)

	// ListBySectionID retrieves all lessons for a section.
	ListBySectionID(ctx context.Context, sectionID uuid.UUID) ([]*entity.OutlineLesson, error)

	// Update updates a lesson.
	Update(ctx context.Context, lesson *entity.OutlineLesson) error

	// Delete deletes a lesson.
	Delete(ctx context.Context, id uuid.UUID) error
}

// GeneratedLessonRepository defines the interface for generated lesson data access.
type GeneratedLessonRepository interface {
	// Create creates a new generated lesson.
	Create(ctx context.Context, lesson *entity.GeneratedLesson) error

	// GetByID retrieves a lesson by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.GeneratedLesson, error)

	// GetByOutlineLessonID retrieves by outline lesson reference.
	GetByOutlineLessonID(ctx context.Context, outlineLessonID uuid.UUID) (*entity.GeneratedLesson, error)

	// ListByCourseID retrieves all lessons for a course.
	ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.GeneratedLesson, error)

	// Update updates a lesson.
	Update(ctx context.Context, lesson *entity.GeneratedLesson) error
}

// LessonComponentRepository defines the interface for lesson component data access.
type LessonComponentRepository interface {
	// Create creates a new component.
	Create(ctx context.Context, component *entity.LessonComponent) error

	// GetByID retrieves a component by its ID.
	GetByID(ctx context.Context, id uuid.UUID) (*entity.LessonComponent, error)

	// ListByLessonID retrieves all components for a lesson.
	ListByLessonID(ctx context.Context, lessonID uuid.UUID) ([]*entity.LessonComponent, error)

	// Update updates a component.
	Update(ctx context.Context, component *entity.LessonComponent) error

	// Delete deletes a component.
	Delete(ctx context.Context, id uuid.UUID) error
}

// CourseGenerationInputRepository defines the interface for course generation input data access.
type CourseGenerationInputRepository interface {
	// Create creates or updates generation inputs for a course.
	Create(ctx context.Context, input *entity.CourseGenerationInput) error

	// GetByCourseID retrieves generation inputs for a course.
	GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseGenerationInput, error)

	// Update updates generation inputs.
	Update(ctx context.Context, input *entity.CourseGenerationInput) error
}
