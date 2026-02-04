package generation

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeScopeBuildFunc is a function type for building knowledge scope.
type KnowledgeScopeBuildFunc func(sources []*entity.KnowledgeSource, selectedDocIDs []string, userID uuid.UUID) (*valueobject.KnowledgeScope, error)

// OutlineHandler processes outline generation jobs.
type OutlineHandler struct {
	jobRepo                 JobRepository
	aiSettingsRepo          AISettingsRepository
	aiProviderFactory       AIProviderFactory
	contentStorage          ContentStorage
	knowledgeSearcher       KnowledgeSearcher
	teamKnowledgeSearcher   TeamKnowledgeSearcher
	teamResolver            TeamResolver
	outlineNotifier         OutlineNotifier
	jobEventPublisher       JobEventPublisher
	buildKnowledgeScopeFunc KnowledgeScopeBuildFunc
	logger                  Logger
}

// NewOutlineHandler creates a new outline handler.
func NewOutlineHandler(
	jobRepo JobRepository,
	aiSettingsRepo AISettingsRepository,
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	outlineNotifier OutlineNotifier,
	jobEventPublisher JobEventPublisher,
	logger Logger,
) *OutlineHandler {
	return &OutlineHandler{
		jobRepo:           jobRepo,
		aiSettingsRepo:    aiSettingsRepo,
		aiProviderFactory: aiProviderFactory,
		contentStorage:    contentStorage,
		outlineNotifier:   outlineNotifier,
		jobEventPublisher: jobEventPublisher,
		logger:            logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher.
func (h *OutlineHandler) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	h.knowledgeSearcher = searcher
}

// SetTeamKnowledgeSearcher sets the team knowledge searcher.
func (h *OutlineHandler) SetTeamKnowledgeSearcher(searcher TeamKnowledgeSearcher) {
	h.teamKnowledgeSearcher = searcher
}

// SetTeamResolver sets the team resolver.
func (h *OutlineHandler) SetTeamResolver(resolver TeamResolver) {
	h.teamResolver = resolver
}

// SetKnowledgeScopeBuildFunc sets the knowledge scope build function.
func (h *OutlineHandler) SetKnowledgeScopeBuildFunc(fn KnowledgeScopeBuildFunc) {
	h.buildKnowledgeScopeFunc = fn
}

// Process processes an outline generation job.
func (h *OutlineHandler) Process(ctx context.Context, job *entity.GenerationJob) error {
	log := h.logger.With("jobID", job.ID, "courseID", job.CourseID)

	if CheckJobCancelled(ctx, h.jobRepo, job.ID) {
		log.Info("job already cancelled, skipping processing")
		return nil
	}

	// Update progress
	progressMsg := "Generating course outline with AI..."
	job.ProgressMessage = &progressMsg
	job.ProgressPercent = 40
	_ = h.jobRepo.Update(ctx, job)

	// Read course content
	content, err := h.readCourseContent(ctx, job.TenantID, *job.CourseID)
	if err != nil {
		log.Error("failed to read course content", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to read course content")
	}

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, job.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, fmt.Sprintf("failed to get AI provider: %v", err))
	}

	// Extract personas and build request
	smeKnowledge, targetAudience := ExtractPersonas(content.WizardData)
	additionalContext := h.getAdditionalContext(content.WizardData)

	// Parse desired outcomes for curriculum mapping
	desiredOutcomes := parseDesiredOutcomes(content)

	outlineRequest := service.GenerateOutlineRequest{
		CourseTitle:       content.Settings.Title,
		DesiredOutcome:    content.Settings.DesiredOutcome,
		DesiredOutcomes:   desiredOutcomes,
		SMEKnowledge:      smeKnowledge,
		TargetAudience:    targetAudience,
		AdditionalContext: additionalContext,
	}

	// Inject approved course plan as guidance for outline generation
	if content.CoursePlan != nil && content.CoursePlan.Status == "approved" {
		planCtx := &service.CoursePlanContext{}
		for _, ps := range content.CoursePlan.PlannedSections {
			sectionCtx := service.PlannedSectionContext{
				Title:       ps.Title,
				Description: ps.Description,
				SourceIDs:   ps.SourceIDs,
				Rationale:   ps.Rationale,
			}
			for _, pl := range ps.Lessons {
				sectionCtx.Lessons = append(sectionCtx.Lessons, service.PlannedLessonContext{
					Title:         pl.Title,
					Description:   pl.Description,
					LearningGoals: pl.LearningGoals,
				})
			}
			planCtx.Sections = append(planCtx.Sections, sectionCtx)
		}
		outlineRequest.CoursePlan = planCtx
		log.Info("[AI.Plan] Injecting approved course plan into outline request",
			"planSections", len(planCtx.Sections),
		)
	}

	// Check for selected knowledge sources
	selectedDocIDs := GetSelectedDocIDs(content.WizardData)
	hasSelectedKnowledge := len(selectedDocIDs) > 0
	if content.WizardData != nil {
		outlineRequest.InternalDataOnly = content.WizardData.InternalDataOnly
	}

	log.Info("[AI.RAG] Knowledge context check",
		"hasSelectedKnowledge", hasSelectedKnowledge,
		"selectedDocCount", len(selectedDocIDs),
		"internalDataOnly", outlineRequest.InternalDataOnly,
	)

	// Fetch RAG context and knowledge scope
	var knowledgeScope *valueobject.KnowledgeScope
	if hasSelectedKnowledge && h.knowledgeSearcher != nil {
		outlineRequest, knowledgeScope = h.enrichWithRAGContext(ctx, job, content, outlineRequest, selectedDocIDs, additionalContext, log)
	}

	// Generate outline with constraint validation and retry
	outlineResult, violations := h.generateWithConstraintRetry(ctx, job, aiProvider, outlineRequest, knowledgeScope, log)
	if outlineResult == nil {
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "AI generation failed")
	}

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing outline..."
	job.ProgressMessage = &progressMsg
	job.TokensUsed = outlineResult.TokensUsed
	_ = h.jobRepo.Update(ctx, job)

	// Calculate grounding scores and build provenance
	sectionGroundingScores := h.calculateGroundingScores(outlineRequest, outlineResult, log)
	sectionProvenances := h.buildSectionProvenances(outlineRequest, outlineResult)

	// Convert AI result to content sections format
	sections, totalLessons := h.buildSections(outlineResult, sectionGroundingScores, sectionProvenances)

	// Build outline-level provenance
	outlineProvenance := h.buildOutlineProvenance(sectionProvenances, sectionGroundingScores, outlineRequest.Constraints, violations)
	log.Info("[AI.Provenance] Outline provenance calculated",
		"totalSources", outlineProvenance.TotalSources,
		"totalChunks", outlineProvenance.TotalChunks,
		"groundingScore", outlineProvenance.GroundingScore,
		"constraintsApplied", outlineProvenance.ConstraintsApplied,
		"constraintsMet", outlineProvenance.ConstraintsMet,
	)

	// Update content
	content.Content.Sections = sections
	content.OutlineProvenance = outlineProvenance

	// Write back to storage
	if err := h.writeCourseContent(ctx, job.TenantID, *job.CourseID, content); err != nil {
		log.Error("failed to write outline to MinIO", "error", err)
		return FailJob(ctx, h.jobRepo, h.jobEventPublisher, h.logger, job, "failed to store outline")
	}

	// Update token usage
	_ = h.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, outlineResult.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	completedAt := time.Now()
	job.CompletedAt = &completedAt
	progressMsg = "Outline generation complete"
	job.ProgressMessage = &progressMsg
	_ = h.jobRepo.Update(ctx, job)

	PublishJobEvent(ctx, h.jobEventPublisher, "completed", job)

	// Send notification
	if h.outlineNotifier != nil {
		_ = h.outlineNotifier.NotifyOutlineReady(ctx, job.CreatedByUserID, *job.CourseID, content.Settings.Title, len(sections), totalLessons)
	}

	log.Info("outline generation completed", "tokensUsed", outlineResult.TokensUsed, "sections", len(sections), "lessons", totalLessons)
	return nil
}

