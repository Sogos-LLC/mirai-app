package generation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// ComponentHandler processes component regeneration jobs.
type ComponentHandler struct {
	jobRepo           JobRepository
	aiSettingsRepo    AISettingsRepository
	aiProviderFactory AIProviderFactory
	contentStorage    ContentStorage
	jobEventPublisher JobEventPublisher
	logger            Logger
}

// NewComponentHandler creates a new component handler.
func NewComponentHandler(
	jobRepo JobRepository,
	aiSettingsRepo AISettingsRepository,
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	jobEventPublisher JobEventPublisher,
	logger Logger,
) *ComponentHandler {
	return &ComponentHandler{
		jobRepo:           jobRepo,
		aiSettingsRepo:    aiSettingsRepo,
		aiProviderFactory: aiProviderFactory,
		contentStorage:    contentStorage,
		jobEventPublisher: jobEventPublisher,
		logger:            logger,
	}
}

// Process processes a component regeneration job.
func (h *ComponentHandler) Process(ctx context.Context, job *entity.GenerationJob) error {
	log := h.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Parse input from result path
	var input ComponentRegenInput
	if job.ResultPath != nil {
		if err := json.Unmarshal([]byte(*job.ResultPath), &input); err != nil {
			return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to parse job input")
		}
	} else {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "job missing input data")
	}

	// Update progress
	progressMsg := "Regenerating component with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 20
	_ = h.jobRepo.Update(ctx, job)
	PublishJobEvent(ctx, h.jobEventPublisher, "updated", job)

	// Read course content
	content, err := h.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to read course content")
	}

	// Find the generated lesson
	lessonUUID, err := uuid.Parse(input.LessonID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "invalid lesson ID")
	}

	var targetLesson *GeneratedLesson
	var lessonIndex int
	for i := range content.GeneratedLessons {
		if content.GeneratedLessons[i].ID == lessonUUID.String() {
			targetLesson = &content.GeneratedLessons[i]
			lessonIndex = i
			break
		}
	}
	if targetLesson == nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "lesson not found")
	}

	// Find the component to regenerate
	componentUUID, err := uuid.Parse(input.ComponentID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "invalid component ID")
	}

	var targetComponent *LessonComponent
	var componentIndex int
	for i := range targetLesson.Components {
		if targetLesson.Components[i].ID == componentUUID.String() {
			targetComponent = &targetLesson.Components[i]
			componentIndex = i
			break
		}
	}
	if targetComponent == nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "component not found")
	}

	// Update progress
	job.ProgressPercent = 40
	_ = h.jobRepo.Update(ctx, job)

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Build lesson context with sibling components
	lessonContext := h.buildLessonContext(content, targetLesson, componentUUID.String())

	// Build target audience from wizard data
	targetAudience := h.buildTargetAudienceFromPersonas(content.WizardData, input.PersonaIDs)

	// Build modification prompt with learning objectives
	modPrompt := h.buildModificationPrompt(content, targetLesson, input)

	// Regenerate the component
	regenResult, err := aiProvider.RegenerateComponent(ctx, service.RegenerateComponentRequest{
		ComponentType:      targetComponent.Type,
		CurrentContentJSON: string(targetComponent.ContentJSON),
		ModificationPrompt: modPrompt,
		LessonContext:      lessonContext,
		TargetAudience:     targetAudience,
	})
	if err != nil {
		log.Error("AI regeneration failed", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("AI regeneration failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 80
	progressMsg = "Saving regenerated component..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = regenResult.TokensUsed
	_ = h.jobRepo.Update(ctx, job)

	// Update the component
	content.GeneratedLessons[lessonIndex].Components[componentIndex].ContentJSON = json.RawMessage(regenResult.ContentJSON)
	content.GeneratedLessons[lessonIndex].Components[componentIndex].UpdatedAt = time.Now()

	// Save updated content
	if err := h.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to save updated content")
	}

	// Mark job as completed
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	now := time.Now()
	job.CompletedAt = &now
	completedMsg := "Component regenerated successfully"
	job.ProgressMessage = &completedMsg
	if err := h.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to update job status", "error", err)
	}

	PublishJobEvent(ctx, h.jobEventPublisher, "completed", job)
	log.Info("component regeneration completed", "tokens", regenResult.TokensUsed)

	return nil
}

