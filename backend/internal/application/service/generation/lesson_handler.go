package generation

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	contentpkg "github.com/sogos/mirai-backend/internal/application/service/content"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// LessonHandler processes lesson generation jobs.
type LessonHandler struct {
	jobRepo               JobRepository
	aiSettingsRepo        AISettingsRepository
	aiProviderFactory     AIProviderFactory
	contentStorage        ContentStorage
	knowledgeSearcher     KnowledgeSearcher
	teamKnowledgeSearcher TeamKnowledgeSearcher
	teamResolver          TeamResolver
	completionNotifier    CourseCompletionNotifier
	jobEventPublisher     JobEventPublisher
	logger                Logger
}

// NewLessonHandler creates a new lesson handler.
func NewLessonHandler(
	jobRepo JobRepository,
	aiSettingsRepo AISettingsRepository,
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	completionNotifier CourseCompletionNotifier,
	jobEventPublisher JobEventPublisher,
	logger Logger,
) *LessonHandler {
	return &LessonHandler{
		jobRepo:            jobRepo,
		aiSettingsRepo:     aiSettingsRepo,
		aiProviderFactory:  aiProviderFactory,
		contentStorage:     contentStorage,
		completionNotifier: completionNotifier,
		jobEventPublisher:  jobEventPublisher,
		logger:             logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher.
func (h *LessonHandler) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	h.knowledgeSearcher = searcher
}

// SetTeamKnowledgeSearcher sets the team knowledge searcher.
func (h *LessonHandler) SetTeamKnowledgeSearcher(searcher TeamKnowledgeSearcher) {
	h.teamKnowledgeSearcher = searcher
}

// SetTeamResolver sets the team resolver.
func (h *LessonHandler) SetTeamResolver(resolver TeamResolver) {
	h.teamResolver = resolver
}

// Process processes a lesson generation job.
func (h *LessonHandler) Process(ctx context.Context, job *entity.GenerationJob) error {
	log := h.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Parse lesson info from result path
	var lessonInfo struct {
		SectionIndex int    `json:"sectionIndex"`
		LessonIndex  int    `json:"lessonIndex"`
		SectionID    string `json:"sectionId"`
	}
	if job.ResultPath != nil {
		_ = json.Unmarshal([]byte(*job.ResultPath), &lessonInfo)
	}

	// Update progress
	progressMsg := "Generating lesson content with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 30
	_ = h.jobRepo.Update(ctx, job)

	// Read course content
	content, err := h.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to read course content")
	}

	// Get lesson info from outline
	if lessonInfo.SectionIndex >= len(content.Content.Sections) {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "section index out of range")
	}

	section := content.Content.Sections[lessonInfo.SectionIndex]
	sectionTitle, _ := section["title"].(string)

	var lessons []interface{}
	if l, ok := section["lessons"].([]interface{}); ok {
		lessons = l
	}
	if lessonInfo.LessonIndex >= len(lessons) {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "lesson index out of range")
	}

	lessonData, ok := lessons[lessonInfo.LessonIndex].(map[string]interface{})
	if !ok {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "invalid lesson data")
	}

	lessonTitle, _ := lessonData["title"].(string)
	lessonDesc, _ := lessonData["description"].(string)
	lessonID, _ := lessonData["id"].(string)

	var learningObjectives []string
	if los, ok := lessonData["learningObjectives"].([]interface{}); ok {
		for _, lo := range los {
			if str, ok := lo.(string); ok {
				learningObjectives = append(learningObjectives, str)
			}
		}
	}

	isLastInSection, _ := lessonData["isLastInSection"].(bool)
	isLastInCourse, _ := lessonData["isLastInCourse"].(bool)

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Extract personas
	smeKnowledge, targetAudience := ExtractPersonas(content.WizardData)

	// Get additional context
	var lessonAdditionalContext string
	if content.WizardData != nil && content.WizardData.AdditionalContext != "" {
		lessonAdditionalContext = content.WizardData.AdditionalContext
	}

	// Check Internal Data Only mode and get RAG context
	var internalDataOnly bool
	var ragContext []service.RAGChunkInput
	selectedDocIDs := GetSelectedDocIDs(content.WizardData)
	hasSelectedKnowledge := len(selectedDocIDs) > 0
	if content.WizardData != nil {
		internalDataOnly = content.WizardData.InternalDataOnly
	}

	if hasSelectedKnowledge {
		// Try plan-driven search terms first, fall back to generic queries
		planSearchTerms := h.findPlannedLessonSearchTerms(content.CoursePlan, sectionTitle, lessonTitle)
		if len(planSearchTerms) > 0 {
			log.Info("[AI.RAG] Using plan-driven search terms for lesson",
				"lessonTitle", lessonTitle,
				"searchTerms", len(planSearchTerms),
			)
			ragContext = h.fetchLessonRAGContextWithTerms(ctx, job, planSearchTerms, selectedDocIDs, log)
		} else {
			log.Info("[AI.RAG] No plan search terms found, using generic queries for lesson", "lessonTitle", lessonTitle)
			ragContext = h.fetchLessonRAGContext(ctx, job, lessonTitle, lessonDesc, learningObjectives, log)
		}
	}

	// Build full course outline context for deduplication and positioning
	courseOutline := buildCourseOutlineSummary(content.Content.Sections)
	sectionDesc := extractSectionDescription(section)
	sectionOrder := lessonInfo.SectionIndex + 1
	lessonOrder := lessonInfo.LessonIndex + 1

	// Compute position flags
	isFirstInSection := lessonInfo.LessonIndex == 0
	isFirstSection := lessonInfo.SectionIndex == 0
	isLastSection := lessonInfo.SectionIndex == len(content.Content.Sections)-1
	isFirstInCourse := isFirstSection && isFirstInSection

	// Build navigation context from outline
	prevLessonTitle, prevLessonDesc := findAdjacentLesson(content.Content.Sections, lessonInfo.SectionIndex, lessonInfo.LessonIndex, -1)
	nextLessonTitle, _ := findAdjacentLesson(content.Content.Sections, lessonInfo.SectionIndex, lessonInfo.LessonIndex, +1)
	nextSectionTitle := ""
	if isLastInSection && lessonInfo.SectionIndex+1 < len(content.Content.Sections) {
		nextSectionTitle = extractSectionTitle(content.Content.Sections[lessonInfo.SectionIndex+1])
	}

	// Build summaries of other lessons in this section for deduplication context
	otherLessonsInSection := buildOtherLessonsInSection(content.Content.Sections, lessonInfo.SectionIndex, lessonInfo.LessonIndex)

	// Generate lesson content
	lessonResult, err := aiProvider.GenerateLessonContent(ctx, service.GenerateLessonRequest{
		CourseTitle:        content.Settings.Title,
		CourseDescription:  content.Settings.DesiredOutcome,
		CourseOutline:      courseOutline,
		SectionTitle:       sectionTitle,
		SectionDescription: sectionDesc,
		SectionOrder:       sectionOrder,
		IsFirstSection:     isFirstSection,
		IsLastSection:      isLastSection,
		LessonTitle:        lessonTitle,
		LessonDescription:  lessonDesc,
		LessonOrder:        lessonOrder,
		LearningObjectives: learningObjectives,
		IsFirstInSection:   isFirstInSection,
		IsLastInSection:    isLastInSection,
		IsFirstInCourse:    isFirstInCourse,
		IsLastInCourse:     isLastInCourse,
		PreviousLessonTitle:      prevLessonTitle,
		PreviousLessonSummary:    prevLessonDesc,
		NextLessonTitle:          nextLessonTitle,
		NextSectionTitle:         nextSectionTitle,
		PreviousLessonsInSection: otherLessonsInSection,
		SMEKnowledge:       smeKnowledge,
		TargetAudience:     targetAudience,
		AdditionalContext:  lessonAdditionalContext,
		InternalDataOnly:   internalDataOnly,
		RAGContext:         ragContext,
	})
	if err != nil {
		log.Error("AI lesson generation failed", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("AI generation failed: %v", err))
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing lesson content..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = lessonResult.TokensUsed
	_ = h.jobRepo.Update(ctx, job)

	// Build provenance from RAG context
	var searchQueries []string
	planSearchTerms := h.findPlannedLessonSearchTerms(content.CoursePlan, sectionTitle, lessonTitle)
	if len(planSearchTerms) > 0 {
		searchQueries = planSearchTerms
	} else {
		searchQueries = append([]string{lessonTitle + " " + lessonDesc}, learningObjectives...)
	}
	provenance := contentpkg.BuildComponentProvenance(ragContext, searchQueries)

	// Build S3 lesson with components
	now := time.Now()
	s3Components := make([]LessonComponent, len(lessonResult.Components))
	for i, compResult := range lessonResult.Components {
		s3Components[i] = LessonComponent{
			ID:                   uuid.New().String(),
			Type:                 compResult.Type,
			Order:                int32(compResult.Order),
			ContentJSON:          json.RawMessage(compResult.ContentJSON),
			LearningObjectiveIDs: []string{},
			CreatedAt:            now,
			UpdatedAt:            now,
			Provenance:           provenance,
		}
	}

	s3Lesson := GeneratedLesson{
		ID:              lessonID,
		SectionID:       lessonInfo.SectionID,
		OutlineLessonID: lessonID,
		Title:           lessonTitle,
		Components:      s3Components,
		GeneratedAt:     now,
	}
	s3Lesson.AggregateProvenance = contentpkg.AggregateProvenance(s3Components)
	if lessonResult.SegueText != "" {
		s3Lesson.SegueText = &lessonResult.SegueText
	}

	// Atomically add lesson to content
	var atomicContent S3CourseContent
	if err := h.contentStorage.UpdateCourseContentAtomic(
		ctx,
		job.TenantID,
		*job.CourseID,
		&atomicContent,
		func() error {
			UpsertLesson(&atomicContent, s3Lesson)
			return nil
		},
	); err != nil {
		log.Error("failed to atomically store lesson content", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to store lesson content")
	}

	// Update token usage
	_ = h.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, lessonResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	job.ResultPath = nil
	progressMsg = "Lesson generation complete"
	job.ProgressMessage = &progressMsg
	_ = h.jobRepo.Update(ctx, job)

	PublishJobEvent(ctx, h.jobEventPublisher, "completed", job)

	log.Info("lesson generation completed", "tokensUsed", lessonResult.TokensUsed)

	// Check parent job completion
	if job.ParentJobID != nil {
		if err := h.checkAndCompleteParentJob(ctx, *job.ParentJobID); err != nil {
			log.Error("failed to check parent job completion", "error", err)
		}
	}

	return nil
}

func (h *LessonHandler) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (h *LessonHandler) fetchLessonRAGContext(
	ctx context.Context,
	job *entity.GenerationJob,
	lessonTitle, lessonDesc string,
	learningObjectives []string,
	log Logger,
) []service.RAGChunkInput {
	var ragContext []service.RAGChunkInput

	if h.knowledgeSearcher != nil && job.CourseID != nil {
		searchQueries := []string{lessonTitle + " " + lessonDesc}
		for _, obj := range learningObjectives {
			searchQueries = append(searchQueries, obj)
		}

		seenChunks := make(map[string]bool)
		for _, query := range searchQueries {
			chunks, err := h.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 5)
			if err != nil {
				log.Warn("RAG search failed for lesson", "query", query, "error", err)
				continue
			}
			for _, chunk := range chunks {
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				if !seenChunks[hashKey] {
					seenChunks[hashKey] = true
					chunkIndex := 0
					if chunk.ChunkIndex != nil {
						chunkIndex = int(*chunk.ChunkIndex)
					}
					ragContext = append(ragContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      chunkIndex,
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "course",
					})
				}
			}
		}
		log.Info("Fetched RAG context for lesson", "lessonTitle", lessonTitle, "chunkCount", len(ragContext))
	}

	// Also search team knowledge
	if h.teamKnowledgeSearcher != nil && h.teamResolver != nil {
		team, err := h.teamResolver.GetTeamByTenant(ctx, job.TenantID)
		if err != nil {
			log.Warn("failed to resolve team for tenant", "error", err)
		} else if team != nil {
			log.Info("[AI.RAG] Searching team knowledge for lesson", "teamID", team.ID, "lessonTitle", lessonTitle)

			teamSearchQueries := []string{lessonTitle + " " + lessonDesc}
			for _, obj := range learningObjectives {
				teamSearchQueries = append(teamSearchQueries, obj)
			}

			teamSeenChunks := make(map[string]bool)
			for _, chunk := range ragContext {
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				teamSeenChunks[hashKey] = true
			}

			for _, query := range teamSearchQueries {
				chunks, err := h.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, query, 5)
				if err != nil {
					log.Warn("Team RAG search failed for lesson", "query", query, "error", err)
					continue
				}
				for _, chunk := range chunks {
					hashKey := chunk.Content
					if len(hashKey) > 100 {
						hashKey = hashKey[:100]
					}
					if teamSeenChunks[hashKey] {
						continue
					}
					teamSeenChunks[hashKey] = true
					chunkIndex := 0
					if chunk.ChunkIndex != nil {
						chunkIndex = int(*chunk.ChunkIndex)
					}
					ragContext = append(ragContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      chunkIndex,
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "team",
					})
				}
			}
			log.Info("[AI.RAG] Added team knowledge context for lesson", "totalChunks", len(ragContext))
		}
	}

	return ragContext
}