func (h *OutlineHandler) getAdditionalContext(wizardData *WizardData) string {
	if wizardData == nil {
		return ""
	}
	if wizardData.AdditionalContext != "" {
		return wizardData.AdditionalContext
	}
	return wizardData.DesiredOutcomes
}

func (h *OutlineHandler) readCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) (*S3CourseContent, error) {
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, tenantID, courseID, &content); err != nil {
		return nil, err
	}
	return &content, nil
}

func (h *OutlineHandler) writeCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content *S3CourseContent) error {
	return h.contentStorage.WriteCourseContent(ctx, tenantID, courseID, content)
}

func (h *OutlineHandler) enrichWithRAGContext(
	ctx context.Context,
	job *entity.GenerationJob,
	content *S3CourseContent,
	outlineRequest service.GenerateOutlineRequest,
	selectedDocIDs []string,
	additionalContext string,
	log Logger,
) (service.GenerateOutlineRequest, *valueobject.KnowledgeScope) {
	log.Info("[AI.RAG] Fetching RAG context from selected knowledge sources")

	sources, err := h.knowledgeSearcher.ListByCourse(ctx, *job.CourseID)
	if err != nil {
		log.Warn("failed to list knowledge sources", "error", err)
		return outlineRequest, nil
	}

	// Build selected set
	selectedSet := make(map[string]bool)
	for _, id := range selectedDocIDs {
		selectedSet[id] = true
	}

	// Build document indices
	for _, src := range sources {
		if !selectedSet[src.ID.String()] {
			continue
		}
		if src.DocumentIndex != nil {
			outlineRequest.DocumentIndices = append(outlineRequest.DocumentIndices, service.DocumentIndexInput{
				SourceID:             src.ID.String(),
				SourceName:           src.Name,
				Title:                src.DocumentIndex.Title,
				MainTopics:           src.DocumentIndex.MainTopics,
				KeyConcepts:          src.DocumentIndex.KeyConcepts,
				EstimatedLessonCount: src.DocumentIndex.EstimatedLessonCount,
				ContentDepth:         src.DocumentIndex.ContentDepth,
			})
		}
	}

	// Build knowledge scope and constraints
	var knowledgeScope *valueobject.KnowledgeScope
	if h.buildKnowledgeScopeFunc != nil {
		knowledgeScope, err = h.buildKnowledgeScopeFunc(sources, selectedDocIDs, job.CreatedByUserID)
		if err != nil {
			log.Warn("failed to build knowledge scope", "error", err)
		} else if knowledgeScope != nil {
			constraints, constraintErr := valueobject.CalculateCourseConstraints(
				knowledgeScope,
				outlineRequest.InternalDataOnly,
				valueobject.DefaultConstraintsConfig(),
			)
			if constraintErr != nil {
				log.Warn("failed to calculate constraints", "error", constraintErr)
			} else {
				outlineRequest.Constraints = &service.CourseConstraintsInput{
					MinSections:          constraints.MinSections,
					MaxSections:          constraints.MaxSections,
					MinLessonsPerSection: constraints.MinLessonsPerSection,
					MaxLessonsPerSection: constraints.MaxLessonsPerSection,
					MinTotalLessons:      constraints.MinTotalLessons,
					MaxTotalLessons:      constraints.MaxTotalLessons,
					RecommendedDepth:     constraints.RecommendedDepth,
				}
				log.Info("[AI.Constraints] Course constraints calculated",
					"minSections", constraints.MinSections,
					"maxSections", constraints.MaxSections,
					"minLessons", constraints.MinTotalLessons,
					"maxLessons", constraints.MaxTotalLessons,
				)
			}
		}
	}

	// Build RAG search queries — prefer plan search terms when available
	var queries []string
	if content.CoursePlan != nil && content.CoursePlan.Status == "approved" {
		// Targeted RAG: use the approved plan's per-section search terms
		log.Info("[AI.RAG] Using plan-driven targeted search terms")
		for _, section := range content.CoursePlan.PlannedSections {
			queries = append(queries, section.SearchTerms...)
			for _, lesson := range section.Lessons {
				queries = append(queries, lesson.SearchTerms...)
			}
		}
	} else {
		// Fallback: use document index topics as additional queries
		queries = []string{content.Settings.Title, content.Settings.DesiredOutcome}
		if additionalContext != "" {
			queries = append(queries, additionalContext)
		}
		for _, doc := range outlineRequest.DocumentIndices {
			for _, topic := range doc.MainTopics {
				queries = append(queries, topic)
			}
			for _, concept := range doc.KeyConcepts {
				queries = append(queries, concept)
			}
		}
	}

	seenChunks := make(map[string]bool)
	for _, query := range queries {
		chunks, err := h.knowledgeSearcher.SearchKnowledge(ctx, *job.CourseID, query, 15)
		if err != nil {
			log.Warn("RAG search failed", "query", query, "error", err)
			continue
		}
		for _, chunk := range chunks {
			if !selectedSet[chunk.SourceID.String()] {
				continue
			}
			if seenChunks[chunk.ID] {
				continue
			}
			seenChunks[chunk.ID] = true
			outlineRequest.RAGContext = append(outlineRequest.RAGContext, service.RAGChunkInput{
				ChunkID:         chunk.ID,
				SourceID:        chunk.SourceID.String(),
				SourceName:      chunk.SourceName,
				Content:         chunk.Content,
				ChunkIndex:      int(*chunk.ChunkIndex),
				SimilarityScore: chunk.SimilarityScore,
				Scope:           "course",
			})
		}
	}

	// Search team knowledge
	if h.teamKnowledgeSearcher != nil && h.teamResolver != nil {
		h.enrichWithTeamRAG(ctx, job, &outlineRequest.RAGContext, selectedSet, queries, seenChunks, log)
	}

	log.Info("[AI.RAG] Course knowledge context retrieved",
		"documentIndices", len(outlineRequest.DocumentIndices),
		"chunks", len(outlineRequest.RAGContext),
	)

	return outlineRequest, knowledgeScope
}

