package content

import (
	"time"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

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

// TruncateExcerpt truncates content to maxLen characters, adding ellipsis if needed.
func TruncateExcerpt(content string, maxLen int) string {
	if len(content) <= maxLen {
		return content
	}
	return content[:maxLen-3] + "..."
}

// BuildComponentProvenance creates a ComponentProvenance from RAG chunks and search queries.
func BuildComponentProvenance(chunks []service.RAGChunkInput, queries []string) *ComponentProvenance {
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

// AggregateProvenance aggregates provenance from all components in a lesson.
func AggregateProvenance(components []LessonComponent) *LessonProvenance {
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
