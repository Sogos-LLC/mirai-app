// Package activities provides Go-side Temporal activities for the Mirai backend.
// These activities handle database operations, storage (MinIO), event publishing,
// and API key decryption — everything that needs direct access to Go infrastructure.
//
// Activities run on the "go-tasks" queue while AI generation runs on "ai-tasks" (Python).
package activities

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"

	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// APIKeyDecryptor abstracts per-tenant API key decryption.
type APIKeyDecryptor interface {
	DecryptAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error)
}

// GoActivities holds all dependencies for Go-side Temporal activities.
// Register this struct with the Temporal worker to make all methods available.
type GoActivities struct {
	JobRepo        repository.GenerationJobRepository
	KnowledgeRepo  repository.TeamKnowledgeRepository
	ContentStorage storage.StorageAdapter
	KeyDecryptor   APIKeyDecryptor
	Logger         *slog.Logger
}

// ---------------------------------------------------------------------------
// Job Status Activities
// ---------------------------------------------------------------------------

// ClaimJobInput is the input for the ClaimJob activity.
type ClaimJobInput struct {
	JobID string `json:"job_id"`
}

// ClaimJobOutput is the output from the ClaimJob activity.
type ClaimJobOutput struct {
	TenantID string `json:"tenant_id"`
	CourseID string `json:"course_id,omitempty"`
	UserID   string `json:"user_id"`
	JobType  string `json:"job_type"`
}

// ClaimJob atomically claims a job for processing (prevents duplicate execution).
func (a *GoActivities) ClaimJob(ctx context.Context, input ClaimJobInput) (*ClaimJobOutput, error) {
	// Temporal activities run without tenant context — use superadmin to bypass RLS.
	ctx = tenant.WithSuperAdmin(ctx, true)

	jobID, err := uuid.Parse(input.JobID)
	if err != nil {
		return nil, fmt.Errorf("parse job ID: %w", err)
	}

	job, err := a.JobRepo.ClaimJobByID(ctx, jobID)
	if err != nil {
		return nil, fmt.Errorf("claim job: %w", err)
	}

	output := &ClaimJobOutput{
		TenantID: job.TenantID.String(),
		UserID:   job.CreatedByUserID.String(),
		JobType:  string(job.Type),
	}
	if job.CourseID != nil {
		output.CourseID = job.CourseID.String()
	}

	return output, nil
}

// UpdateJobStatusInput is the input for the UpdateJobStatus activity.
type UpdateJobStatusInput struct {
	JobID           string `json:"job_id"`
	Status          string `json:"status"`
	ProgressPercent int32  `json:"progress_percent,omitempty"`
	ProgressMessage string `json:"progress_message,omitempty"`
	ErrorMessage    string `json:"error_message,omitempty"`
	TokensUsed      int64  `json:"tokens_used,omitempty"`
}

// UpdateJobStatus updates the job status in the database.
func (a *GoActivities) UpdateJobStatus(ctx context.Context, input UpdateJobStatusInput) error {
	// Temporal activities run without tenant context — use superadmin to bypass RLS.
	ctx = tenant.WithSuperAdmin(ctx, true)

	jobID, err := uuid.Parse(input.JobID)
	if err != nil {
		return fmt.Errorf("parse job ID: %w", err)
	}

	job, err := a.JobRepo.GetByID(ctx, jobID)
	if err != nil {
		return fmt.Errorf("get job: %w", err)
	}
	if job == nil {
		return fmt.Errorf("job %s not found", input.JobID)
	}

	// Python workflow sends uppercase status (e.g. "PROCESSING"), DB enum is lowercase.
	job.Status = valueobject.GenerationJobStatus(strings.ToLower(input.Status))
	if input.ProgressPercent > 0 {
		job.ProgressPercent = input.ProgressPercent
	}
	if input.ProgressMessage != "" {
		job.ProgressMessage = &input.ProgressMessage
	}
	if input.ErrorMessage != "" {
		job.ErrorMessage = &input.ErrorMessage
	}
	if input.TokensUsed > 0 {
		job.TokensUsed += input.TokensUsed
	}

	if err := a.JobRepo.Update(ctx, job); err != nil {
		return fmt.Errorf("update job: %w", err)
	}

	activity.GetLogger(ctx).Info("job status updated",
		"jobID", input.JobID,
		"status", input.Status,
	)
	return nil
}

// FinalizeParentJobInput is the input for the FinalizeParentJob activity.
type FinalizeParentJobInput struct {
	ParentJobID string `json:"parent_job_id"`
}

// FinalizeParentJobOutput is the output from the FinalizeParentJob activity.
type FinalizeParentJobOutput struct {
	AllComplete bool `json:"all_complete"`
	AnyFailed   bool `json:"any_failed"`
}

// FinalizeParentJob atomically checks if all child jobs are complete.
func (a *GoActivities) FinalizeParentJob(ctx context.Context, input FinalizeParentJobInput) (*FinalizeParentJobOutput, error) {
	// Temporal activities run without tenant context — use superadmin to bypass RLS.
	ctx = tenant.WithSuperAdmin(ctx, true)

	parentID, err := uuid.Parse(input.ParentJobID)
	if err != nil {
		return nil, fmt.Errorf("parse parent job ID: %w", err)
	}

	result, err := a.JobRepo.TryFinalizeParentJob(ctx, parentID)
	if err != nil {
		return nil, fmt.Errorf("finalize parent: %w", err)
	}

	return &FinalizeParentJobOutput{
		AllComplete: result != nil,
		AnyFailed:   result != nil && result.FailedCount > 0,
	}, nil
}