func (h *OutlineHandler) enrichWithTeamRAG(
	ctx context.Context,
	job *entity.GenerationJob,
	ragContext *[]service.RAGChunkInput,
	selectedSet map[string]bool,
	queries []string,
	seenChunks map[string]bool,
	log Logger,
) {
	team, err := h.teamResolver.GetTeamByTenant(ctx, job.TenantID)
	if err != nil {
		log.Warn("failed to resolve team for tenant", "error", err)
		return
	}
	if team == nil {
		return
	}

	log.Info("[AI.RAG] Searching team knowledge", "teamID", team.ID)

	for _, query := range queries {
		chunks, err := h.teamKnowledgeSearcher.SearchByTeam(ctx, team.ID, query, 15)
		if err != nil {
			log.Warn("Team RAG search failed", "query", query, "error", err)
			continue
		}
		for _, chunk := range chunks {
			if !selectedSet[chunk.SourceID.String()] {
				continue
			}
			chunkKey := chunk.SourceID.String() + "-" + fmt.Sprintf("%d", *chunk.ChunkIndex)
			if seenChunks[chunkKey] {
				continue
			}
			seenChunks[chunkKey] = true
			*ragContext = append(*ragContext, service.RAGChunkInput{
				ChunkID:         chunk.ID,
				SourceID:        chunk.SourceID.String(),
				SourceName:      chunk.SourceName,
				Content:         chunk.Content,
				ChunkIndex:      int(*chunk.ChunkIndex),
				SimilarityScore: chunk.SimilarityScore,
				Scope:           "team",
			})
		}
	}
}