// findPlannedLessonSearchTerms finds matching planned lesson search terms from the course plan.
func (h *LessonHandler) findPlannedLessonSearchTerms(plan *CoursePlan, sectionTitle, lessonTitle string) []string {
	if plan == nil || plan.Status != "approved" {
		return nil
	}

	for _, section := range plan.PlannedSections {
		if strings.EqualFold(section.Title, sectionTitle) {
			for _, lesson := range section.Lessons {
				if strings.EqualFold(lesson.Title, lessonTitle) && len(lesson.SearchTerms) > 0 {
					return lesson.SearchTerms
				}
			}
			// If no exact lesson match, use the section's search terms
			if len(section.SearchTerms) > 0 {
				return section.SearchTerms
			}
		}
	}
	return nil
}

// fetchLessonRAGContextWithTerms performs targeted RAG search using plan-provided search terms.
func (h *LessonHandler) fetchLessonRAGContextWithTerms(
	ctx context.Context,
	job *entity.GenerationJob,
	searchTerms []string,
	selectedDocIDs []string,
	log Logger,
) []service.RAGChunkInput {
	var ragContext []service.RAGChunkInput

	selectedSet := make(map[string]bool)
	for _, id := range selectedDocIDs {
		selectedSet[id] = true
	}

	if h.knowledgeSearcher != nil && job.CourseID != nil {
		seenChunks := make(map[string]bool)
		for _, term := range searchTerms {
			chunks, err := h.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, term, 5)
			if err != nil {
				log.Warn("Plan-driven RAG search failed", "term", term, "error", err)
				continue
			}
			for _, chunk := range chunks {
				if !selectedSet[chunk.SourceID.String()] {
					continue
				}
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				if seenChunks[hashKey] {
					continue
				}
				seenChunks[hashKey] = true
				chunkIndex := 0
				if chunk.ChunkIndex != nil {
					chunkIndex = int(*chunk.ChunkIndex)
				}
				ragContext = append(ragContext, service.RAGChunkInput{
					ChunkID:         chunk.ID,
					SourceID:        chunk.SourceID.String(),
					SourceName:      chunk.SourceName,
					Content:         chunk.Content,
					ChunkIndex:      chunkIndex,
					SimilarityScore: chunk.SimilarityScore,
					Scope:           "course",
				})
			}
		}
		log.Info("[AI.RAG] Plan-driven lesson context retrieved", "chunkCount", len(ragContext), "searchTerms", len(searchTerms))
	}

	// Also search team knowledge with plan terms
	if h.teamKnowledgeSearcher != nil && h.teamResolver != nil {
		team, err := h.teamResolver.GetTeamByTenant(ctx, job.TenantID)
		if err != nil {
			log.Warn("failed to resolve team for tenant", "error", err)
		} else if team != nil {
			teamSeenChunks := make(map[string]bool)
			for _, chunk := range ragContext {
				hashKey := chunk.Content
				if len(hashKey) > 100 {
					hashKey = hashKey[:100]
				}
				teamSeenChunks[hashKey] = true
			}

			for _, term := range searchTerms {
				chunks, err := h.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, term, 5)
				if err != nil {
					log.Warn("Team plan-driven RAG search failed", "term", term, "error", err)
					continue
				}
				for _, chunk := range chunks {
					if !selectedSet[chunk.SourceID.String()] {
						continue
					}
					hashKey := chunk.Content
					if len(hashKey) > 100 {
						hashKey = hashKey[:100]
					}
					if teamSeenChunks[hashKey] {
						continue
					}
					teamSeenChunks[hashKey] = true
					chunkIndex := 0
					if chunk.ChunkIndex != nil {
						chunkIndex = int(*chunk.ChunkIndex)
					}
					ragContext = append(ragContext, service.RAGChunkInput{
						ChunkID:         chunk.ID,
						SourceID:        chunk.SourceID.String(),
						SourceName:      chunk.SourceName,
						Content:         chunk.Content,
						ChunkIndex:      chunkIndex,
						SimilarityScore: chunk.SimilarityScore,
						Scope:           "team",
					})
				}
			}
		}
	}

	return ragContext
}

