package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TenantStorageAdapter interface for storage operations.
type TenantStorageAdapter interface {
	GenerateUploadURL(ctx context.Context, tenantID uuid.UUID, subpath string, expiry time.Duration) (string, error)
}

// TaskNotifier interface for sending notifications about task events.
type TaskNotifier interface {
	CreateNotification(ctx context.Context, req CreateNotificationRequest) (*entity.Notification, error)
	// NotifyTaskAssigned sends both in-app notification and email when a task is assigned.
	NotifyTaskAssigned(ctx context.Context, req NotifyTaskAssignedRequest) error
}

// NotifyTaskAssignedRequest contains parameters for task assignment notification.
type NotifyTaskAssignedRequest struct {
	AssigneeUserID uuid.UUID
	AssignerUserID uuid.UUID
	TaskID         uuid.UUID
	TaskTitle      string
	SMEID          uuid.UUID
	SMEName        string
	DueDate        *time.Time
}

// ContentEnhancer interface for AI content enhancement operations.
type ContentEnhancer interface {
	SummarizeContent(ctx context.Context, content string) (string, error)
	ImproveContent(ctx context.Context, content string) (string, error)
}

// SMEService handles Subject Matter Expert related business logic.
type SMEService struct {
	userRepo       repository.UserRepository
	companyRepo    repository.CompanyRepository
	teamRepo       repository.TeamRepository
	smeRepo        repository.SMERepository
	taskRepo       repository.SMETaskRepository
	submissionRepo repository.SMESubmissionRepository
	knowledgeRepo  repository.SMEKnowledgeRepository
	storage        TenantStorageAdapter
	notifier       TaskNotifier
	enhancer       ContentEnhancer
	logger         service.Logger
}

// NewSMEService creates a new SME service.
func NewSMEService(
	userRepo repository.UserRepository,
	companyRepo repository.CompanyRepository,
	teamRepo repository.TeamRepository,
	smeRepo repository.SMERepository,
	taskRepo repository.SMETaskRepository,
	submissionRepo repository.SMESubmissionRepository,
	knowledgeRepo repository.SMEKnowledgeRepository,
	storage TenantStorageAdapter,
	notifier TaskNotifier,
	enhancer ContentEnhancer,
	logger service.Logger,
) *SMEService {
	return &SMEService{
		userRepo:       userRepo,
		companyRepo:    companyRepo,
		teamRepo:       teamRepo,
		smeRepo:        smeRepo,
		taskRepo:       taskRepo,
		submissionRepo: submissionRepo,
		knowledgeRepo:  knowledgeRepo,
		storage:        storage,
		notifier:       notifier,
		enhancer:       enhancer,
		logger:         logger,
	}
}

// CreateSMERequest contains the parameters for creating an SME.
type CreateSMERequest struct {
	Name        string
	Description string
	Domain      string
	Scope       valueobject.SMEScope
	TeamIDs     []uuid.UUID
}

