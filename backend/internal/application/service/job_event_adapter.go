package service

import (
	"context"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
)

// JobEventAdapter adapts the pubsub.Publisher to the JobEventPublisher interface.
// It handles converting domain entities to proto types for real-time streaming.
type JobEventAdapter struct {
	publisher pubsub.Publisher
	logger    domainservice.Logger
}

// NewJobEventAdapter creates a new JobEventAdapter.
func NewJobEventAdapter(publisher pubsub.Publisher, logger domainservice.Logger) *JobEventAdapter {
	return &JobEventAdapter{
		publisher: publisher,
		logger:    logger,
	}
}

// PublishJobEvent publishes a job event to the user's job channel.
// eventType should be one of: "created", "updated", "completed", "failed", "cancelled"
func (a *JobEventAdapter) PublishJobEvent(ctx context.Context, userID uuid.UUID, eventType string, job *entity.GenerationJob) error {
	if a.publisher == nil {
		return nil
	}

	protoEventType := stringToJobEventType(eventType)
	protoJob := generationJobToProto(job)

	event := &pubsub.JobEvent{
		EventType: protoEventType,
		Job:       protoJob,
	}

	if err := a.publisher.PublishJobEvent(ctx, userID, event); err != nil {
		a.logger.Warn("failed to publish job event",
			"error", err,
			"userID", userID,
			"eventType", eventType,
			"jobID", job.ID,
		)
		return err
	}

	a.logger.Debug("published job event",
		"userID", userID,
		"eventType", eventType,
		"jobID", job.ID,
	)

	return nil
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
	default:
		return v1.JobEventType_JOB_EVENT_TYPE_UNSPECIFIED
	}
}

func generationJobToProto(job *entity.GenerationJob) *v1.GenerationJob {
	if job == nil {
		return nil
	}

	proto := &v1.GenerationJob{
		Id:              job.ID.String(),
		TenantId:        job.TenantID.String(),
		Type:            generationJobTypeToProto(job.Type),
		Status:          generationJobStatusToProto(job.Status),
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
		proto.CourseId = &s
	}
	if job.LessonID != nil {
		s := job.LessonID.String()
		proto.LessonId = &s
	}
	if job.ParentJobID != nil {
		s := job.ParentJobID.String()
		proto.ParentJobId = &s
	}
	if job.StartedAt != nil {
		proto.StartedAt = timestamppb.New(*job.StartedAt)
	}
	if job.CompletedAt != nil {
		proto.CompletedAt = timestamppb.New(*job.CompletedAt)
	}

	return proto
}

func generationJobTypeToProto(t valueobject.GenerationJobType) v1.GenerationJobType {
	switch t {
	case valueobject.GenerationJobTypeCourseOutline:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COURSE_OUTLINE
	case valueobject.GenerationJobTypeLessonContent:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_LESSON_CONTENT
	case valueobject.GenerationJobTypeComponentRegen:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_COMPONENT_REGEN
	case valueobject.GenerationJobTypeFullCourse:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_FULL_COURSE
	default:
		return v1.GenerationJobType_GENERATION_JOB_TYPE_UNSPECIFIED
	}
}

func generationJobStatusToProto(s valueobject.GenerationJobStatus) v1.GenerationJobStatus {
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
	default:
		return v1.GenerationJobStatus_GENERATION_JOB_STATUS_UNSPECIFIED
	}
}