// buildCourseOutlineSummary extracts the full course outline from S3 section data
// so each lesson has visibility into the entire course structure for deduplication.
func buildCourseOutlineSummary(sections []map[string]any) []service.OutlineSectionSummary {
	var outline []service.OutlineSectionSummary
	for i, section := range sections {
		sTitle, _ := section["title"].(string)
		sDesc, _ := section["description"].(string)

		var lessons []service.OutlineLessonSummary
		if rawLessons, ok := section["lessons"].([]interface{}); ok {
			for j, rawLesson := range rawLessons {
				if lessonMap, ok := rawLesson.(map[string]interface{}); ok {
					lTitle, _ := lessonMap["title"].(string)
					lDesc, _ := lessonMap["description"].(string)
					var objectives []string
					if los, ok := lessonMap["learningObjectives"].([]interface{}); ok {
						for _, lo := range los {
							if s, ok := lo.(string); ok {
								objectives = append(objectives, s)
							}
						}
					}
					lessons = append(lessons, service.OutlineLessonSummary{
						Title:              lTitle,
						Description:        lDesc,
						Order:              j + 1,
						LearningObjectives: objectives,
					})
				}
			}
		}

		outline = append(outline, service.OutlineSectionSummary{
			Title:       sTitle,
			Description: sDesc,
			Order:       i + 1,
			LessonCount: len(lessons),
			Lessons:     lessons,
		})
	}
	return outline
}