// CreateSME creates a new Subject Matter Expert entity.
func (s *SMEService) CreateSME(ctx context.Context, kratosID uuid.UUID, req CreateSMERequest) (*entity.SubjectMatterExpert, error) {
	log := s.logger.With("kratosID", kratosID, "smeName", req.Name)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to create SME")
	}

	if user.TenantID == nil || user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	sme := &entity.SubjectMatterExpert{
		TenantID:        *user.TenantID,
		CompanyID:       *user.CompanyID,
		Name:            req.Name,
		Description:     req.Description,
		Domain:          req.Domain,
		Scope:           req.Scope,
		Status:          valueobject.SMEStatusDraft,
		CreatedByUserID: user.ID,
	}

	if err := s.smeRepo.Create(ctx, sme); err != nil {
		log.Error("failed to create SME", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Create team access entries if team-scoped
	if req.Scope == valueobject.SMEScopeTeam && len(req.TeamIDs) > 0 {
		for _, teamID := range req.TeamIDs {
			access := &entity.SMETeamAccess{
				TenantID: *user.TenantID,
				SMEID:    sme.ID,
				TeamID:   teamID,
			}
			if err := s.smeRepo.AddTeamAccess(ctx, access); err != nil {
				log.Error("failed to add team access", "teamID", teamID, "error", err)
				// Continue with other teams
			}
		}
	}

	log.Info("SME created", "smeID", sme.ID)
	return sme, nil
}

// GetSME retrieves an SME by ID.
func (s *SMEService) GetSME(ctx context.Context, kratosID uuid.UUID, smeID uuid.UUID) (*entity.SubjectMatterExpert, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	sme, err := s.smeRepo.GetByID(ctx, smeID)
	if err != nil || sme == nil {
		return nil, domainerrors.ErrSMENotFound
	}

	// Verify access
	if !s.userHasSMEAccess(ctx, user, sme) {
		return nil, domainerrors.ErrSMENoAccess
	}

	return sme, nil
}

// ListSMEsOptions contains options for listing SMEs.
type ListSMEsOptions struct {
	IncludeArchived bool
}

// ListSMEs retrieves all SMEs accessible to the user.
func (s *SMEService) ListSMEs(ctx context.Context, kratosID uuid.UUID, opts *ListSMEsOptions) ([]*entity.SubjectMatterExpert, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	listOpts := entity.SMEListOptions{}
	if opts != nil {
		listOpts.IncludeArchived = opts.IncludeArchived
	}
	smes, err := s.smeRepo.List(ctx, listOpts)
	if err != nil {
		s.logger.Error("failed to list SMEs", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Filter by access and archived status
	accessible := make([]*entity.SubjectMatterExpert, 0, len(smes))
	for _, sme := range smes {
		if s.userHasSMEAccess(ctx, user, sme) {
			// Filter out archived unless requested
			if sme.Status == valueobject.SMEStatusArchived && (opts == nil || !opts.IncludeArchived) {
				continue
			}
			accessible = append(accessible, sme)
		}
	}

	return accessible, nil
}

// UpdateSMERequest contains the parameters for updating an SME.
type UpdateSMERequest struct {
	Name        *string
	Description *string
	Domain      *string
	Scope       *valueobject.SMEScope
	TeamIDs     []uuid.UUID
}

// UpdateSME updates an SME entity.
func (s *SMEService) UpdateSME(ctx context.Context, kratosID uuid.UUID, smeID uuid.UUID, req UpdateSMERequest) (*entity.SubjectMatterExpert, error) {
	log := s.logger.With("kratosID", kratosID, "smeID", smeID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to update SME")
	}

	sme, err := s.smeRepo.GetByID(ctx, smeID)
	if err != nil || sme == nil {
		return nil, domainerrors.ErrSMENotFound
	}

	// Apply updates
	if req.Name != nil {
		sme.Name = *req.Name
	}
	if req.Description != nil {
		sme.Description = *req.Description
	}
	if req.Domain != nil {
		sme.Domain = *req.Domain
	}
	if req.Scope != nil {
		sme.Scope = *req.Scope
	}

	if err := s.smeRepo.Update(ctx, sme); err != nil {
		log.Error("failed to update SME", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("SME updated")
	return sme, nil
}

// DeleteSME deletes an SME entity.
func (s *SMEService) DeleteSME(ctx context.Context, kratosID uuid.UUID, smeID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "smeID", smeID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return domainerrors.ErrForbidden.WithMessage("insufficient permissions to delete SME")
	}

	sme, err := s.smeRepo.GetByID(ctx, smeID)
	if err != nil || sme == nil {
		return domainerrors.ErrSMENotFound
	}

	// Archive instead of hard delete
	sme.Status = valueobject.SMEStatusArchived
	if err := s.smeRepo.Update(ctx, sme); err != nil {
		log.Error("failed to archive SME", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("SME archived")
	return nil
}

// RestoreSME restores an archived SME entity.
func (s *SMEService) RestoreSME(ctx context.Context, kratosID uuid.UUID, smeID uuid.UUID) (*entity.SubjectMatterExpert, error) {
	log := s.logger.With("kratosID", kratosID, "smeID", smeID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to restore SME")
	}

	sme, err := s.smeRepo.GetByID(ctx, smeID)
	if err != nil || sme == nil {
		return nil, domainerrors.ErrSMENotFound
	}

	if sme.Status != valueobject.SMEStatusArchived {
		return nil, domainerrors.ErrBadRequest.WithMessage("SME is not archived")
	}

	// Restore to Draft status
	sme.Status = valueobject.SMEStatusDraft
	if err := s.smeRepo.Update(ctx, sme); err != nil {
		log.Error("failed to restore SME", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("SME restored")
	return sme, nil
}

// CreateTaskRequest contains the parameters for creating a task.
type CreateTaskRequest struct {
	SMEID               uuid.UUID
	Title               string
	Description         string
	ExpectedContentType *valueobject.ContentType
	DueDate             *time.Time
	AssignedToUserID    uuid.UUID
	TeamID              *uuid.UUID
}

// CreateTask creates a delegated task for content submission.
func (s *SMEService) CreateTask(ctx context.Context, kratosID uuid.UUID, req CreateTaskRequest) (*entity.SMETask, error) {
	log := s.logger.With("kratosID", kratosID, "smeID", req.SMEID, "title", req.Title)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to create tasks")
	}

	sme, err := s.smeRepo.GetByID(ctx, req.SMEID)
	if err != nil || sme == nil {
		return nil, domainerrors.ErrSMENotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	task := &entity.SMETask{
		TenantID:            *user.TenantID,
		SMEID:               req.SMEID,
		Title:               req.Title,
		Description:         req.Description,
		ExpectedContentType: req.ExpectedContentType,
		Status:              valueobject.SMETaskStatusPending,
		DueDate:             req.DueDate,
		AssignedToUserID:    req.AssignedToUserID,
		AssignedByUserID:    user.ID,
		TeamID:              req.TeamID,
	}

	if err := s.taskRepo.Create(ctx, task); err != nil {
		log.Error("failed to create task", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Send notification and email to assigned user
	if s.notifier != nil {
		err := s.notifier.NotifyTaskAssigned(ctx, NotifyTaskAssignedRequest{
			AssigneeUserID: task.AssignedToUserID,
			AssignerUserID: user.ID,
			TaskID:         task.ID,
			TaskTitle:      task.Title,
			SMEID:          task.SMEID,
			SMEName:        sme.Name,
			DueDate:        task.DueDate,
		})
		if err != nil {
			log.Error("failed to send task notification", "error", err)
			// Don't fail the task creation if notification fails
		}
	}

	log.Info("task created", "taskID", task.ID)
	return task, nil
}

// GetTask retrieves a task by ID.
func (s *SMEService) GetTask(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID) (*entity.SMETask, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil || task == nil {
		return nil, domainerrors.ErrSMETaskNotFound
	}

	return task, nil
}

// ListTasks retrieves tasks based on filters.
func (s *SMEService) ListTasks(ctx context.Context, kratosID uuid.UUID, smeID *uuid.UUID, assignedToUserID *uuid.UUID) ([]*entity.SMETask, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	opts := entity.SMETaskListOptions{
		SMEID:            smeID,
		AssignedToUserID: assignedToUserID,
	}

	tasks, err := s.taskRepo.List(ctx, opts)
	if err != nil {
		s.logger.Error("failed to list tasks", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return tasks, nil
}

// CancelTask cancels a pending task.
func (s *SMEService) CancelTask(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "taskID", taskID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil || task == nil {
		return domainerrors.ErrSMETaskNotFound
	}

	if task.Status != valueobject.SMETaskStatusPending {
		return domainerrors.ErrInvalidInput.WithMessage("only pending tasks can be cancelled")
	}

	task.Status = valueobject.SMETaskStatusCancelled
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to cancel task", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("task cancelled")
	return nil
}

// GetUploadURL returns a presigned URL for content upload.
func (s *SMEService) GetUploadURL(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID, filename string, contentType valueobject.ContentType) (string, string, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return "", "", domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil || task == nil {
		return "", "", domainerrors.ErrSMETaskNotFound
	}

	if user.TenantID == nil {
		return "", "", domainerrors.ErrUserHasNoCompany
	}

	// Generate S3 path: tenants/{tenant_id}/sme/{sme_id}/submissions/{task_id}/{filename}
	path := "sme/" + task.SMEID.String() + "/submissions/" + task.ID.String() + "/" + filename
	url, err := s.storage.GenerateUploadURL(ctx, *user.TenantID, path, 15*time.Minute)
	if err != nil {
		s.logger.Error("failed to generate upload URL", "error", err)
		return "", "", domainerrors.ErrInternal.WithCause(err)
	}

	return url, path, nil
}

// SubmitContentRequest contains the parameters for submitting content.
type SubmitContentRequest struct {
	TaskID        uuid.UUID
	FileName      string
	FilePath      string
	ContentType   valueobject.ContentType
	FileSizeBytes int64
	TextContent   *string // For CONTENT_TYPE_TEXT submissions
}

// SubmitContent records a content submission for a task.
func (s *SMEService) SubmitContent(ctx context.Context, kratosID uuid.UUID, req SubmitContentRequest) (*entity.SMETaskSubmission, error) {
	log := s.logger.With("kratosID", kratosID, "taskID", req.TaskID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, req.TaskID)
	if err != nil || task == nil {
		return nil, domainerrors.ErrSMETaskNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Validate text submissions
	if req.ContentType == valueobject.ContentTypeText {
		if req.TextContent == nil || *req.TextContent == "" {
			return nil, domainerrors.ErrInvalidInput.WithMessage("text_content is required for text submissions")
		}
	}

	submission := &entity.SMETaskSubmission{
		TenantID:          *user.TenantID,
		TaskID:            req.TaskID,
		SubmittedByUserID: user.ID,
		FileName:          req.FileName,
		FilePath:          req.FilePath,
		ContentType:       req.ContentType,
		FileSizeBytes:     req.FileSizeBytes,
	}

	// For text submissions, set ExtractedText directly (no file to process)
	if req.ContentType == valueobject.ContentTypeText && req.TextContent != nil {
		submission.ExtractedText = req.TextContent
		submission.FileSizeBytes = int64(len(*req.TextContent))
		if req.FileName == "" {
			submission.FileName = "text-submission.txt"
		}
	}

	if err := s.submissionRepo.Create(ctx, submission); err != nil {
		log.Error("failed to create submission", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update task status to awaiting review (human approval required)
	task.Status = valueobject.SMETaskStatusAwaitingReview
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to update task status", "error", err)
	}

	// Notify the assigner that content has been submitted
	if s.notifier != nil {
		actionURL := "/smes?sme=" + task.SMEID.String() + "&task=" + task.ID.String()
		_, err := s.notifier.CreateNotification(ctx, CreateNotificationRequest{
			UserID:    task.AssignedByUserID,
			Type:      valueobject.NotificationTypeSubmissionReadyForReview,
			Priority:  valueobject.NotificationPriorityNormal,
			Title:     "Submission ready for review",
			Message:   "Content has been submitted for \"" + task.Title + "\" and is ready for your review.",
			ActionURL: &actionURL,
		})
		if err != nil {
			log.Error("failed to notify assigner", "error", err)
		}
	}

	log.Info("content submitted", "submissionID", submission.ID, "contentType", req.ContentType)
	return submission, nil
}

// ListSubmissions retrieves all submissions for a task.
func (s *SMEService) ListSubmissions(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID) ([]*entity.SMETaskSubmission, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	submissions, err := s.submissionRepo.ListByTaskID(ctx, taskID)
	if err != nil {
		s.logger.Error("failed to list submissions", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return submissions, nil
}

// GetKnowledge retrieves distilled knowledge for an SME.
func (s *SMEService) GetKnowledge(ctx context.Context, kratosID uuid.UUID, smeID uuid.UUID) ([]*entity.SMEKnowledgeChunk, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	sme, err := s.smeRepo.GetByID(ctx, smeID)
	if err != nil || sme == nil {
		return nil, domainerrors.ErrSMENotFound
	}

	if !s.userHasSMEAccess(ctx, user, sme) {
		return nil, domainerrors.ErrSMENoAccess
	}

	chunks, err := s.knowledgeRepo.ListBySMEID(ctx, smeID)
	if err != nil {
		s.logger.Error("failed to get knowledge", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return chunks, nil
}

// userHasSMEAccess checks if a user has access to an SME.
func (s *SMEService) userHasSMEAccess(ctx context.Context, user *entity.User, sme *entity.SubjectMatterExpert) bool {
	// Admins have access to all
	if user.IsAdmin() {
		return true
	}

	// Check company match
	if user.CompanyID == nil || sme.CompanyID != *user.CompanyID {
		return false
	}

	// Global SMEs are accessible to all company members
	if sme.Scope == valueobject.SMEScopeGlobal {
		return true
	}

	// For team-scoped, check team membership
	// TODO: Implement team membership check
	return true
}

// GetSubmission retrieves a submission by ID.
func (s *SMEService) GetSubmission(ctx context.Context, kratosID uuid.UUID, submissionID uuid.UUID) (*entity.SMETaskSubmission, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	submission, err := s.submissionRepo.GetByID(ctx, submissionID)
	if err != nil || submission == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("submission not found")
	}

	return submission, nil
}

// ApproveSubmissionRequest contains the parameters for approving a submission.
type ApproveSubmissionRequest struct {
	SubmissionID    uuid.UUID
	ApprovedContent string
}

// ApproveSubmission approves content and creates knowledge chunks.
func (s *SMEService) ApproveSubmission(ctx context.Context, kratosID uuid.UUID, req ApproveSubmissionRequest) (*entity.SMETaskSubmission, []*entity.SMEKnowledgeChunk, error) {
	log := s.logger.With("kratosID", kratosID, "submissionID", req.SubmissionID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, nil, domainerrors.ErrUserNotFound
	}

	submission, err := s.submissionRepo.GetByID(ctx, req.SubmissionID)
	if err != nil || submission == nil {
		return nil, nil, domainerrors.ErrNotFound.WithMessage("submission not found")
	}

	task, err := s.taskRepo.GetByID(ctx, submission.TaskID)
	if err != nil || task == nil {
		return nil, nil, domainerrors.ErrSMETaskNotFound
	}

	// Verify user is the task assigner
	if task.AssignedByUserID != user.ID && !user.IsAdmin() {
		return nil, nil, domainerrors.ErrForbidden.WithMessage("only the task assigner can approve submissions")
	}

	// Get SME for creating knowledge
	sme, err := s.smeRepo.GetByID(ctx, task.SMEID)
	if err != nil || sme == nil {
		return nil, nil, domainerrors.ErrSMENotFound
	}

	// Update submission with approval info
	now := time.Now()
	submission.ApprovedContent = &req.ApprovedContent
	submission.IsApproved = true
	submission.ApprovedAt = &now
	submission.ApprovedByUserID = &user.ID

	if err := s.submissionRepo.Update(ctx, submission); err != nil {
		log.Error("failed to update submission", "error", err)
		return nil, nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Create knowledge chunk from approved content
	chunk := &entity.SMEKnowledgeChunk{
		TenantID:       submission.TenantID,
		SMEID:          task.SMEID,
		SubmissionID:   &submission.ID,
		Content:        req.ApprovedContent,
		Topic:          task.Title,
		Keywords:       []string{},
		RelevanceScore: 0.8,
	}

	if err := s.knowledgeRepo.Create(ctx, chunk); err != nil {
		log.Error("failed to create knowledge chunk", "error", err)
		return nil, nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update task status to completed
	task.Status = valueobject.SMETaskStatusCompleted
	completedAt := time.Now()
	task.CompletedAt = &completedAt
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to update task status", "error", err)
	}

	// Update SME: set status to active and regenerate knowledge summary
	smeNeedsUpdate := false

	// Update status if it was draft
	if sme.Status == valueobject.SMEStatusDraft {
		sme.Status = valueobject.SMEStatusActive
		smeNeedsUpdate = true
	}

	// Aggregate all knowledge chunks into a summary
	allChunks, err := s.knowledgeRepo.ListBySMEID(ctx, task.SMEID)
	if err != nil {
		log.Error("failed to list knowledge chunks for summary", "error", err)
	} else if len(allChunks) > 0 {
		// Build a knowledge summary from all chunks
		var summaryBuilder strings.Builder
		summaryBuilder.WriteString("This knowledge base contains ")
		summaryBuilder.WriteString(fmt.Sprintf("%d", len(allChunks)))
		summaryBuilder.WriteString(" piece(s) of knowledge:\n\n")
		for i, c := range allChunks {
			if c.Topic != "" {
				summaryBuilder.WriteString(fmt.Sprintf("%d. **%s**: ", i+1, c.Topic))
			} else {
				summaryBuilder.WriteString(fmt.Sprintf("%d. ", i+1))
			}
			// Truncate content for summary if too long
			content := c.Content
			if len(content) > 200 {
				content = content[:200] + "..."
			}
			summaryBuilder.WriteString(content)
			summaryBuilder.WriteString("\n\n")
		}
		summary := summaryBuilder.String()
		sme.KnowledgeSummary = &summary
		smeNeedsUpdate = true
	}

	if smeNeedsUpdate {
		if err := s.smeRepo.Update(ctx, sme); err != nil {
			log.Error("failed to update SME", "error", err)
		}
	}

	// Notify the submitter that their content was approved
	if s.notifier != nil {
		_, err := s.notifier.CreateNotification(ctx, CreateNotificationRequest{
			UserID:   submission.SubmittedByUserID,
			Type:     valueobject.NotificationTypeSubmissionApproved,
			Priority: valueobject.NotificationPriorityNormal,
			Title:    "Your submission was approved",
			Message:  "Your submission for \"" + task.Title + "\" has been approved and added to the SME knowledge base.",
		})
		if err != nil {
			log.Error("failed to notify submitter", "error", err)
		}
	}

	log.Info("submission approved", "chunkID", chunk.ID)
	return submission, []*entity.SMEKnowledgeChunk{chunk}, nil
}

// RequestSubmissionChangesRequest contains the parameters for requesting changes.
type RequestSubmissionChangesRequest struct {
	SubmissionID uuid.UUID
	Feedback     string
}

// RequestSubmissionChanges sends submission back to submitter with feedback.
func (s *SMEService) RequestSubmissionChanges(ctx context.Context, kratosID uuid.UUID, req RequestSubmissionChangesRequest) (*entity.SMETaskSubmission, error) {
	log := s.logger.With("kratosID", kratosID, "submissionID", req.SubmissionID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	submission, err := s.submissionRepo.GetByID(ctx, req.SubmissionID)
	if err != nil || submission == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("submission not found")
	}

	task, err := s.taskRepo.GetByID(ctx, submission.TaskID)
	if err != nil || task == nil {
		return nil, domainerrors.ErrSMETaskNotFound
	}

	// Verify user is the task assigner
	if task.AssignedByUserID != user.ID && !user.IsAdmin() {
		return nil, domainerrors.ErrForbidden.WithMessage("only the task assigner can request changes")
	}

	// Update submission with reviewer notes
	submission.ReviewerNotes = &req.Feedback
	if err := s.submissionRepo.Update(ctx, submission); err != nil {
		log.Error("failed to update submission", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update task status
	task.Status = valueobject.SMETaskStatusChangesRequested
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to update task status", "error", err)
	}

	// Notify the submitter
	if s.notifier != nil {
		actionURL := "/smes?sme=" + task.SMEID.String() + "&task=" + task.ID.String()
		_, err := s.notifier.CreateNotification(ctx, CreateNotificationRequest{
			UserID:    submission.SubmittedByUserID,
			Type:      valueobject.NotificationTypeChangesRequested,
			Priority:  valueobject.NotificationPriorityNormal,
			Title:     "Changes requested",
			Message:   "Changes have been requested for your submission: " + req.Feedback,
			ActionURL: &actionURL,
		})
		if err != nil {
			log.Error("failed to notify submitter", "error", err)
		}
	}

	log.Info("changes requested")
	return submission, nil
}

// UpdateTaskRequest contains the parameters for updating a task.
type UpdateTaskRequest struct {
	Title               *string
	Description         *string
	ExpectedContentType *valueobject.ContentType
	DueDate             *time.Time
}

// UpdateTask updates a task.
func (s *SMEService) UpdateTask(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID, req UpdateTaskRequest) (*entity.SMETask, error) {
	log := s.logger.With("kratosID", kratosID, "taskID", taskID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil || task == nil {
		return nil, domainerrors.ErrSMETaskNotFound
	}

	// Verify user has permission
	if task.AssignedByUserID != user.ID && !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to update task")
	}

	// Apply updates
	if req.Title != nil {
		task.Title = *req.Title
	}
	if req.Description != nil {
		task.Description = *req.Description
	}
	if req.ExpectedContentType != nil {
		task.ExpectedContentType = req.ExpectedContentType
	}
	if req.DueDate != nil {
		task.DueDate = req.DueDate
	}

	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to update task", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("task updated")
	return task, nil
}

// DeleteTask permanently deletes a task.
func (s *SMEService) DeleteTask(ctx context.Context, kratosID uuid.UUID, taskID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "taskID", taskID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	task, err := s.taskRepo.GetByID(ctx, taskID)
	if err != nil || task == nil {
		return domainerrors.ErrSMETaskNotFound
	}

	// Verify user has permission
	if task.AssignedByUserID != user.ID && !user.CanManageSME() {
		return domainerrors.ErrForbidden.WithMessage("insufficient permissions to delete task")
	}

	if err := s.taskRepo.Delete(ctx, taskID); err != nil {
		log.Error("failed to delete task", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("task deleted")
	return nil
}

// UpdateKnowledgeChunkRequest contains the parameters for updating a knowledge chunk.
type UpdateKnowledgeChunkRequest struct {
	ChunkID  uuid.UUID
	Content  string
	Topic    *string
	Keywords []string
}

// UpdateKnowledgeChunk updates a knowledge chunk.
func (s *SMEService) UpdateKnowledgeChunk(ctx context.Context, kratosID uuid.UUID, req UpdateKnowledgeChunkRequest) (*entity.SMEKnowledgeChunk, error) {
	log := s.logger.With("kratosID", kratosID, "chunkID", req.ChunkID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return nil, domainerrors.ErrForbidden.WithMessage("insufficient permissions to update knowledge")
	}

	chunk, err := s.knowledgeRepo.GetByID(ctx, req.ChunkID)
	if err != nil || chunk == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("knowledge chunk not found")
	}

	// Apply updates
	chunk.Content = req.Content
	if req.Topic != nil {
		chunk.Topic = *req.Topic
	}
	if req.Keywords != nil {
		chunk.Keywords = req.Keywords
	}

	if err := s.knowledgeRepo.Update(ctx, chunk); err != nil {
		log.Error("failed to update knowledge chunk", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("knowledge chunk updated")
	return chunk, nil
}

// DeleteKnowledgeChunk deletes a knowledge chunk.
func (s *SMEService) DeleteKnowledgeChunk(ctx context.Context, kratosID uuid.UUID, chunkID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID, "chunkID", chunkID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	if !user.CanManageSME() {
		return domainerrors.ErrForbidden.WithMessage("insufficient permissions to delete knowledge")
	}

	if err := s.knowledgeRepo.Delete(ctx, chunkID); err != nil {
		log.Error("failed to delete knowledge chunk", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("knowledge chunk deleted")
	return nil
}

// EnhanceSubmissionContentRequest contains the parameters for AI enhancement.
type EnhanceSubmissionContentRequest struct {
	SubmissionID uuid.UUID
	EnhanceType  valueobject.EnhanceType // "summarize" or "improve"
}

// EnhanceSubmissionContentResult contains the enhanced content.
type EnhanceSubmissionContentResult struct {
	EnhancedContent string
	OriginalContent string
}

// EnhanceSubmissionContent uses AI to summarize or improve text submission content.
// This is only available for TEXT content type submissions.
func (s *SMEService) EnhanceSubmissionContent(ctx context.Context, kratosID uuid.UUID, req EnhanceSubmissionContentRequest) (*EnhanceSubmissionContentResult, error) {
	log := s.logger.With("kratosID", kratosID, "submissionID", req.SubmissionID, "enhanceType", req.EnhanceType)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	submission, err := s.submissionRepo.GetByID(ctx, req.SubmissionID)
	if err != nil || submission == nil {
		return nil, domainerrors.ErrNotFound.WithMessage("submission not found")
	}

	// Only allow enhancement for TEXT content type
	if submission.ContentType != valueobject.ContentTypeText {
		return nil, domainerrors.ErrInvalidInput.WithMessage("AI enhancement is only available for text submissions")
	}

	// Check that we have text content to enhance
	if submission.ExtractedText == nil || *submission.ExtractedText == "" {
		return nil, domainerrors.ErrInvalidInput.WithMessage("submission has no text content to enhance")
	}

	// Check enhancer is available
	if s.enhancer == nil {
		return nil, domainerrors.ErrInternal.WithMessage("AI enhancement is not configured")
	}

	originalContent := *submission.ExtractedText
	var enhancedContent string

	switch req.EnhanceType {
	case valueobject.EnhanceTypeSummarize:
		enhancedContent, err = s.enhancer.SummarizeContent(ctx, originalContent)
		if err != nil {
			log.Error("failed to summarize content", "error", err)
			return nil, domainerrors.ErrInternal.WithMessage("failed to summarize content")
		}
	case valueobject.EnhanceTypeImprove:
		enhancedContent, err = s.enhancer.ImproveContent(ctx, originalContent)
		if err != nil {
			log.Error("failed to improve content", "error", err)
			return nil, domainerrors.ErrInternal.WithMessage("failed to improve content")
		}
	default:
		return nil, domainerrors.ErrInvalidInput.WithMessage("invalid enhance type")
	}

	log.Info("content enhanced", "enhanceType", req.EnhanceType)
	return &EnhanceSubmissionContentResult{
		EnhancedContent: enhancedContent,
		OriginalContent: originalContent,
	}, nil
}
