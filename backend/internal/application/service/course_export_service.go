package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/scorm"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// ExportTaskEnqueuer enqueues export background tasks.
type ExportTaskEnqueuer interface {
	EnqueueCourseExport(exportID, tenantID string) error
}

// ExportNotifier sends notifications for export events.
type ExportNotifier interface {
	NotifyExportComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, format string, downloadURL string) error
	NotifyExportFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, errorMsg string) error
}

// ExportStorage abstracts storage operations for exports.
type ExportStorage interface {
	// PutContent stores raw content to storage.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	// GenerateDownloadURL generates a presigned URL for downloads.
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
	// Delete removes a file from storage.
	Delete(ctx context.Context, path string) error
}

// CourseExportService handles course export operations.
type CourseExportService struct {
	userRepo       repository.UserRepository
	courseRepo     repository.CourseRepository
	exportRepo     repository.CourseExportRepository
	outlineRepo    repository.CourseOutlineRepository
	sectionRepo    repository.OutlineSectionRepository
	lessonRepo     repository.OutlineLessonRepository
	genLessonRepo  repository.GeneratedLessonRepository
	componentRepo  repository.LessonComponentRepository
	scormPackager  *scorm.Packager
	storage        ExportStorage
	taskEnqueuer   ExportTaskEnqueuer
	notifier       ExportNotifier
	logger         service.Logger
}

// NewCourseExportService creates a new course export service.
func NewCourseExportService(
	userRepo repository.UserRepository,
	courseRepo repository.CourseRepository,
	exportRepo repository.CourseExportRepository,
	outlineRepo repository.CourseOutlineRepository,
	sectionRepo repository.OutlineSectionRepository,
	lessonRepo repository.OutlineLessonRepository,
	genLessonRepo repository.GeneratedLessonRepository,
	componentRepo repository.LessonComponentRepository,
	scormPackager *scorm.Packager,
	storage ExportStorage,
	taskEnqueuer ExportTaskEnqueuer,
	notifier ExportNotifier,
	logger service.Logger,
) *CourseExportService {
	return &CourseExportService{
		userRepo:      userRepo,
		courseRepo:    courseRepo,
		exportRepo:    exportRepo,
		outlineRepo:   outlineRepo,
		sectionRepo:   sectionRepo,
		lessonRepo:    lessonRepo,
		genLessonRepo: genLessonRepo,
		componentRepo: componentRepo,
		scormPackager: scormPackager,
		storage:       storage,
		taskEnqueuer:  taskEnqueuer,
		notifier:      notifier,
		logger:        logger,
	}
}

// ExportCourseRequest contains the inputs for exporting a course.
type ExportCourseRequest struct {
	CourseID uuid.UUID
	Format   valueobject.ExportFormat
}

// ExportCourseResult contains the created export job.
type ExportCourseResult struct {
	Export *entity.CourseExport
}