func (h *OutlineHandler) generateWithConstraintRetry(
	ctx context.Context,
	job *entity.GenerationJob,
	aiProvider service.AIProvider,
	outlineRequest service.GenerateOutlineRequest,
	knowledgeScope *valueobject.KnowledgeScope,
	log Logger,
) (*service.GenerateOutlineResult, []valueobject.ConstraintViolation) {
	const maxConstraintRetries = 2
	var outlineResult *service.GenerateOutlineResult
	var lastViolations []valueobject.ConstraintViolation

	for attempt := 0; attempt <= maxConstraintRetries; attempt++ {
		if attempt > 0 {
			log.Info("[AI.Constraints] Retrying outline generation after constraint violations",
				"attempt", attempt+1,
				"maxAttempts", maxConstraintRetries+1,
			)
			outlineRequest.AdditionalContext = BuildConstraintRetryContext(
				outlineRequest.AdditionalContext,
				lastViolations,
				outlineRequest.Constraints,
			)
		}

		var genErr error
		outlineResult, genErr = aiProvider.GenerateCourseOutline(ctx, outlineRequest)
		if genErr != nil {
			log.Error("AI outline generation failed", "error", genErr, "attempt", attempt+1)
			return nil, nil
		}

		// Validate constraints
		if outlineRequest.Constraints == nil || knowledgeScope == nil {
			break
		}

		constraints, _ := valueobject.CalculateCourseConstraints(
			knowledgeScope,
			outlineRequest.InternalDataOnly,
			valueobject.DefaultConstraintsConfig(),
		)
		if constraints == nil {
			break
		}

		sectionCount := len(outlineResult.Sections)
		totalLessons := 0
		lessonCountsPerSection := make([]int, sectionCount)
		for i, section := range outlineResult.Sections {
			lessonCountsPerSection[i] = len(section.Lessons)
			totalLessons += len(section.Lessons)
		}

		lastViolations = constraints.Validate(sectionCount, totalLessons, lessonCountsPerSection)
		if len(lastViolations) == 0 {
			log.Info("[AI.Constraints] Generated outline passes all constraints",
				"sectionCount", sectionCount,
				"totalLessons", totalLessons,
			)
			break
		}

		log.Warn("[AI.Constraints] Generated outline violates constraints",
			"violations", len(lastViolations),
			"sectionCount", sectionCount,
			"totalLessons", totalLessons,
		)

		if attempt == maxConstraintRetries {
			log.Warn("[AI.Constraints] Max retries reached, proceeding with constraint violations")
		}
	}

	return outlineResult, lastViolations
}

