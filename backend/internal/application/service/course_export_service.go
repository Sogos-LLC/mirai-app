package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/pdf"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/scorm"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// ExportWorkflowStarter starts export workflows.
type ExportWorkflowStarter interface {
	StartCourseExport(ctx context.Context, exportID, tenantID string) (string, error)
}

// ExportNotifier sends notifications for export events.
type ExportNotifier interface {
	NotifyExportComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, format string, downloadURL string) error
	NotifyExportFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, exportID uuid.UUID, courseTitle string, errorMsg string) error
}

// ExportStorage abstracts storage operations for exports.
type ExportStorage interface {
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
	Delete(ctx context.Context, path string) error
}

// CourseExportService handles course export operations.
// Reads course content from MinIO (no PostgreSQL dependencies for content).
type CourseExportService struct {
	userRepo        repository.UserRepository
	courseRepo      repository.CourseRepository
	exportRepo      repository.CourseExportRepository
	scormPackager   *scorm.Packager
	pdfGenerator    *pdf.Generator
	storage         ExportStorage
	contentStorage  *storage.TenantAwareStorage
	workflowStarter ExportWorkflowStarter
	notifier        ExportNotifier
	logger          service.Logger
}

// NewCourseExportService creates a new course export service.
func NewCourseExportService(
	userRepo repository.UserRepository,
	courseRepo repository.CourseRepository,
	exportRepo repository.CourseExportRepository,
	scormPackager *scorm.Packager,
	pdfGenerator *pdf.Generator,
	storage ExportStorage,
	contentStorage *storage.TenantAwareStorage,
	workflowStarter ExportWorkflowStarter,
	notifier ExportNotifier,
	logger service.Logger,
) *CourseExportService {
	return &CourseExportService{
		userRepo:        userRepo,
		courseRepo:      courseRepo,
		exportRepo:      exportRepo,
		scormPackager:   scormPackager,
		pdfGenerator:    pdfGenerator,
		storage:         storage,
		contentStorage:  contentStorage,
		workflowStarter: workflowStarter,
		notifier:        notifier,
		logger:          logger,
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

	// Verify course has generated content by reading from MinIO
	content, err := s.readCourseContent(ctx, *user.TenantID, req.CourseID)
	if err != nil {
		log.Error("failed to read course content", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if len(content.GeneratedLessons) == 0 {
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

	// Start the Temporal export workflow
	if s.workflowStarter != nil {
		if _, err := s.workflowStarter.StartCourseExport(ctx, export.ID.String(), export.TenantID.String()); err != nil {
			log.Error("failed to start export workflow", "error", err)
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
	case valueobject.ExportFormatPDF:
		return s.processPDFExport(ctx, export)
	default:
		errMsg := fmt.Sprintf("unsupported export format: %s", export.Format)
		log.Error(errMsg)
		return s.failExport(ctx, export.ID, errMsg)
	}
}

// buildCourseData loads course metadata and content from MinIO and builds a CourseData struct.
// This is shared between SCORM and PDF export processing.
func (s *CourseExportService) buildCourseData(ctx context.Context, export *entity.CourseExport) (*scorm.CourseData, *entity.Course, error) {
	log := s.logger.With("exportID", export.ID, "courseID", export.CourseID)

	// Load course metadata
	course, err := s.courseRepo.GetByID(ctx, export.CourseID)
	if err != nil || course == nil {
		return nil, nil, fmt.Errorf("failed to load course")
	}

	// Read course content from MinIO
	content, err := s.readCourseContent(ctx, export.TenantID, export.CourseID)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to load course content from storage")
	}

	if len(content.Content.Sections) == 0 {
		return nil, nil, fmt.Errorf("course has no outline")
	}

	// Build course data from MinIO content
	courseData := scorm.CourseData{
		ID:             export.CourseID.String(),
		Title:          course.Title,
		DesiredOutcome: content.Settings.DesiredOutcome,
		Sections:       make([]scorm.SectionData, 0, len(content.Content.Sections)),
	}

	// Build a map of generated lessons by ID for quick lookup
	lessonMap := make(map[string]S3GeneratedLesson)
	for _, lesson := range content.GeneratedLessons {
		lessonMap[lesson.ID] = lesson
	}

	// Build sections from outline
	for _, sectionData := range content.Content.Sections {
		sectionID, _ := sectionData["id"].(string)
		sectionTitle, _ := sectionData["title"].(string)

		section := scorm.SectionData{
			ID:    sectionID,
			Title: sectionTitle,
		}

		var lessons []interface{}
		if l, ok := sectionData["lessons"].([]interface{}); ok {
			lessons = l
		}

		for _, lessonDataRaw := range lessons {
			lessonData, ok := lessonDataRaw.(map[string]interface{})
			if !ok {
				continue
			}

			lessonID, _ := lessonData["id"].(string)
			lessonTitle, _ := lessonData["title"].(string)

			// Find generated lesson content
			genLesson, found := lessonMap[lessonID]
			if !found {
				log.Warn("generated content not found for lesson", "lessonID", lessonID)
				continue
			}

			lesson := scorm.LessonData{
				ID:    lessonID,
				Title: lessonTitle,
			}

			if genLesson.SegueText != nil {
				lesson.SegueText = *genLesson.SegueText
			}

			// Convert components
			for _, comp := range genLesson.Components {
				lesson.Components = append(lesson.Components, scorm.ComponentData{
					Type:        s.mapComponentType(valueobject.LessonComponentType(comp.Type)),
					ContentJSON: string(comp.ContentJSON),
				})
			}

			section.Lessons = append(section.Lessons, lesson)
		}

		courseData.Sections = append(courseData.Sections, section)
	}

	return &courseData, course, nil
}

// processSCORM2004Export handles SCORM 2004 export processing.
// Reads all content from MinIO instead of PostgreSQL.
func (s *CourseExportService) processSCORM2004Export(ctx context.Context, export *entity.CourseExport) error {
	log := s.logger.With("exportID", export.ID, "courseID", export.CourseID)

	// Update progress: 10%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 10, "Loading course content..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	courseData, course, err := s.buildCourseData(ctx, export)
	if err != nil {
		return s.failExport(ctx, export.ID, err.Error())
	}

	// Update progress: 20%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 20, "Building export structure..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Update progress: 50%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 50, "Packaging SCORM content..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Package the SCORM content
	result, err := s.scormPackager.Package(*courseData)
	if err != nil {
		log.Error("failed to package SCORM content", "error", err)
		return s.failExport(ctx, export.ID, fmt.Sprintf("failed to package SCORM: %v", err))
	}

	// Upload and finalize
	return s.uploadAndFinalize(ctx, export, course, result.Data, result.Filename, result.Size, "application/zip", "SCORM 2004")
}

// processPDFExport handles PDF export processing.
func (s *CourseExportService) processPDFExport(ctx context.Context, export *entity.CourseExport) error {
	log := s.logger.With("exportID", export.ID, "courseID", export.CourseID)

	// Update progress: 10%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 10, "Loading course content..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	courseData, course, err := s.buildCourseData(ctx, export)
	if err != nil {
		return s.failExport(ctx, export.ID, err.Error())
	}

	// Update progress: 30%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 30, "Generating PDF document..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Generate PDF
	result, err := s.pdfGenerator.Generate(*courseData)
	if err != nil {
		log.Error("failed to generate PDF", "error", err)
		return s.failExport(ctx, export.ID, fmt.Sprintf("failed to generate PDF: %v", err))
	}

	// Upload and finalize
	return s.uploadAndFinalize(ctx, export, course, result.Data, result.Filename, result.Size, "application/pdf", "PDF")
}

// uploadAndFinalize uploads the export file to storage, marks it complete, and sends notification.
func (s *CourseExportService) uploadAndFinalize(ctx context.Context, export *entity.CourseExport, course *entity.Course, data []byte, filename string, size int64, contentType string, formatDisplay string) error {
	log := s.logger.With("exportID", export.ID, "courseID", export.CourseID)

	// Update progress: 80%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 80, "Uploading export file..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Upload to storage
	storagePath := fmt.Sprintf("tenants/%s/exports/%s/%s",
		export.TenantID.String(),
		export.ID.String(),
		filename,
	)

	if err := s.storage.PutContent(ctx, storagePath, data, contentType); err != nil {
		log.Error("failed to upload export file", "error", err)
		return s.failExport(ctx, export.ID, "failed to upload export file")
	}

	// Update progress: 95%
	if err := s.exportRepo.UpdateProgress(ctx, export.ID, 95, "Finalizing..."); err != nil {
		log.Error("failed to update progress", "error", err)
	}

	// Mark as completed
	if err := s.exportRepo.MarkCompleted(ctx, export.ID, storagePath, size); err != nil {
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

		if err := s.notifier.NotifyExportComplete(ctx, export.CreatedByUserID, export.CourseID, export.ID, course.Title, formatDisplay, downloadURL); err != nil {
			log.Warn("failed to send export completion notification", "error", err)
		}
	}

	log.Info("export completed successfully", "filePath", storagePath, "fileSize", size)
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
	// We call the format-specific method directly since we already have the export
	switch export.Format {
	case valueobject.ExportFormatSCORM2004:
		return s.processSCORM2004Export(tenantCtx, export)
	case valueobject.ExportFormatPDF:
		return s.processPDFExport(tenantCtx, export)
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

// readCourseContent reads course content from MinIO.
func (s *CourseExportService) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	if s.contentStorage == nil {
		return nil, domainerrors.ErrInternal.WithMessage("content storage not configured")
	}

	var content S3CourseContent
	if err := s.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	return &content, nil
}

// BuildCourseDataForTenant builds CourseData for a given tenant and course.
// Used by the share service for PDF exports without an export record.
func (s *CourseExportService) BuildCourseDataForTenant(ctx context.Context, tenantID, courseID uuid.UUID) (*scorm.CourseData, error) {
	course, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil || course == nil {
		return nil, fmt.Errorf("failed to load course")
	}

	content, err := s.readCourseContent(ctx, tenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load course content: %w", err)
	}

	if len(content.Content.Sections) == 0 {
		return nil, fmt.Errorf("course has no outline")
	}

	courseData := scorm.CourseData{
		ID:             courseID.String(),
		Title:          course.Title,
		DesiredOutcome: content.Settings.DesiredOutcome,
		Sections:       make([]scorm.SectionData, 0, len(content.Content.Sections)),
	}

	lessonMap := make(map[string]S3GeneratedLesson)
	for _, lesson := range content.GeneratedLessons {
		lessonMap[lesson.ID] = lesson
	}

	for _, sectionData := range content.Content.Sections {
		sectionID, _ := sectionData["id"].(string)
		sectionTitle, _ := sectionData["title"].(string)

		section := scorm.SectionData{
			ID:    sectionID,
			Title: sectionTitle,
		}

		var lessons []interface{}
		if l, ok := sectionData["lessons"].([]interface{}); ok {
			lessons = l
		}

		for _, lessonDataRaw := range lessons {
			lessonData, ok := lessonDataRaw.(map[string]interface{})
			if !ok {
				continue
			}

			lessonID, _ := lessonData["id"].(string)
			lessonTitle, _ := lessonData["title"].(string)

			genLesson, found := lessonMap[lessonID]
			if !found {
				continue
			}

			lesson := scorm.LessonData{
				ID:    lessonID,
				Title: lessonTitle,
			}

			if genLesson.SegueText != nil {
				lesson.SegueText = *genLesson.SegueText
			}

			for _, comp := range genLesson.Components {
				lesson.Components = append(lesson.Components, scorm.ComponentData{
					Type:        s.mapComponentType(valueobject.LessonComponentType(comp.Type)),
					ContentJSON: string(comp.ContentJSON),
				})
			}

			section.Lessons = append(section.Lessons, lesson)
		}

		courseData.Sections = append(courseData.Sections, section)
	}

	return &courseData, nil
}

// GeneratePDF generates a PDF from CourseData.
// Used by the share service for synchronous PDF exports.
func (s *CourseExportService) GeneratePDF(data scorm.CourseData) (*pdf.Result, error) {
	return s.pdfGenerator.Generate(data)
}