// ExportCourse initiates a course export job.
func (s *CourseExportService) ExportCourse(ctx context.Context, kratosID uuid.UUID, req ExportCourseRequest) (*ExportCourseResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID, "format", req.Format)

	// Validate user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Verify course exists
	course, err := s.courseRepo.GetByID(ctx, req.CourseID)
	if err != nil || course == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("course not found")
	}

	// Verify course has generated content
	lessons, err := s.genLessonRepo.ListByCourseID(ctx, req.CourseID)
	if err != nil {
		log.Error("failed to list generated lessons", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if len(lessons) == 0 {
		return nil, domainerrors.ErrInvalidInput.WithMessage("course must have generated content before exporting")
	}

	// Create the export job
	export := &entity.CourseExport{
		TenantID:        *user.TenantID,
		CourseID:        req.CourseID,
		Format:          req.Format,
		Status:          valueobject.ExportStatusPending,
		ProgressPercent: 0,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.exportRepo.Create(ctx, export); err != nil {
		log.Error("failed to create export job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("export job created", "exportID", export.ID)

	// Push: Enqueue for immediate processing (if task enqueuer available)
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueCourseExport(export.ID.String(), export.TenantID.String()); err != nil {
			log.Warn("failed to enqueue export job, will be picked up by poll", "error", err)
		}
	}

	return &ExportCourseResult{Export: export}, nil
}

// GetExportStatus retrieves the current status of an export.
func (s *CourseExportService) GetExportStatus(ctx context.Context, kratosID uuid.UUID, exportID uuid.UUID) (*entity.CourseExport, error) {
	log := s.logger.With("kratosID", kratosID, "exportID", exportID)

	// Validate user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	export, err := s.exportRepo.GetByID(ctx, exportID)
	if err != nil {
		log.Error("failed to get export", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if export == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("export not found")
	}

	return export, nil
}

// GetDownloadURLResult contains the presigned URL and expiry.
type GetDownloadURLResult struct {
	URL       string
	ExpiresAt time.Time
}

// GetDownloadURL generates a presigned URL for downloading the export.
func (s *CourseExportService) GetDownloadURL(ctx context.Context, kratosID uuid.UUID, exportID uuid.UUID) (*GetDownloadURLResult, error) {
	log := s.logger.With("kratosID", kratosID, "exportID", exportID)

	// Validate user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	export, err := s.exportRepo.GetByID(ctx, exportID)
	if err != nil {
		log.Error("failed to get export", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if export == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("export not found")
	}

	if export.Status != valueobject.ExportStatusCompleted {
		return nil, domainerrors.ErrInvalidInput.WithMessage("export is not completed")
	}

	if export.FilePath == nil {
		return nil, domainerrors.ErrInternal.WithMessage("export file path not set")
	}

	// Generate presigned URL with 1-hour expiry
	expiry := 1 * time.Hour
	url, err := s.storage.GenerateDownloadURL(ctx, *export.FilePath, expiry)
	if err != nil {
		log.Error("failed to generate download URL", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return &GetDownloadURLResult{
		URL:       url,
		ExpiresAt: time.Now().Add(expiry),
	}, nil
}

// ListExports retrieves all exports for a course.
func (s *CourseExportService) ListExports(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) ([]*entity.CourseExport, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", courseID)

	// Validate user
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	exports, err := s.exportRepo.ListByCourseID(ctx, courseID)
	if err != nil {
		log.Error("failed to list exports", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return exports, nil
}

// ProcessExport processes an export job (called by worker).
// The ctx should already have tenant context set by the worker handler.
func (s *CourseExportService) ProcessExport(ctx context.Context, exportID uuid.UUID) error {
	log := s.logger.With("exportID", exportID)

	// Claim the export atomically (tenant context already set by worker)
	export, err := s.exportRepo.ClaimByID(ctx, exportID)
	if err != nil {
		log.Error("failed to claim export", "error", err)
		return err
	}

	if export == nil {
		log.Info("export not available for claim, may already be processed")
		return nil
	}

	log = log.With("tenantID", export.TenantID, "courseID", export.CourseID, "format", export.Format)
	log.Info("processing export")

	// Update progress: starting
	if err := s.exportRepo.MarkProcessing(ctx, exportID, 5, "Loading course data..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Process based on format
	switch export.Format {
	case valueobject.ExportFormatSCORM2004:
		return s.processSCORM2004Export(ctx, export)
	default:
		errMsg := fmt.Sprintf("unsupported export format: %s", export.Format)
		log.Error(errMsg)
		return s.failExport(ctx, export.ID, errMsg)
	}
}

// processSCORM2004Export handles SCORM 2004 export processing.
func (s *CourseExportService) processSCORM2004Export(ctx context.Context, export *entity.CourseExport) error {
	log := s.logger.With("exportID", export.ID, "courseID", export.CourseID)

	// Load course data
	course, err := s.courseRepo.GetByID(ctx, export.CourseID)
	if err != nil || course == nil {
		return s.failExport(ctx, export.ID, "failed to load course")
	}

	// Update progress: 10%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 10, "Loading course outline..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Load outline
	outline, err := s.outlineRepo.GetByCourseID(ctx, export.CourseID)
	if err != nil || outline == nil {
		return s.failExport(ctx, export.ID, "failed to load course outline")
	}

	// Load sections
	sections, err := s.sectionRepo.ListByOutlineID(ctx, outline.ID)
	if err != nil {
		return s.failExport(ctx, export.ID, "failed to load sections")
	}

	// Update progress: 20%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 20, "Loading lessons..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Build SCORM course data
	courseData := scorm.CourseData{
		ID:             export.CourseID.String(),
		Title:          course.Title,
		DesiredOutcome: "", // Could load from generation input if needed
		Sections:       make([]scorm.SectionData, 0, len(sections)),
	}

	// Load lessons and components for each section
	for _, section := range sections {
		sectionData := scorm.SectionData{
			ID:    section.ID.String(),
			Title: section.Title,
		}

		// Load outline lessons for this section
		outlineLessons, err := s.lessonRepo.ListBySectionID(ctx, section.ID)
		if err != nil {
			log.Warn("failed to load outline lessons for section", "sectionID", section.ID, "error", err)
			continue
		}

		for _, outlineLesson := range outlineLessons {
			// Get generated lesson by outline lesson ID
			genLesson, err := s.genLessonRepo.GetByOutlineLessonID(ctx, outlineLesson.ID)
			if err != nil || genLesson == nil {
				log.Warn("generated lesson not found for outline lesson", "outlineLessonID", outlineLesson.ID)
				continue
			}

			// Load components
			components, err := s.componentRepo.ListByLessonID(ctx, genLesson.ID)
			if err != nil {
				log.Warn("failed to load components for lesson", "lessonID", genLesson.ID, "error", err)
				continue
			}

			lessonData := scorm.LessonData{
				ID:    genLesson.ID.String(),
				Title: genLesson.Title,
			}

			if genLesson.SegueText != nil {
				lessonData.SegueText = *genLesson.SegueText
			}

			// Convert components to SCORM format
			for _, comp := range components {
				compData := scorm.ComponentData{
					Type:        s.mapComponentType(comp.Type),
					ContentJSON: string(comp.ContentJSON),
				}
				lessonData.Components = append(lessonData.Components, compData)
			}

			sectionData.Lessons = append(sectionData.Lessons, lessonData)
		}

		courseData.Sections = append(courseData.Sections, sectionData)
	}

	// Update progress: 50%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 50, "Packaging SCORM content..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Package the SCORM content
	result, err := s.scormPackager.Package(courseData)
	if err != nil {
		log.Error("failed to package SCORM content", "error", err)
		return s.failExport(ctx, export.ID, fmt.Sprintf("failed to package SCORM: %v", err))
	}

	// Update progress: 80%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 80, "Uploading export file..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Upload to storage
	storagePath := fmt.Sprintf("tenants/%s/exports/%s/%s",
		export.TenantID.String(),
		export.ID.String(),
		result.Filename,
	)

	if err := s.storage.PutContent(ctx, storagePath, result.Data, "application/zip"); err != nil {
		log.Error("failed to upload export file", "error", err)
		return s.failExport(ctx, export.ID, "failed to upload export file")
	}

	// Update progress: 95%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 95, "Finalizing..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Mark as completed
	if err := s.exportRepo.MarkCompleted(ctx, export.ID, storagePath, result.Size); err != nil {
		log.Error("failed to mark export as completed", "error", err)
		// Try to clean up uploaded file
		_ = s.storage.Delete(ctx, storagePath)
		return s.failExport(ctx, export.ID, "failed to finalize export")
	}

	// Send notification to user with download URL
	if s.notifier != nil {
		// Generate presigned URL with 7 days expiry for email/notification
		downloadExpiry := 7 * 24 * time.Hour
		downloadURL, err := s.storage.GenerateDownloadURL(ctx, storagePath, downloadExpiry)
		if err != nil {
			log.Warn("failed to generate download URL for notification", "error", err)
			downloadURL = "" // Notification will still work, just without direct download link
		}

		formatDisplay := "SCORM 2004"
		if err := s.notifier.NotifyExportComplete(ctx, export.CreatedByUserID, export.CourseID, export.ID, course.Title, formatDisplay, downloadURL); err != nil {
			log.Warn("failed to send export completion notification", "error", err)
		}
	}

	log.Info("export completed successfully", "filePath", storagePath, "fileSize", result.Size)
	return nil
}

// ProcessNextPending processes the next pending export (for polling fallback).
// This uses superadmin ONLY for the initial cross-tenant claim query,
// then switches to proper tenant context for all subsequent operations.
func (s *CourseExportService) ProcessNextPending(ctx context.Context) error {
	// Use superadmin context for cross-tenant discovery of orphaned jobs
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	// Claim next pending export (atomically marks as processing)
	export, err := s.exportRepo.ClaimPending(adminCtx)
	if err != nil {
		s.logger.Error("failed to claim pending export", "error", err)
		return err
	}

	if export == nil {
		s.logger.Debug("no pending exports found")
		return nil
	}

	// Switch to proper tenant context for all subsequent operations
	tenantCtx := tenant.WithTenantID(ctx, export.TenantID)

	s.logger.Info("poll claimed orphaned export, processing with tenant context",
		"exportID", export.ID,
		"tenantID", export.TenantID,
	)

	// Process within tenant context (export already claimed, so ClaimByID will return nil)
	// We call processSCORM2004Export directly since we already have the export
	switch export.Format {
	case valueobject.ExportFormatSCORM2004:
		return s.processSCORM2004Export(tenantCtx, export)
	default:
		errMsg := fmt.Sprintf("unsupported export format: %s", export.Format)
		s.logger.Error(errMsg)
		return s.failExport(tenantCtx, export.ID, errMsg)
	}
}

// failExport marks an export as failed with the given error message.
func (s *CourseExportService) failExport(ctx context.Context, exportID uuid.UUID, errMsg string) error {
	if err := s.exportRepo.MarkFailed(ctx, exportID, errMsg); err != nil {
		s.logger.Error("failed to mark export as failed", "exportID", exportID, "error", err)
	}
	return fmt.Errorf("%s", errMsg)
}

// mapComponentType converts domain component type to SCORM component type.
func (s *CourseExportService) mapComponentType(t valueobject.LessonComponentType) scorm.ComponentType {
	switch t {
	case valueobject.LessonComponentTypeText:
		return scorm.ComponentTypeText
	case valueobject.LessonComponentTypeHeading:
		return scorm.ComponentTypeHeading
	case valueobject.LessonComponentTypeImage:
		return scorm.ComponentTypeImage
	case valueobject.LessonComponentTypeQuiz:
		return scorm.ComponentTypeQuiz
	default:
		return scorm.ComponentTypeText
	}
}

// loadImageData loads image data for embedding in SCORM package.
// This is a placeholder - actual implementation would download from MinIO.
func (s *CourseExportService) loadImageData(ctx context.Context, components []scorm.ComponentData) ([]scorm.ImageData, error) {
	var images []scorm.ImageData

	for _, comp := range components {
		if comp.Type != scorm.ComponentTypeImage {
			continue
		}

		var content struct {
			URL     string `json:"url"`
			AltText string `json:"alt_text"`
		}

		if err := json.Unmarshal([]byte(comp.ContentJSON), &content); err != nil {
			continue
		}

		// For now, skip image embedding - images will be referenced by URL
		// In a full implementation, we would:
		// 1. Download the image from the URL
		// 2. Resize/compress if needed
		// 3. Add to images slice with local path
		_ = content
	}

	return images, nil
}
