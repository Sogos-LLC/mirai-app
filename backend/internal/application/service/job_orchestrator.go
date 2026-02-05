package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// publishJobEvent publishes a job event for real-time streaming.
func (s *AIGenerationService) publishJobEvent(ctx context.Context, eventType string, job *entity.GenerationJob) {
	if s.jobEventPublisher == nil {
		return
	}
	_ = s.jobEventPublisher.PublishJobEvent(ctx, job.CreatedByUserID, eventType, job)
}

// failJob marks a job as failed and publishes the event.
func (s *AIGenerationService) failJob(ctx context.Context, job *entity.GenerationJob, errMsg string) error {
	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now

	if err := s.jobRepo.Update(ctx, job); err != nil {
		s.logger.Error("failed to update job to failed", "jobID", job.ID, "error", err)
		return err
	}

	s.publishJobEvent(ctx, "failed", job)
	return nil
}

// ---------------------------------------------------------------------------
// Unified Course Creation (Phase 7)
// ---------------------------------------------------------------------------

// StartCourseCreationRequest contains the inputs for starting unified course creation.
type StartCourseCreationRequest struct {
	CourseID             uuid.UUID
	CourseName           string
	DesiredOutcomes      string
	AdditionalContext    string
	InternalDataOnly     bool
	SelectedTeamDocIDs   []string
	SelectedGlobalDocIDs []string
}

// StartCourseCreationResult contains the created job.
type StartCourseCreationResult struct {
	Job *entity.GenerationJob
}

// StartCourseCreation creates a course_creation job and starts the unified Python workflow.
func (s *AIGenerationService) StartCourseCreation(ctx context.Context, kratosID uuid.UUID, req StartCourseCreationRequest) (*StartCourseCreationResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseID", req.CourseID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Create the job
	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        *user.TenantID,
		Type:            valueobject.GenerationJobTypeCourseCreation,
		Status:          valueobject.GenerationJobStatusQueued,
		CourseID:        &req.CourseID,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: user.ID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create course creation job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	s.publishJobEvent(ctx, "created", job)
	log.Info("course creation job created", "jobID", job.ID)

	// Build RAG filters
	ragFilters := map[string]string{}
	if len(req.SelectedTeamDocIDs) > 0 || len(req.SelectedGlobalDocIDs) > 0 {
		ragFilters["course_id"] = req.CourseID.String()
		ragFilters["tenant_id"] = user.TenantID.String()
	}

	// Start the Python CourseCreationWorkflow
	if s.workflowStarter != nil {
		input := CourseCreationInput{
			JobID:                job.ID.String(),
			TenantID:             user.TenantID.String(),
			CourseID:             req.CourseID.String(),
			UserID:               user.ID.String(),
			CourseName:           req.CourseName,
			DesiredOutcomes:      req.DesiredOutcomes,
			AdditionalContext:    req.AdditionalContext,
			InternalDataOnly:     req.InternalDataOnly,
			SelectedTeamDocIDs:   req.SelectedTeamDocIDs,
			SelectedGlobalDocIDs: req.SelectedGlobalDocIDs,
			RAGFilters:           ragFilters,
		}

		if _, err := s.workflowStarter.StartCourseCreation(ctx, input); err != nil {
			log.Error("failed to start course creation workflow", "error", err)
			_ = s.failJob(ctx, job, fmt.Sprintf("failed to start workflow: %v", err))
			return nil, domainerrors.ErrInternal.WithMessage("failed to start course creation workflow")
		}
	}

	return &StartCourseCreationResult{Job: job}, nil
}

// StepApproval is the signal payload for approving/rejecting a workflow step.
type StepApproval struct {
	Step          string            `json:"step"`
	Approved      bool              `json:"approved"`
	Feedback      string            `json:"feedback"`
	SelectedIDs   []string          `json:"selected_ids"`
	Modifications map[string]string `json:"modifications"`
}

// ApproveWorkflowStep sends an approval signal to a running course creation workflow.
func (s *AIGenerationService) ApproveWorkflowStep(ctx context.Context, kratosID uuid.UUID, jobID uuid.UUID, step string, selectedIDs []string, modifications map[string]string) error {
	log := s.logger.With("kratosID", kratosID, "jobID", jobID, "step", step)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	workflowID := fmt.Sprintf("course-creation-%s", jobID.String())
	approval := StepApproval{
		Step:          step,
		Approved:      true,
		SelectedIDs:   selectedIDs,
		Modifications: modifications,
	}

	if err := s.workflowStarter.SignalWorkflow(ctx, workflowID, "approve_step", approval); err != nil {
		log.Error("failed to signal workflow approval", "error", err)
		return domainerrors.ErrInternal.WithMessage("failed to approve workflow step")
	}

	log.Info("workflow step approved")
	return nil
}

// RejectWorkflowStep sends a rejection signal to a running course creation workflow.
func (s *AIGenerationService) RejectWorkflowStep(ctx context.Context, kratosID uuid.UUID, jobID uuid.UUID, step string, feedback string) error {
	log := s.logger.With("kratosID", kratosID, "jobID", jobID, "step", step)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	workflowID := fmt.Sprintf("course-creation-%s", jobID.String())
	rejection := StepApproval{
		Step:     step,
		Approved: false,
		Feedback: feedback,
	}

	if err := s.workflowStarter.SignalWorkflow(ctx, workflowID, "reject_step", rejection); err != nil {
		log.Error("failed to signal workflow rejection", "error", err)
		return domainerrors.ErrInternal.WithMessage("failed to reject workflow step")
	}

	log.Info("workflow step rejected")
	return nil
}