func (h *OutlineHandler) calculateGroundingScores(outlineRequest service.GenerateOutlineRequest, outlineResult *service.GenerateOutlineResult, log Logger) []float32 {
	var sectionGroundingScores []float32

	if len(outlineRequest.RAGContext) > 0 {
		chunksPerSection := float32(len(outlineRequest.RAGContext)) / float32(len(outlineResult.Sections))
		for range outlineResult.Sections {
			var baseScore float32
			if outlineRequest.InternalDataOnly {
				baseScore = 0.5
			} else {
				baseScore = 0.3
			}
			score := baseScore + (chunksPerSection / 20.0)
			if score > 0.95 {
				score = 0.95
			}
			sectionGroundingScores = append(sectionGroundingScores, score)
		}
		log.Info("[AI.RAG] Calculated section grounding scores",
			"avgScore", func() float32 {
				var sum float32
				for _, s := range sectionGroundingScores {
					sum += s
				}
				return sum / float32(len(sectionGroundingScores))
			}(),
			"sectionCount", len(sectionGroundingScores),
		)
	} else {
		for range outlineResult.Sections {
			sectionGroundingScores = append(sectionGroundingScores, 0.0)
		}
	}

	return sectionGroundingScores
}

type sectionProvenance struct {
	ChunkIDs     []string          `json:"chunkIds"`
	SourceChunks []ProvenanceChunk `json:"sourceChunks"`
	TeamTokens   int32             `json:"teamTokens"`
	GlobalTokens int32             `json:"globalTokens"`
	CourseTokens int32             `json:"courseTokens"`
}

func (h *OutlineHandler) buildSectionProvenances(outlineRequest service.GenerateOutlineRequest, outlineResult *service.GenerateOutlineResult) []sectionProvenance {
	var sectionProvenances []sectionProvenance

	if len(outlineRequest.RAGContext) > 0 {
		chunksPerSection := len(outlineRequest.RAGContext) / len(outlineResult.Sections)
		if chunksPerSection < 1 {
			chunksPerSection = 1
		}
		for i := range outlineResult.Sections {
			start := i * chunksPerSection
			end := start + chunksPerSection
			if end > len(outlineRequest.RAGContext) {
				end = len(outlineRequest.RAGContext)
			}
			if i == len(outlineResult.Sections)-1 {
				end = len(outlineRequest.RAGContext)
			}

			prov := sectionProvenance{}
			for j := start; j < end && j < len(outlineRequest.RAGContext); j++ {
				chunk := outlineRequest.RAGContext[j]
				prov.ChunkIDs = append(prov.ChunkIDs, chunk.ChunkID)

				excerpt := chunk.Content
				if len(excerpt) > 200 {
					excerpt = excerpt[:200] + "..."
				}
				prov.SourceChunks = append(prov.SourceChunks, ProvenanceChunk{
					ChunkID:         chunk.ChunkID,
					SourceID:        chunk.SourceID,
					SourceName:      chunk.SourceName,
					Excerpt:         excerpt,
					SimilarityScore: chunk.SimilarityScore,
					Scope:           chunk.Scope,
				})

				tokenCount := int32(len(chunk.Content) / 4)
				switch chunk.Scope {
				case "team":
					prov.TeamTokens += tokenCount
				case "global":
					prov.GlobalTokens += tokenCount
				case "course":
					prov.CourseTokens += tokenCount
				}
			}
			sectionProvenances = append(sectionProvenances, prov)
		}
	} else {
		for range outlineResult.Sections {
			sectionProvenances = append(sectionProvenances, sectionProvenance{})
		}
	}

	return sectionProvenances
}

