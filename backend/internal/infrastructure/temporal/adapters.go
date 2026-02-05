package temporal

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
)

// PubSubJobEventPublisher implements activities.JobEventPublisher
// by fetching the job from the DB, converting to proto, and publishing via Redis pub/sub.
type PubSubJobEventPublisher struct {
	publisher pubsub.Publisher
	jobRepo   repository.GenerationJobRepository
}

// NewPubSubJobEventPublisher creates a new PubSubJobEventPublisher.
func NewPubSubJobEventPublisher(publisher pubsub.Publisher, jobRepo repository.GenerationJobRepository) *PubSubJobEventPublisher {
	return &PubSubJobEventPublisher{
		publisher: publisher,
		jobRepo:   jobRepo,
	}
}

// PublishJobEventByID fetches the job from the DB, converts to proto, and publishes.
func (p *PubSubJobEventPublisher) PublishJobEventByID(ctx context.Context, userID, jobID uuid.UUID, eventType string) error {
	job, err := p.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return fmt.Errorf("get job for event: %w", err)
	}

	protoJob := &v1.GenerationJob{
		Id:              job.ID.String(),
		TenantId:        job.TenantID.String(),
		Type:            jobTypeToProto(job.Type),
		Status:          jobStatusToProto(job.Status),
		ProgressPercent: int32(job.ProgressPercent),
		ProgressMessage: job.ProgressMessage,
		ResultPath:      job.ResultPath,
		ErrorMessage:    job.ErrorMessage,
		TokensUsed:      job.TokensUsed,
		RetryCount:      int32(job.RetryCount),
		MaxRetries:      int32(job.MaxRetries),
		CreatedByUserId: job.CreatedByUserID.String(),
		CreatedAt:       timestamppb.New(job.CreatedAt),
	}

	if job.CourseID != nil {
		s := job.CourseID.String()
		protoJob.CourseId = &s
	}
	if job.ParentJobID != nil {
		s := job.ParentJobID.String()
		protoJob.ParentJobId = &s
	}
	if job.StartedAt != nil {
		protoJob.StartedAt = timestamppb.New(*job.StartedAt)
	}
	if job.CompletedAt != nil {
		protoJob.CompletedAt = timestamppb.New(*job.CompletedAt)
	}

	protoEventType := stringToJobEventType(eventType)

	return p.publisher.PublishJobEvent(ctx, userID, &pubsub.JobEvent{
		EventType: protoEventType,
		Job:       protoJob,
	})
}

// PublishJobStepEventByID publishes an awaiting-approval event with step data
// and persists the pending step on the job record for workflow resumption.
func (p *PubSubJobEventPublisher) PublishJobStepEventByID(ctx context.Context, userID, jobID uuid.UUID, step, dataJSON string) error {
	// Persist pending step on job for resumption
	pendingStep := stringToWorkflowStepType(step)
	stepInt := int32(pendingStep)
	if err := p.jobRepo.UpdatePendingStep(ctx, jobID, string(valueobject.GenerationJobStatusAwaitingApproval), &stepInt, &dataJSON); err != nil {
		return fmt.Errorf("persist pending step: %w", err)
	}

	job, err := p.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return fmt.Errorf("get job for step event: %w", err)
	}

	protoJob := &v1.GenerationJob{
		Id:              job.ID.String(),
		TenantId:        job.TenantID.String(),
		Type:            jobTypeToProto(job.Type),
		Status:          jobStatusToProto(job.Status),
		ProgressPercent: int32(job.ProgressPercent),
		ProgressMessage: job.ProgressMessage,
		CreatedByUserId: job.CreatedByUserID.String(),
	}

	if job.CourseID != nil {
		s := job.CourseID.String()
		protoJob.CourseId = &s
	}

	return p.publisher.PublishJobEvent(ctx, userID, &pubsub.JobEvent{
		EventType:    v1.JobEventType_JOB_EVENT_TYPE_AWAITING_APPROVAL,
		Job:          protoJob,
		PendingStep:  &pendingStep,
		StepDataJSON: &dataJSON,
	})
}

func stringToWorkflowStepType(s string) v1.WorkflowStepType {
	switch s {
	case "title":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_TITLE
	case "outcomes":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_OUTCOMES
	case "sme_personas":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_SME_PERSONAS
	case "audience_personas":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_AUDIENCE_PERSONAS
	case "tone_options":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_TONE_OPTIONS
	case "course_plan":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_COURSE_PLAN
	case "outline":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_OUTLINE
	case "lessons":
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_LESSONS
	default:
		return v1.WorkflowStepType_WORKFLOW_STEP_TYPE_UNSPECIFIED
	}
}

func stringToJobEventType(s string) v1.JobEventType {
	switch s {
	case "created":
		return v1.JobEventType_JOB_EVENT_TYPE_CREATED
	case "updated":
		return v1.JobEventType_JOB_EVENT_TYPE_UPDATED
	case "completed":
		return v1.JobEventType_JOB_EVENT_TYPE_COMPLETED
	case "failed":
		return v1.JobEventType_JOB_EVENT_TYPE_FAILED
	case "cancelled":
		return v1.JobEventType_JOB_EVENT_TYPE_CANCELLED
	case "awaiting_approval":
		return v1.JobEventType_JOB_EVENT_TYPE_AWAITING_APPROVAL
	default:
		return v1.JobEventType_JOB_EVENT_TYPE_UNSPECIFIED
	}
}

func jobTypeToProto(t valueobject.GenerationJobType) v1.GenerationJobType {
	switch t {
	case valueobject.GenerationJobTypeCoursePlanning:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_PLANNING
	case valueobject.GenerationJobTypeCourseOutline:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE
	case valueobject.GenerationJobTypeLessonContent:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT
	case valueobject.GenerationJobTypeComponentRegen:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN
	case valueobject.GenerationJobTypeFullCourse:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_FULL_COURSE
	case valueobject.GenerationJobTypeCourseCreation:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_CREATION
	default:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_UNSPECIFIED
	}
}

func jobStatusToProto(s valueobject.GenerationJobStatus) v1.GenerationJobStatus {
	switch s {
	case valueobject.GenerationJobStatusQueued:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_QUEUED
	case valueobject.GenerationJobStatusProcessing:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_PROCESSING
	case valueobject.GenerationJobStatusCompleted:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_COMPLETED
	case valueobject.GenerationJobStatusFailed:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_FAILED
	case valueobject.GenerationJobStatusCancelled:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_CANCELLED
	case valueobject.GenerationJobStatusAwaitingApproval:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_AWAITING_APPROVAL
	default:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_UNSPECIFIED
	}
}

// SettingsAPIKeyDecryptor implements activities.APIKeyDecryptor
// by delegating to the existing TenantSettingsService.
type SettingsAPIKeyDecryptor struct {
	settingsProvider APIKeyProvider
}

// APIKeyProvider abstracts the method we need from TenantSettingsService.
type APIKeyProvider interface {
	GetDecryptedAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error)
}

// NewSettingsAPIKeyDecryptor creates a new SettingsAPIKeyDecryptor.
func NewSettingsAPIKeyDecryptor(provider APIKeyProvider) *SettingsAPIKeyDecryptor {
	return &SettingsAPIKeyDecryptor{settingsProvider: provider}
}

// DecryptAPIKey decrypts the per-tenant API key.
func (d *SettingsAPIKeyDecryptor) DecryptAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error) {
	return d.settingsProvider.GetDecryptedAPIKey(ctx, tenantID)
}
