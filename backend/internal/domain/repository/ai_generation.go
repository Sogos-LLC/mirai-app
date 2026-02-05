package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// TenantAISettingsRepository defines the interface for tenant AI settings data access.
type TenantAISettingsRepository interface {
	// Get retrieves AI settings for a tenant.
	// Returns (nil, nil) if settings don't exist yet.
	Get(ctx context.Context, tenantID uuid.UUID) (*entity.TenantAISettings, error)

	// Create creates new AI settings for a tenant.
	Create(ctx context.Context, settings *entity.TenantAISettings) error

	// Update updates AI settings.
	Update(ctx context.Context, settings *entity.TenantAISettings) error

	// IncrementTokenUsage increments the token usage counter.
	IncrementTokenUsage(ctx context.Context, tenantID uuid.UUID, tokens int64) error
}

// TenantKnowledgeSettingsRepository defines the interface for tenant knowledge settings data access.
type TenantKnowledgeSettingsRepository interface {
	// Get retrieves knowledge settings for a tenant.
	// Returns (nil, nil) if settings don't exist yet.
	Get(ctx context.Context, tenantID uuid.UUID) (*entity.TenantKnowledgeSettings, error)

	// Create creates new knowledge settings for a tenant.
	Create(ctx context.Context, settings *entity.TenantKnowledgeSettings) error

	// Update updates knowledge settings.
	Update(ctx context.Context, settings *entity.TenantKnowledgeSettings) error
}

// GenerationJobRepository defines the interface for generation job data access.
type GenerationJobRepository interface {
	// Create creates a new job.
	Create(ctx context.Context, job *entity.GenerationJob) error

	// CreateBatch atomically creates multiple jobs in a single transaction.
	// If any job fails to create, all jobs are rolled back.
	CreateBatch(ctx context.Context, jobs []*entity.GenerationJob) error

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

	// TryFinalizeParentJob atomically checks if all children are complete and optionally finalizes the parent job.
	// If allComplete is true and WasFinalized is true, the parent status has been updated atomically.
	// Returns the finalization result (completed count, failed count, total tokens) or nil if parent not found.
	// Uses SELECT FOR UPDATE to prevent race conditions when multiple children complete simultaneously.
	TryFinalizeParentJob(ctx context.Context, parentID uuid.UUID) (*ParentJobFinalizationResult, error)

	// FinalizeParentJob atomically checks child completion and updates parent status in one transaction.
	// This is the preferred method as it ensures the status update is inside the atomic lock.
	// Returns nil if parent was already finalized or not found.
	FinalizeParentJob(ctx context.Context, parentID uuid.UUID, completedStatus, failedStatus string, progressMessage string) (*ParentJobFinalizationResult, error)

	// UpdatePendingStep updates the job's status and persists pending step data for workflow resumption.
	UpdatePendingStep(ctx context.Context, id uuid.UUID, status string, pendingStep *int32, stepDataJSON *string) error

	// ClearPendingStep clears the pending step fields after a step is approved/rejected.
	ClearPendingStep(ctx context.Context, id uuid.UUID) error
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

// NOTE: Course content repositories (CourseOutlineRepository, OutlineSectionRepository,
// OutlineLessonRepository, GeneratedLessonRepository, LessonComponentRepository,
// CourseGenerationInputRepository) have been removed. All course content is now
// stored directly in MinIO as course_outline.json and content.json files.
