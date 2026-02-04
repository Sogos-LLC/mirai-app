package service

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/config"
)

// RAGSearcher abstracts vector search operations for the RAG pipeline.
type RAGSearcher interface {
	SearchKnowledge(ctx context.Context, courseID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
}

// StageResult contains the results of a RAG retrieval for a specific stage.
type StageResult struct {
	Stage           string
	Chunks          []domainservice.RAGChunkInput
	Queries         []entity.QueryRecord
	TotalTokens     int32
	HighestSimilar  float32
}

// StagedRAGPipeline provides composable RAG retrieval with provenance tracking.
type StagedRAGPipeline struct {
	searcher      RAGSearcher
	config        *config.RAGConfig
	logger        domainservice.Logger
	selectedDocIDs map[string]bool // Filter to only selected sources
}

// NewStagedRAGPipeline creates a new RAG pipeline.
func NewStagedRAGPipeline(
	searcher RAGSearcher,
	ragConfig *config.RAGConfig,
	logger domainservice.Logger,
) *StagedRAGPipeline {
	if ragConfig == nil {
		ragConfig = config.DefaultRAGConfig()
	}
	return &StagedRAGPipeline{
		searcher:       searcher,
		config:         ragConfig,
		logger:         logger,
		selectedDocIDs: make(map[string]bool),
	}
}

// WithSelectedDocs filters retrieval to only specified document IDs.
func (p *StagedRAGPipeline) WithSelectedDocs(docIDs []string) *StagedRAGPipeline {
	p.selectedDocIDs = make(map[string]bool, len(docIDs))
	for _, id := range docIDs {
		p.selectedDocIDs[id] = true
	}
	return p
}

// RetrieveForStage retrieves chunks for a specific generation stage.
func (p *StagedRAGPipeline) RetrieveForStage(
	ctx context.Context,
	courseID uuid.UUID,
	stage string,
	queries []string,
) (*StageResult, error) {
	stageConfig := p.config.GetStageConfig(stage)

	result := &StageResult{
		Stage:   stage,
		Chunks:  make([]domainservice.RAGChunkInput, 0),
		Queries: make([]entity.QueryRecord, 0),
	}

	seenChunks := make(map[string]bool)
	chunksPerQuery := stageConfig.TopK / max(len(queries), 1)

	for _, query := range queries {
		queryStart := time.Now()
		chunks, err := p.searcher.SearchKnowledge(ctx, courseID, query, chunksPerQuery)
		if err != nil {
			p.logger.Warn("RAG search failed", "stage", stage, "query", query, "error", err)
			continue
		}

		// Track query
		queryRecord := entity.QueryRecord{
			Query:           query,
			Stage:           stage,
			ChunksRetrieved: 0,
			ExecutedAt:      queryStart,
		}

		for _, chunk := range chunks {
			// Filter to selected documents if specified
			if len(p.selectedDocIDs) > 0 && !p.selectedDocIDs[chunk.SourceID.String()] {
				continue
			}

			// Filter by similarity threshold
			if chunk.SimilarityScore < stageConfig.MinSimilarity {
				continue
			}

			// Deduplicate
			if seenChunks[chunk.ID] {
				continue
			}
			seenChunks[chunk.ID] = true

			ragChunk := domainservice.RAGChunkInput{
				ChunkID:         chunk.ID,
				SourceID:        chunk.SourceID.String(),
				SourceName:      chunk.SourceName,
				Content:         chunk.Content,
				SimilarityScore: chunk.SimilarityScore,
				Scope:           "course",
			}
			if chunk.ChunkIndex != nil {
				ragChunk.ChunkIndex = int(*chunk.ChunkIndex)
			}

			result.Chunks = append(result.Chunks, ragChunk)
			queryRecord.ChunksRetrieved++

			if chunk.SimilarityScore > result.HighestSimilar {
				result.HighestSimilar = chunk.SimilarityScore
			}
		}

		if queryRecord.ChunksRetrieved > 0 {
			queryRecord.TopSimilarity = result.HighestSimilar
		}
		result.Queries = append(result.Queries, queryRecord)
	}

	// Enforce max total chunks
	if len(result.Chunks) > p.config.MaxTotalChunks {
		result.Chunks = result.Chunks[:p.config.MaxTotalChunks]
	}

	return result, nil
}

// RetrieveForOutline retrieves chunks optimized for outline generation.
func (p *StagedRAGPipeline) RetrieveForOutline(
	ctx context.Context,
	courseID uuid.UUID,
	title string,
	desiredOutcome string,
	additionalContext string,
) (*StageResult, error) {
	queries := []string{title, desiredOutcome}
	if additionalContext != "" {
		queries = append(queries, additionalContext)
	}
	return p.RetrieveForStage(ctx, courseID, "outline", queries)
}

// RetrieveForSection retrieves chunks for a specific section.
func (p *StagedRAGPipeline) RetrieveForSection(
	ctx context.Context,
	courseID uuid.UUID,
	sectionTitle string,
	sectionDescription string,
) (*StageResult, error) {
	queries := []string{sectionTitle}
	if sectionDescription != "" {
		queries = append(queries, sectionDescription)
	}
	return p.RetrieveForStage(ctx, courseID, "section", queries)
}

// RetrieveForLesson retrieves chunks for a specific lesson.
func (p *StagedRAGPipeline) RetrieveForLesson(
	ctx context.Context,
	courseID uuid.UUID,
	lessonTitle string,
	objectives []string,
) (*StageResult, error) {
	queries := []string{lessonTitle}
	queries = append(queries, objectives...)
	return p.RetrieveForStage(ctx, courseID, "lesson", queries)
}

// BuildProvenanceRecord creates a provenance record from stage results.
func (p *StagedRAGPipeline) BuildProvenanceRecord(
	stageResult *StageResult,
	artifactType entity.ProvenanceArtifactType,
	artifactID string,
) *entity.ProvenanceRecord {
	record := entity.NewProvenanceRecord(artifactType, artifactID)

	for _, chunk := range stageResult.Chunks {
		sourceID, _ := uuid.Parse(chunk.SourceID)
		attribution := entity.ChunkAttribution{
			ChunkID:         chunk.ChunkID,
			SourceID:        sourceID,
			SourceName:      chunk.SourceName,
			Scope:           chunk.Scope,
			SimilarityScore: chunk.SimilarityScore,
			// Token count would be estimated from content length
			TokenCount: int32(len(chunk.Content) / 4), // Rough estimate: 4 chars per token
		}

		// Create excerpt (first 100 chars)
		if len(chunk.Content) > 100 {
			attribution.Excerpt = chunk.Content[:100] + "..."
		} else {
			attribution.Excerpt = chunk.Content
		}

		record.AddChunkAttribution(attribution)
	}

	record.Queries = stageResult.Queries
	return record
}

// BuildKnowledgeScope creates a KnowledgeScope from knowledge sources.
func BuildKnowledgeScope(
	sources []*entity.KnowledgeSource,
	selectedIDs []string,
	lockedByUser uuid.UUID,
) (*valueobject.KnowledgeScope, error) {
	selectedSet := make(map[string]bool, len(selectedIDs))
	for _, id := range selectedIDs {
		selectedSet[id] = true
	}

	summaries := make([]valueobject.KnowledgeSourceSummary, 0)
	for _, src := range sources {
		if len(selectedSet) > 0 && !selectedSet[src.ID.String()] {
			continue
		}

		summary := valueobject.KnowledgeSourceSummary{
			ID:         src.ID,
			Name:       src.Name,
			ChunkCount: src.ChunkCount,
		}

		// Determine scope
		if src.TeamID != nil {
			summary.Scope = valueobject.KnowledgeSourceScopeTeam
		} else if src.CourseID != nil {
			summary.Scope = valueobject.KnowledgeSourceScopeCourse
		} else {
			summary.Scope = valueobject.KnowledgeSourceScopeGlobal
		}

		// Copy from DocumentIndex if available
		if src.DocumentIndex != nil {
			summary.EstimatedLessonCount = src.DocumentIndex.EstimatedLessonCount
			summary.ContentDepth = src.DocumentIndex.ContentDepth
			summary.MainTopics = src.DocumentIndex.MainTopics
			summary.KeyConcepts = src.DocumentIndex.KeyConcepts
		}

		// Use token count if available
		if src.TokenCount != nil {
			summary.TokenCount = *src.TokenCount
		}

		summaries = append(summaries, summary)
	}

	if len(summaries) == 0 {
		return nil, nil // No sources selected
	}

	return valueobject.NewKnowledgeScope(summaries, lockedByUser)
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