// ---------------------------------------------------------------------------
// API Key Decryption Activity
// ---------------------------------------------------------------------------

// DecryptAPIKeyInput is the input for the DecryptAPIKey activity.
type DecryptAPIKeyInput struct {
	TenantID string `json:"tenant_id"`
}

// DecryptAPIKeyOutput is the output from the DecryptAPIKey activity.
type DecryptAPIKeyOutput struct {
	APIKey string `json:"api_key"`
}

// DecryptAPIKey decrypts the per-tenant Gemini API key.
func (a *GoActivities) DecryptAPIKey(ctx context.Context, input DecryptAPIKeyInput) (*DecryptAPIKeyOutput, error) {
	// Temporal activities run without tenant context — use superadmin to bypass RLS.
	ctx = tenant.WithSuperAdmin(ctx, true)

	tenantID, err := uuid.Parse(input.TenantID)
	if err != nil {
		return nil, fmt.Errorf("parse tenant ID: %w", err)
	}

	apiKey, err := a.KeyDecryptor.DecryptAPIKey(ctx, tenantID)
	if err != nil {
		return nil, fmt.Errorf("decrypt API key: %w", err)
	}

	return &DecryptAPIKeyOutput{APIKey: apiKey}, nil
}

// ---------------------------------------------------------------------------
// Content Storage Activities
// ---------------------------------------------------------------------------

// ReadCourseContentInput is the input for the ReadCourseContent activity.
type ReadCourseContentInput struct {
	TenantID string `json:"tenant_id"`
	CourseID string `json:"course_id"`
}

// ReadCourseContent reads course content from MinIO.
func (a *GoActivities) ReadCourseContent(ctx context.Context, input ReadCourseContentInput) (map[string]interface{}, error) {
	path := fmt.Sprintf("tenants/%s/courses/%s/content.json", input.TenantID, input.CourseID)

	var content map[string]interface{}
	if err := a.ContentStorage.ReadJSON(ctx, path, &content); err != nil {
		return nil, fmt.Errorf("read course content: %w", err)
	}

	return content, nil
}

// WriteCourseContentInput is the input for the WriteCourseContent activity.
type WriteCourseContentInput struct {
	TenantID string                 `json:"tenant_id"`
	CourseID string                 `json:"course_id"`
	Content  map[string]interface{} `json:"content"`
}

// WriteCourseContent writes course content to MinIO.
func (a *GoActivities) WriteCourseContent(ctx context.Context, input WriteCourseContentInput) error {
	path := fmt.Sprintf("tenants/%s/courses/%s/content.json", input.TenantID, input.CourseID)

	if err := a.ContentStorage.WriteJSON(ctx, path, input.Content); err != nil {
		return fmt.Errorf("write course content: %w", err)
	}

	return nil
}

// ReadFileContentInput is the input for the ReadFileContent activity.
type ReadFileContentInput struct {
	FilePath string `json:"file_path"`
}

// ReadFileContentOutput is the output from the ReadFileContent activity.
type ReadFileContentOutput struct {
	Content string `json:"content"`
}

// ReadFileContent reads raw file content from MinIO (for knowledge ingestion).
func (a *GoActivities) ReadFileContent(ctx context.Context, input ReadFileContentInput) (*ReadFileContentOutput, error) {
	data, err := a.ContentStorage.GetContent(ctx, input.FilePath)
	if err != nil {
		return nil, fmt.Errorf("read file: %w", err)
	}

	return &ReadFileContentOutput{Content: string(data)}, nil
}

// ---------------------------------------------------------------------------
// Knowledge Status Activities
// ---------------------------------------------------------------------------

// UpdateKnowledgeStatusInput is the input for the UpdateKnowledgeStatus activity.
type UpdateKnowledgeStatusInput struct {
	SourceID     string `json:"source_id"`
	TenantID     string `json:"tenant_id"`
	Status       string `json:"status"`
	ErrorMessage string `json:"error_message,omitempty"`
	ChunkCount   int32  `json:"chunk_count,omitempty"`
	Summary      string `json:"summary,omitempty"`
	TokenCount   int32  `json:"token_count,omitempty"`
}

// UpdateKnowledgeStatus updates the knowledge source status in the database.
func (a *GoActivities) UpdateKnowledgeStatus(ctx context.Context, input UpdateKnowledgeStatusInput) error {
	ctx = tenant.WithSuperAdmin(ctx, true)

	sourceID, err := uuid.Parse(input.SourceID)
	if err != nil {
		return fmt.Errorf("parse source ID: %w", err)
	}

	status, err := valueobject.ParseKnowledgeSourceStatus(strings.ToLower(input.Status))
	if err != nil {
		return fmt.Errorf("parse status: %w", err)
	}

	var errMsg *string
	if input.ErrorMessage != "" {
		errMsg = &input.ErrorMessage
	}

	if input.Summary != "" {
		_, err = a.KnowledgeRepo.UpdateStatusWithSummary(ctx, sourceID, status, errMsg, input.ChunkCount, input.Summary, input.TokenCount)
	} else {
		_, err = a.KnowledgeRepo.UpdateStatus(ctx, sourceID, status, errMsg, input.ChunkCount)
	}
	if err != nil {
		return fmt.Errorf("update knowledge status: %w", err)
	}

	activity.GetLogger(ctx).Info("knowledge status updated",
		"sourceID", input.SourceID,
		"status", input.Status,
	)
	return nil
}
