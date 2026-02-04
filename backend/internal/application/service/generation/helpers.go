package generation

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

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

// ScopePriority returns priority for deduplication (lower = higher priority).
func ScopePriority(scope string) int {
	switch scope {
	case "course":
		return 0
	case "team":
		return 1
	case "global":
		return 2
	default:
		return 3
	}
}

// DeduplicateChunksWithScopePriority removes duplicate chunks, keeping the one
// with highest scope priority (course > team > global).
func DeduplicateChunksWithScopePriority(chunks []service.RAGChunkInput) []service.RAGChunkInput {
	if len(chunks) == 0 {
		return chunks
	}

	// Sort by scope priority (lower = higher priority)
	sort.SliceStable(chunks, func(i, j int) bool {
		return ScopePriority(chunks[i].Scope) < ScopePriority(chunks[j].Scope)
	})

	// Deduplicate by content hash, keeping first occurrence (highest priority)
	seenContent := make(map[string]bool)
	result := make([]service.RAGChunkInput, 0, len(chunks))

	for _, chunk := range chunks {
		// Use first 100 chars as content hash
		hash := chunk.Content
		if len(hash) > 100 {
			hash = hash[:100]
		}
		if !seenContent[hash] {
			seenContent[hash] = true
			result = append(result, chunk)
		}
	}

	return result
}

// TruncateExcerpt truncates content to maxLen characters, adding ellipsis if needed.
func TruncateExcerpt(content string, maxLen int) string {
	if len(content) <= maxLen {
		return content
	}
	return content[:maxLen-3] + "..."
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
func ExtractPersonas(wizardData *WizardData) (smeKnowledge []service.SMEKnowledgeInput, targetAudience service.TargetAudienceInput) {
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

// parseDesiredOutcomes extracts individual learning outcomes from course content.
// It parses the multi-line desired outcomes from wizard data, falling back to
// the single desired outcome from settings if needed.
func parseDesiredOutcomes(content *S3CourseContent) []string {
	var outcomes []string

	rawOutcomes := ""
	if content.WizardData != nil {
		rawOutcomes = content.WizardData.DesiredOutcomes
	}
	if rawOutcomes == "" {
		rawOutcomes = content.Settings.DesiredOutcome
	}
	if rawOutcomes == "" {
		return outcomes
	}

	lines := strings.Split(rawOutcomes, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "-")
		line = strings.TrimPrefix(line, "•")
		line = strings.TrimPrefix(line, "*")
		// Handle numbered list items like "1. " or "1) "
		for i, c := range line {
			if c >= '0' && c <= '9' {
				continue
			}
			if (c == '.' || c == ')') && i > 0 {
				line = line[i+1:]
			}
			break
		}
		line = strings.TrimSpace(line)
		if line != "" {
			outcomes = append(outcomes, line)
		}
	}

	return outcomes
}

// buildComponentProvenance creates a ComponentProvenance from RAG chunks and search queries.
func buildComponentProvenance(chunks []service.RAGChunkInput, queries []string) *ComponentProvenance {
	if len(chunks) == 0 {
		return nil
	}

	prov := &ComponentProvenance{
		SourceChunks: make([]ProvenanceChunk, 0, len(chunks)),
		Queries:      queries,
		GeneratedAt:  time.Now(),
	}

	for _, chunk := range chunks {
		prov.SourceChunks = append(prov.SourceChunks, ProvenanceChunk{
			ChunkID:         chunk.ChunkID,
			SourceID:        chunk.SourceID,
			SourceName:      chunk.SourceName,
			Excerpt:         TruncateExcerpt(chunk.Content, 200),
			SimilarityScore: chunk.SimilarityScore,
			Scope:           chunk.Scope,
		})

		// Estimate tokens (roughly 4 chars per token)
		tokens := int32(len(chunk.Content) / 4)
		prov.TotalTokens += tokens

		switch chunk.Scope {
		case "course":
			prov.CourseTokens += tokens
		case "team":
			prov.TeamTokens += tokens
		case "global":
			prov.GlobalTokens += tokens
		}
	}

	return prov
}

// aggregateProvenance aggregates provenance from all components in a lesson.
func aggregateProvenance(components []LessonComponent) *LessonProvenance {
	prov := &LessonProvenance{}

	sourceIDs := make(map[string]bool)
	for _, comp := range components {
		if comp.Provenance == nil {
			continue
		}

		prov.CourseTokens += comp.Provenance.CourseTokens
		prov.TeamTokens += comp.Provenance.TeamTokens
		prov.GlobalTokens += comp.Provenance.GlobalTokens
		prov.TotalTokens += comp.Provenance.TotalTokens

		for _, chunk := range comp.Provenance.SourceChunks {
			sourceIDs[chunk.SourceID] = true
		}
	}

	prov.SourceCount = int32(len(sourceIDs))

	groundedTokens := prov.CourseTokens + prov.TeamTokens + prov.GlobalTokens
	if prov.TotalTokens > 0 {
		prov.GroundingScore = float32(groundedTokens) / float32(prov.TotalTokens)
		prov.UngroundedTokens = prov.TotalTokens - groundedTokens
	}

	return prov
}

// GetSelectedDocIDs extracts selected document IDs from wizard data.
func GetSelectedDocIDs(wizardData *WizardData) []string {
	if wizardData == nil {
		return nil
	}
	var selectedDocIDs []string
	selectedDocIDs = append(selectedDocIDs, wizardData.SelectedTeamDocIDs...)
	selectedDocIDs = append(selectedDocIDs, wizardData.SelectedGlobalDocIDs...)
	return selectedDocIDs
}