// extractSectionDescription extracts the description from a section map.
func extractSectionDescription(section map[string]any) string {
	desc, _ := section["description"].(string)
	return desc
}

// extractSectionTitle extracts the title from a section map.
func extractSectionTitle(section map[string]any) string {
	title, _ := section["title"].(string)
	return title
}

// findAdjacentLesson finds the previous or next lesson relative to the given position.
// direction: -1 for previous, +1 for next.
// Returns (title, description) of the adjacent lesson.
func findAdjacentLesson(sections []map[string]any, sectionIdx, lessonIdx, direction int) (string, string) {
	targetLessonIdx := lessonIdx + direction
	targetSectionIdx := sectionIdx

	// Check within current section
	if targetSectionIdx >= 0 && targetSectionIdx < len(sections) {
		if rawLessons, ok := sections[targetSectionIdx]["lessons"].([]interface{}); ok {
			if targetLessonIdx >= 0 && targetLessonIdx < len(rawLessons) {
				if lessonMap, ok := rawLessons[targetLessonIdx].(map[string]interface{}); ok {
					title, _ := lessonMap["title"].(string)
					desc, _ := lessonMap["description"].(string)
					return title, desc
				}
			}
		}
	}

	// Cross section boundary
	targetSectionIdx = sectionIdx + direction
	if targetSectionIdx < 0 || targetSectionIdx >= len(sections) {
		return "", ""
	}
	if rawLessons, ok := sections[targetSectionIdx]["lessons"].([]interface{}); ok && len(rawLessons) > 0 {
		var idx int
		if direction < 0 {
			idx = len(rawLessons) - 1 // last lesson of previous section
		}
		if lessonMap, ok := rawLessons[idx].(map[string]interface{}); ok {
			title, _ := lessonMap["title"].(string)
			desc, _ := lessonMap["description"].(string)
			return title, desc
		}
	}
	return "", ""
}