func (h *OutlineHandler) buildSections(outlineResult *service.GenerateOutlineResult, sectionGroundingScores []float32, sectionProvenances []sectionProvenance) ([]map[string]any, int) {
	sections := make([]map[string]any, 0, len(outlineResult.Sections))
	totalLessons := 0

	for sIdx, sectionResult := range outlineResult.Sections {
		sectionGrounding := sectionGroundingScores[sIdx]

		lessons := make([]map[string]any, 0, len(sectionResult.Lessons))
		for lIdx, lessonResult := range sectionResult.Lessons {
			lesson := map[string]any{
				"id":                       uuid.New().String(),
				"title":                    lessonResult.Title,
				"description":              lessonResult.Description,
				"order":                    lIdx + 1,
				"estimatedDurationMinutes": lessonResult.EstimatedDurationMinutes,
				"learningObjectives":       lessonResult.LearningObjectives,
				"isLastInSection":          lessonResult.IsLastInSection,
				"isLastInCourse":           lessonResult.IsLastInCourse,
				"groundingScore":           sectionGrounding,
			}
			lessons = append(lessons, lesson)
			totalLessons++
		}

		prov := sectionProvenances[sIdx]
		section := map[string]any{
			"id":                   uuid.New().String(),
			"title":                sectionResult.Title,
			"description":          sectionResult.Description,
			"order":                sIdx + 1,
			"lessons":              lessons,
			"level":                sectionResult.Level,
			"intent":               sectionResult.Intent,
			"emphasis":             sectionResult.Emphasis,
			"mappedOutcomeIndices": sectionResult.MappedOutcomeIndices,
			"groundingScore":       sectionGrounding,
			"contributingChunkIds": prov.ChunkIDs,
			"provenance": map[string]any{
				"sourceChunks": prov.SourceChunks,
				"teamTokens":   prov.TeamTokens,
				"globalTokens": prov.GlobalTokens,
				"courseTokens": prov.CourseTokens,
			},
		}
		sections = append(sections, section)
	}

	return sections, totalLessons
}

func (h *OutlineHandler) buildOutlineProvenance(sectionProvenances []sectionProvenance, sectionGroundingScores []float32, constraints *service.CourseConstraintsInput, violations []valueobject.ConstraintViolation) *OutlineProvenance {
	outlineProvenance := &OutlineProvenance{
		GeneratedAt:        time.Now().UTC(),
		ConstraintsApplied: constraints != nil,
		ConstraintsMet:     len(violations) == 0,
	}

	uniqueSources := make(map[string]bool)
	for _, prov := range sectionProvenances {
		outlineProvenance.TotalChunks += len(prov.ChunkIDs)
		outlineProvenance.TeamTokens += prov.TeamTokens
		outlineProvenance.GlobalTokens += prov.GlobalTokens
		outlineProvenance.CourseTokens += prov.CourseTokens
		for _, sc := range prov.SourceChunks {
			uniqueSources[sc.SourceID] = true
		}
	}
	outlineProvenance.TotalSources = len(uniqueSources)

	if len(sectionGroundingScores) > 0 {
		var sum float32
		for _, s := range sectionGroundingScores {
			sum += s
		}
		outlineProvenance.GroundingScore = sum / float32(len(sectionGroundingScores))
	}

	return outlineProvenance
}