func (h *ComponentHandler) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (h *ComponentHandler) writeCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content *S3CourseContent) error {
	return h.contentStorage.WriteCourseContent(ctx, tenantID, courseID, content)
}

func (h *ComponentHandler) buildLessonContext(content *S3CourseContent, targetLesson *GeneratedLesson, componentID string) string {
	type siblingComponentContext struct {
		Type    string `json:"type"`
		Order   int    `json:"order"`
		Content string `json:"content"`
	}

	var siblingComponents []siblingComponentContext
	for _, comp := range targetLesson.Components {
		if comp.ID != componentID {
			siblingComponents = append(siblingComponents, siblingComponentContext{
				Type:    comp.Type,
				Order:   int(comp.Order),
				Content: string(comp.ContentJSON),
			})
		}
	}

	var lessonContext string
	if len(siblingComponents) > 0 {
		siblingJSON, _ := json.Marshal(siblingComponents)
		lessonContext = fmt.Sprintf("Course: %s\nLesson: %s\n\nOther components in this lesson (for context):\n%s",
			content.Settings.Title, targetLesson.Title, string(siblingJSON))
	} else {
		lessonContext = fmt.Sprintf("Course: %s\nLesson: %s", content.Settings.Title, targetLesson.Title)
	}

	return lessonContext
}

func (h *ComponentHandler) buildTargetAudienceFromPersonas(wizardData *WizardData, personaIDs []string) service.TargetAudienceInput {
	var targetAudience service.TargetAudienceInput

	if wizardData == nil || len(personaIDs) == 0 {
		return targetAudience
	}

	personaSet := make(map[string]bool)
	for _, id := range personaIDs {
		personaSet[id] = true
	}

	var roles []string
	var goals []string
	var backgrounds []string

	// Check SME personas
	for _, sme := range wizardData.SMEPersonas {
		if personaSet[sme.ID] {
			roles = append(roles, sme.JobTitle)
			backgrounds = append(backgrounds, fmt.Sprintf("SME: %s - %s", sme.JobTitle, sme.Description))
		}
	}

	// Check audience personas
	for _, aud := range wizardData.AudiencePersonas {
		if personaSet[aud.ID] {
			roles = append(roles, aud.Role)
			goals = append(goals, aud.Goals...)
			backgrounds = append(backgrounds, fmt.Sprintf("%s: %s", aud.Name, aud.Description))
		}
	}

	if len(roles) > 0 || len(goals) > 0 {
		targetAudience = service.TargetAudienceInput{
			Role:              strings.Join(roles, ", "),
			LearningGoals:     goals,
			TypicalBackground: strings.Join(backgrounds, "; "),
		}
	}

	return targetAudience
}

func (h *ComponentHandler) buildModificationPrompt(content *S3CourseContent, targetLesson *GeneratedLesson, input ComponentRegenInput) string {
	modPrompt := input.ModificationPrompt

	if len(input.LearningObjectiveIDs) > 0 {
		// Get the learning objectives from the outline
		for _, section := range content.Content.Sections {
			if lessons, ok := section["lessons"].([]interface{}); ok {
				for _, lessonData := range lessons {
					if lesson, ok := lessonData.(map[string]interface{}); ok {
						if lesson["id"] == targetLesson.OutlineLessonID {
							if los, ok := lesson["learningObjectives"].([]interface{}); ok {
								var selectedLOs []string
								for i, lo := range los {
									loID := fmt.Sprintf("lo-%d", i)
									for _, selectedID := range input.LearningObjectiveIDs {
										if loID == selectedID {
											if loStr, ok := lo.(string); ok {
												selectedLOs = append(selectedLOs, loStr)
											}
											break
										}
									}
								}
								if len(selectedLOs) > 0 {
									modPrompt = fmt.Sprintf("%s\n\nTarget these learning objectives:\n- %s",
										modPrompt, strings.Join(selectedLOs, "\n- "))
								}
							}
						}
					}
				}
			}
		}
	}

	return modPrompt
}