// buildOtherLessonsInSection builds summaries of all other lessons in the same section
// (excluding the current lesson) so the AI can see what sibling lessons cover and avoid overlap.
func buildOtherLessonsInSection(sections []map[string]any, sectionIdx, currentLessonIdx int) []service.GeneratedLessonSummary {
	if sectionIdx >= len(sections) {
		return nil
	}
	section := sections[sectionIdx]
	rawLessons, ok := section["lessons"].([]interface{})
	if !ok {
		return nil
	}

	var summaries []service.GeneratedLessonSummary
	for i, rawLesson := range rawLessons {
		if i == currentLessonIdx {
			continue // skip ourselves
		}
		lessonMap, ok := rawLesson.(map[string]interface{})
		if !ok {
			continue
		}
		title, _ := lessonMap["title"].(string)
		desc, _ := lessonMap["description"].(string)

		var keyPoints []string
		// Use learning objectives as key points since actual content isn't generated yet (parallel)
		if los, ok := lessonMap["learningObjectives"].([]interface{}); ok {
			for _, lo := range los {
				if s, ok := lo.(string); ok {
					keyPoints = append(keyPoints, s)
				}
			}
		}
		// Also include description as context
		if desc != "" {
			keyPoints = append([]string{desc}, keyPoints...)
		}

		summaries = append(summaries, service.GeneratedLessonSummary{
			Title:     title,
			KeyPoints: keyPoints,
		})
	}
	return summaries
}

