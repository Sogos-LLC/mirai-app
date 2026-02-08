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

// failJob marks a job as failed.
func (s *AIGenerationService) failJob(ctx context.Context, job *entity.GenerationJob, errMsg string) error {
	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now

	if err := s.jobRepo.Update(ctx, job); err != nil {
		s.logger.Error("failed to update job to failed", "jobID", job.ID, "error", err)
		return err
	}

	return nil
}

// ---------------------------------------------------------------------------
// Unified Course Creation (Phase 7)
// ---------------------------------------------------------------------------

// StartCourseCreationRequest contains the inputs for starting unified course creation.
type StartCourseCreationRequest struct {
	CourseID               uuid.UUID
	Topic                  string
	Audience               string
	UseContext             string
	EnableInternalKnowledge bool
	SelectedTeamDocIDs     []string
	SelectedGlobalDocIDs   []string
	EnableWebResearch      bool
	StrictKnowledgeOnly    bool

	// Wizard-generated data
	DesiredOutcomes     string
	ImprovedTitle       string
	Description         string
	SMEPersonas         []entity.WizardSMEPersona
	SelectedSMEIDs      []string
	AudiencePersonas    []entity.WizardAudiencePersona
	SelectedAudienceIDs []string
	SelectedTone        *entity.WizardToneOption
	AdditionalContext   string
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

	log.Info("course creation job created", "jobID", job.ID)

	// Start the Python CourseCreationWorkflow
	if s.workflowStarter != nil {
		// Ensure non-nil slices/maps — Go nil serializes as JSON null,
		// which Python's Temporal SDK rejects for list[str] / dict[str,str].
		teamDocIDs := req.SelectedTeamDocIDs
		if teamDocIDs == nil {
			teamDocIDs = []string{}
		}
		globalDocIDs := req.SelectedGlobalDocIDs
		if globalDocIDs == nil {
			globalDocIDs = []string{}
		}

		input := CourseCreationInput{
			JobID:                   job.ID.String(),
			TenantID:                user.TenantID.String(),
			CourseID:                req.CourseID.String(),
			UserID:                  user.ID.String(),
			Topic:                   req.Topic,
			Audience:                req.Audience,
			UseContext:              req.UseContext,
			EnableInternalKnowledge: req.EnableInternalKnowledge,
			SelectedTeamDocIDs:      teamDocIDs,
			SelectedGlobalDocIDs:    globalDocIDs,
			EnableWebResearch:       req.EnableWebResearch,
			StrictKnowledgeOnly:     req.StrictKnowledgeOnly,
			DesiredOutcomes:         req.DesiredOutcomes,
			ImprovedTitle:           req.ImprovedTitle,
			Description:             req.Description,
			SMEPersonas:             req.SMEPersonas,
			SelectedSMEIDs:          req.SelectedSMEIDs,
			AudiencePersonas:        req.AudiencePersonas,
			SelectedAudienceIDs:     req.SelectedAudienceIDs,
			SelectedTone:            req.SelectedTone,
			AdditionalContext:       req.AdditionalContext,
		}

		if _, err := s.workflowStarter.StartCourseCreation(ctx, input); err != nil {
			log.Error("failed to start course creation workflow", "error", err)
			_ = s.failJob(ctx, job, fmt.Sprintf("failed to start workflow: %v", err))
			return nil, domainerrors.ErrInternal.WithMessage("failed to start course creation workflow")
		}
	}

	return &StartCourseCreationResult{Job: job}, nil
}

// StepApproval is the update payload for approving/rejecting a workflow step.
type StepApproval struct {
	Step          string            `json:"step"`
	Approved      bool              `json:"approved"`
	Feedback      string            `json:"feedback"`
	SelectedIDs   []string          `json:"selected_ids"`
	Modifications map[string]string `json:"modifications"`
}

// ApproveWorkflowStep sends an approval update to a running course creation workflow.
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

	if err := s.workflowStarter.UpdateWorkflow(ctx, workflowID, "approve_step", approval); err != nil {
		log.Error("failed to send workflow approval update", "error", err)
		return domainerrors.ErrInternal.WithMessage("failed to approve workflow step")
	}

	log.Info("workflow step approved")
	return nil
}

// RejectWorkflowStep sends a rejection update to a running course creation workflow.
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

	if err := s.workflowStarter.UpdateWorkflow(ctx, workflowID, "reject_step", rejection); err != nil {
		log.Error("failed to send workflow rejection update", "error", err)
		return domainerrors.ErrInternal.WithMessage("failed to reject workflow step")
	}

	log.Info("workflow step rejected")
	return nil
}

// WorkflowState represents the current state of a course creation workflow.
type WorkflowState struct {
	Status          string
	CurrentStep     string
	StepDataJSON    string
	ProgressPercent int32
	ProgressMessage string
}

// GetWorkflowState queries the Temporal workflow for its current state.
// Falls back to the DB job record if the workflow is not running.
func (s *AIGenerationService) GetWorkflowState(ctx context.Context, kratosID uuid.UUID, jobID uuid.UUID) (*WorkflowState, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	workflowID := fmt.Sprintf("course-creation-%s", jobID.String())

	// Try to query the Temporal workflow
	result, err := s.workflowStarter.QueryWorkflow(ctx, workflowID, "get_state")
	if err == nil && result != nil {
		state := &WorkflowState{}

		if v, ok := result["status"].(string); ok {
			state.Status = v
		}
		if v, ok := result["current_step"].(string); ok {
			state.CurrentStep = v
		}
		if v, ok := result["step_data_json"].(string); ok {
			state.StepDataJSON = v
		}
		if v, ok := result["progress_percent"].(float64); ok {
			state.ProgressPercent = int32(v)
		}
		if v, ok := result["progress_message"].(string); ok {
			state.ProgressMessage = v
		}

		// Temporal serves queries on closed workflows too, returning stale state.
		// If the query says "processing" but the workflow is no longer running,
		// treat it as stale and fall through to DB-based detection.
		if state.Status == "processing" || state.Status == "awaiting_approval" {
			running, descErr := s.workflowStarter.IsWorkflowRunning(ctx, workflowID)
			if descErr == nil && !running {
				// Workflow is closed — fall through to DB stale detection
			} else {
				return state, nil
			}
		} else {
			return state, nil
		}
	}

	// Fallback: read from DB job record
	job, err := s.jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// If Temporal workflow is gone but DB says job is still active,
	// the workflow has expired. Mark it as failed.
	if job.Status == valueobject.GenerationJobStatusProcessing ||
		job.Status == valueobject.GenerationJobStatusAwaitingApproval {
		errMsg := "Workflow expired — the AI generation process is no longer running. Please start a new course."
		_ = s.failJob(ctx, job, errMsg)
		return &WorkflowState{
			Status:          "failed",
			ProgressMessage: errMsg,
		}, nil
	}

	state := &WorkflowState{
		ProgressPercent: job.ProgressPercent,
	}
	if job.ProgressMessage != nil {
		state.ProgressMessage = *job.ProgressMessage
	}

	switch job.Status {
	case valueobject.GenerationJobStatusCompleted:
		state.Status = "completed"
	case valueobject.GenerationJobStatusFailed:
		state.Status = "failed"
	default:
		state.Status = "processing"
	}

	return state, nil
}
