package generation

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/application/service/content"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// JobRepository defines the interface for job persistence operations.
type JobRepository interface {
	repository.GenerationJobRepository
}

// JobEventPublisher publishes real-time job events via pub/sub.
type JobEventPublisher interface {
	PublishJobEvent(ctx context.Context, userID uuid.UUID, eventType string, job *entity.GenerationJob) error
}

// Logger defines the logging interface used by handlers.
type Logger interface {
	service.Logger
}

// FailJob marks a job as failed with an error message.
func FailJob(ctx context.Context, jobRepo JobRepository, publisher JobEventPublisher, logger Logger, job *entity.GenerationJob, errMsg string) error {
	logger.Error("JOB FAILED",
		"jobID", job.ID,
		"jobType", job.Type,
		"courseID", job.CourseID,
		"parentJobID", job.ParentJobID,
		"resultPath", job.ResultPath,
		"errorMessage", errMsg,
	)

	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now
	_ = jobRepo.Update(ctx, job)
	PublishJobEvent(ctx, publisher, "failed", job)
	return fmt.Errorf("%s", errMsg)
}

// PublishJobEvent publishes a job event if publisher is available.
func PublishJobEvent(ctx context.Context, publisher JobEventPublisher, eventType string, job *entity.GenerationJob) {
	if publisher == nil {
		return
	}
	_ = publisher.PublishJobEvent(ctx, job.CreatedByUserID, eventType, job)
}

// CheckJobCancelled checks if a job has been cancelled.
func CheckJobCancelled(ctx context.Context, jobRepo JobRepository, jobID uuid.UUID) bool {
	select {
	case <-ctx.Done():
		return true
	default:
	}

	currentJob, err := jobRepo.GetByID(ctx, jobID)
	if err != nil {
		return false
	}
	return currentJob.Status == valueobject.GenerationJobStatusCancelled
}

// BuildConstraintRetryContext appends violation feedback to the additional context
// to help the AI correct its output on retry.
func BuildConstraintRetryContext(
	existingContext string,
	violations []valueobject.ConstraintViolation,
	constraints *service.CourseConstraintsInput,
) string {
	var sb strings.Builder

	if existingContext != "" {
		sb.WriteString(existingContext)
		sb.WriteString("\n\n")
	}

	sb.WriteString("**IMPORTANT CORRECTION REQUIRED**\n")
	sb.WriteString("Your previous response violated the mandatory constraints. Please correct:\n\n")

	for _, v := range violations {
		sb.WriteString(fmt.Sprintf("- %s: You provided %s, but must be %s\n", v.Field, v.Actual, v.Expected))
	}

	sb.WriteString("\n**Reminder of constraints:**\n")
	if constraints != nil {
		sb.WriteString(fmt.Sprintf("- Sections: %d to %d\n", constraints.MinSections, constraints.MaxSections))
		sb.WriteString(fmt.Sprintf("- Lessons per section: %d to %d\n", constraints.MinLessonsPerSection, constraints.MaxLessonsPerSection))
		sb.WriteString(fmt.Sprintf("- Total lessons: %d to %d\n", constraints.MinTotalLessons, constraints.MaxTotalLessons))
	}

	sb.WriteString("\nPlease regenerate the outline within these bounds.")
	return sb.String()
}

// ExtractPersonas extracts SME and audience persona inputs from wizard data.
func ExtractPersonas(wizardData *content.WizardData) (smeKnowledge []service.SMEKnowledgeInput, targetAudience service.TargetAudienceInput) {
	if wizardData == nil {
		return nil, service.TargetAudienceInput{}
	}

	// Convert selected SME personas to AI input format
	selectedSMESet := make(map[string]bool)
	for _, id := range wizardData.SelectedSMEIDs {
		selectedSMESet[id] = true
	}
	for _, sme := range wizardData.SMEPersonas {
		if selectedSMESet[sme.ID] {
			smeKnowledge = append(smeKnowledge, service.SMEKnowledgeInput{
				SMEName:  sme.JobTitle,
				Domain:   strings.Join(sme.Skills, ", "),
				Summary:  fmt.Sprintf("%s. Voice: %s", sme.Description, sme.Voice),
				Keywords: sme.Skills,
			})
		}
	}

	// Convert selected audience personas to AI input format
	selectedAudienceSet := make(map[string]bool)
	for _, id := range wizardData.SelectedAudienceIDs {
		selectedAudienceSet[id] = true
	}
	var roles []string
	var goals []string
	var backgrounds []string
	for _, aud := range wizardData.AudiencePersonas {
		if selectedAudienceSet[aud.ID] {
			roles = append(roles, aud.Role)
			goals = append(goals, aud.Goals...)
			backgrounds = append(backgrounds, fmt.Sprintf("%s: %s", aud.Name, aud.Description))
		}
	}
	if len(roles) > 0 {
		targetAudience = service.TargetAudienceInput{
			Role:              strings.Join(roles, ", "),
			LearningGoals:     goals,
			TypicalBackground: strings.Join(backgrounds, "; "),
		}
	}

	return smeKnowledge, targetAudience
}

// GetSelectedDocIDs extracts selected document IDs from wizard data.
func GetSelectedDocIDs(wizardData *content.WizardData) []string {
	if wizardData == nil {
		return nil
	}
	var selectedDocIDs []string
	selectedDocIDs = append(selectedDocIDs, wizardData.SelectedTeamDocIDs...)
	selectedDocIDs = append(selectedDocIDs, wizardData.SelectedGlobalDocIDs...)
	return selectedDocIDs
}