func (h *LessonHandler) checkAndCompleteParentJob(ctx context.Context, parentJobID uuid.UUID) error {
	log := h.logger.With("parentJobID", parentJobID)

	result, err := h.jobRepo.FinalizeParentJob(
		ctx,
		parentJobID,
		valueobject.GenerationJobStatusCompleted.String(),
		valueobject.GenerationJobStatusFailed.String(),
		"All lessons generated successfully",
	)
	if err != nil {
		return fmt.Errorf("failed to finalize parent job: %w", err)
	}

	if result == nil {
		return nil
	}

	if !result.WasFinalized && result.AllComplete {
		log.Info("parent job already finalized by another worker")
		return nil
	}

	if !result.AllComplete {
		parentJob, err := h.jobRepo.GetByID(ctx, parentJobID)
		if err != nil || parentJob == nil {
			return nil
		}

		doneCount := result.CompletedCount + result.FailedCount
		progressPercent := int32(10)
		if result.TotalCount > 0 {
			progressPercent = int32(10 + (90 * doneCount / result.TotalCount))
		}

		progressMsg := fmt.Sprintf("Generated %d of %d lessons...", result.CompletedCount, result.TotalCount)
		parentJob.ProgressPercent = progressPercent
		parentJob.ProgressMessage = &progressMsg
		parentJob.TokensUsed = result.TotalTokens
		_ = h.jobRepo.Update(ctx, parentJob)
		log.Info("parent job progress update", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount)
		return nil
	}

	log.Info("parent job finalized", "completed", result.CompletedCount, "failed", result.FailedCount, "total", result.TotalCount)

	// Log failed jobs for debugging
	if result.FailedCount > 0 {
		failedJobs, err := h.jobRepo.ListByParentID(ctx, parentJobID)
		if err == nil {
			for _, job := range failedJobs {
				if job.Status == valueobject.GenerationJobStatusFailed {
					errMsg := ""
					if job.ErrorMessage != nil {
						errMsg = *job.ErrorMessage
					}
					log.Error("FAILED CHILD JOB", "childJobID", job.ID, "errorMessage", errMsg, "resultPath", job.ResultPath)
				}
			}
		}
	}

	parentJob, err := h.jobRepo.GetByID(ctx, parentJobID)
	if err != nil || parentJob == nil || parentJob.CourseID == nil {
		return nil
	}

	// Publish completion event
	if result.FailedCount > 0 {
		PublishJobEvent(ctx, h.jobEventPublisher, "failed", parentJob)
	} else {
		PublishJobEvent(ctx, h.jobEventPublisher, "completed", parentJob)
	}

	// Send notification
	courseTitle := "Your Course"
	if result.FailedCount > 0 {
		errMsg := fmt.Sprintf("%d lesson(s) failed to generate", result.FailedCount)
		if h.completionNotifier != nil {
			_ = h.completionNotifier.NotifyCourseFailed(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle, errMsg)
		}
	} else {
		if h.completionNotifier != nil {
			_ = h.completionNotifier.NotifyCourseComplete(ctx, parentJob.CreatedByUserID, *parentJob.CourseID, courseTitle)
		}
	}

	return nil
}
