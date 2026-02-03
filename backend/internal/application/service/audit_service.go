package service

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// AuditService handles course audit logging.
type AuditService struct {
	auditRepo repository.CourseAuditLogRepository
	logger    service.Logger
}

// NewAuditService creates a new audit service.
func NewAuditService(
	auditRepo repository.CourseAuditLogRepository,
	logger service.Logger,
) *AuditService {
	return &AuditService{
		auditRepo: auditRepo,
		logger:    logger,
	}
}

// LogOutlineApproved logs when a course outline is approved.
func (s *AuditService) LogOutlineApproved(ctx context.Context, tenantID, courseID, actorID uuid.UUID, sectionCount, lessonCount, version int) error {
	metadata, _ := json.Marshal(entity.OutlineApprovedMetadata{
		SectionCount: sectionCount,
		LessonCount:  lessonCount,
		Version:      version,
	})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionOutlineApproved,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log outline approved", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: outline approved", "courseID", courseID, "actorID", actorID)
	return nil
}

// LogOutlineRejected logs when a course outline is rejected.
func (s *AuditService) LogOutlineRejected(ctx context.Context, tenantID, courseID, actorID uuid.UUID, reason string) error {
	metadata, _ := json.Marshal(map[string]string{"reason": reason})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionOutlineRejected,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log outline rejected", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: outline rejected", "courseID", courseID, "actorID", actorID)
	return nil
}

// LogCurriculumApproved logs when a curriculum map is approved.
func (s *AuditService) LogCurriculumApproved(ctx context.Context, tenantID, courseID, actorID uuid.UUID, warningsAcknowledged bool, warningCount, errorCount int, groundingScore float32) error {
	metadata, _ := json.Marshal(entity.CurriculumApprovedMetadata{
		WarningsAcknowledged: warningsAcknowledged,
		WarningCount:         warningCount,
		ErrorCount:           errorCount,
		GroundingScore:       groundingScore,
	})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionCurriculumApproved,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log curriculum approved", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: curriculum approved", "courseID", courseID, "actorID", actorID, "warningsAcknowledged", warningsAcknowledged)
	return nil
}

// LogCurriculumOverride logs when a curriculum map is approved with warnings overridden.
func (s *AuditService) LogCurriculumOverride(ctx context.Context, tenantID, courseID, actorID uuid.UUID, warningCount int) error {
	metadata, _ := json.Marshal(map[string]int{"warning_count": warningCount})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionCurriculumOverride,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log curriculum override", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: curriculum override", "courseID", courseID, "actorID", actorID, "warningCount", warningCount)
	return nil
}

// LogLessonsGenerated logs when lessons are generated.
func (s *AuditService) LogLessonsGenerated(ctx context.Context, tenantID, courseID, actorID uuid.UUID, totalLessons int, totalTokens int64, parentJobID string) error {
	metadata, _ := json.Marshal(entity.LessonsGeneratedMetadata{
		TotalLessons: totalLessons,
		TotalTokens:  totalTokens,
		ParentJobID:  parentJobID,
	})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionLessonsGenerated,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log lessons generated", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: lessons generated", "courseID", courseID, "actorID", actorID, "totalLessons", totalLessons)
	return nil
}

// LogKnowledgeLocked logs when knowledge selection is locked for a course.
func (s *AuditService) LogKnowledgeLocked(ctx context.Context, tenantID, courseID, actorID uuid.UUID, teamSourceCount, globalSourceCount int, totalTokens int64) error {
	metadata, _ := json.Marshal(entity.KnowledgeLockedMetadata{
		TeamSourceCount:   teamSourceCount,
		GlobalSourceCount: globalSourceCount,
		TotalTokens:       totalTokens,
	})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionKnowledgeLocked,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log knowledge locked", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: knowledge locked", "courseID", courseID, "actorID", actorID)
	return nil
}

// LogCourseExported logs when a course is exported.
func (s *AuditService) LogCourseExported(ctx context.Context, tenantID, courseID, actorID uuid.UUID, format string) error {
	metadata, _ := json.Marshal(map[string]string{"format": format})

	entry := &entity.CourseAuditLogEntry{
		TenantID: tenantID,
		CourseID: courseID,
		Action:   entity.AuditActionCourseExported,
		ActorID:  actorID,
		Metadata: metadata,
	}

	if err := s.auditRepo.Create(ctx, entry); err != nil {
		s.logger.Error("failed to log course exported", "courseID", courseID, "error", err)
		return err
	}

	s.logger.Info("audit: course exported", "courseID", courseID, "actorID", actorID, "format", format)
	return nil
}

// GetAuditLogByCourse retrieves the audit log for a course.
func (s *AuditService) GetAuditLogByCourse(ctx context.Context, courseID uuid.UUID, limit, offset int) ([]*entity.CourseAuditLogEntry, error) {
	return s.auditRepo.ListByCourse(ctx, courseID, limit, offset)
}

// GetAuditLogCount returns the count of audit entries for a course.
func (s *AuditService) GetAuditLogCount(ctx context.Context, courseID uuid.UUID) (int64, error) {
	return s.auditRepo.CountByCourse(ctx, courseID)
}
