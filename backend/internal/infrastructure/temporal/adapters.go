package temporal

import (
	"context"

	"github.com/google/uuid"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

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
