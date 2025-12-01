package service

import (
	"context"
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

// ListSMEs retrieves all SMEs accessible to the user.
func (s *SMEService) ListSMEs(ctx context.Context, kratosID uuid.UUID) ([]*entity.SubjectMatterExpert, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.CompanyID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	opts := entity.SMEListOptions{}
	smes, err := s.smeRepo.List(ctx, opts)
	if err != nil {
		s.logger.Error("failed to list SMEs", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Filter by access
	accessible := make([]*entity.SubjectMatterExpert, 0, len(smes))
	for _, sme := range smes {
		if s.userHasSMEAccess(ctx, user, sme) {
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

	submission := &entity.SMETaskSubmission{
		TenantID:          *user.TenantID,
		TaskID:            req.TaskID,
		SubmittedByUserID: user.ID,
		FileName:          req.FileName,
		FilePath:          req.FilePath,
		ContentType:       req.ContentType,
		FileSizeBytes:     req.FileSizeBytes,
	}

	if err := s.submissionRepo.Create(ctx, submission); err != nil {
		log.Error("failed to create submission", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Update task status
	task.Status = valueobject.SMETaskStatusSubmitted
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Error("failed to update task status", "error", err)
	}

	log.Info("content submitted", "submissionID", submission.ID)
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
