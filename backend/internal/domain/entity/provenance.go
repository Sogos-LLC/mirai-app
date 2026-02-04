package entity

import (
	"time"

	"github.com/google/uuid"
)

// ProvenanceArtifactType identifies what type of artifact was generated.
type ProvenanceArtifactType string

const (
	ProvenanceArtifactTypeOutline   ProvenanceArtifactType = "outline"
	ProvenanceArtifactTypeSection   ProvenanceArtifactType = "section"
	ProvenanceArtifactTypeLesson    ProvenanceArtifactType = "lesson"
	ProvenanceArtifactTypeComponent ProvenanceArtifactType = "component"
)

// ChunkAttribution tracks which knowledge chunk contributed to an artifact.
type ChunkAttribution struct {
	ChunkID         string
	SourceID        uuid.UUID
	SourceName      string
	Scope           string  // "course", "team", "global"
	Excerpt         string  // Short excerpt showing what was used
	SimilarityScore float32 // Relevance score from vector search
	TokenCount      int32
}

// QueryRecord tracks a RAG query made during generation.
type QueryRecord struct {
	Query           string
	Stage           string    // "outline", "section", "lesson", etc.
	ChunksRetrieved int
	TopSimilarity   float32
	ExecutedAt      time.Time
}

// ProvenanceRecord tracks the lineage of a generated artifact.
// Enables enterprise audit requirements by recording exactly which
// knowledge sources contributed to each piece of generated content.
type ProvenanceRecord struct {
	ID           uuid.UUID
	ArtifactType ProvenanceArtifactType
	ArtifactID   string // The ID of the generated artifact (outline, section, lesson, component)

	// Which chunks contributed to this artifact
	ContributingChunks []ChunkAttribution

	// Queries made during generation
	Queries []QueryRecord

	// Token breakdown by source scope
	TeamTokens        int32
	GlobalTokens      int32
	CourseTokens      int32
	SynthesizedTokens int32 // Tokens not from knowledge sources

	// Grounding score (ratio of content from knowledge sources)
	GroundingScore float32

	// When this artifact was generated
	GeneratedAt time.Time

	// Hash of the prompt used (for reproducibility)
	PromptHash string
}

// NewProvenanceRecord creates a new provenance record for an artifact.
func NewProvenanceRecord(artifactType ProvenanceArtifactType, artifactID string) *ProvenanceRecord {
	return &ProvenanceRecord{
		ID:                 uuid.New(),
		ArtifactType:       artifactType,
		ArtifactID:         artifactID,
		ContributingChunks: make([]ChunkAttribution, 0),
		Queries:            make([]QueryRecord, 0),
		GeneratedAt:        time.Now().UTC(),
	}
}

// AddChunkAttribution records that a chunk contributed to this artifact.
func (pr *ProvenanceRecord) AddChunkAttribution(chunk ChunkAttribution) {
	pr.ContributingChunks = append(pr.ContributingChunks, chunk)

	// Update token counts by scope
	switch chunk.Scope {
	case "team":
		pr.TeamTokens += chunk.TokenCount
	case "global":
		pr.GlobalTokens += chunk.TokenCount
	case "course":
		pr.CourseTokens += chunk.TokenCount
	}
}

// AddQuery records a RAG query made during generation.
func (pr *ProvenanceRecord) AddQuery(query QueryRecord) {
	pr.Queries = append(pr.Queries, query)
}

// SetSynthesizedTokens sets the count of tokens not from knowledge sources.
func (pr *ProvenanceRecord) SetSynthesizedTokens(tokens int32) {
	pr.SynthesizedTokens = tokens
	pr.calculateGroundingScore()
}

// calculateGroundingScore computes the ratio of grounded content.
func (pr *ProvenanceRecord) calculateGroundingScore() {
	totalGrounded := pr.TeamTokens + pr.GlobalTokens + pr.CourseTokens
	total := totalGrounded + pr.SynthesizedTokens

	if total == 0 {
		pr.GroundingScore = 0
		return
	}

	pr.GroundingScore = float32(totalGrounded) / float32(total)
}

// TotalGroundedTokens returns the sum of tokens from knowledge sources.
func (pr *ProvenanceRecord) TotalGroundedTokens() int32 {
	return pr.TeamTokens + pr.GlobalTokens + pr.CourseTokens
}

// TotalTokens returns all tokens (grounded + synthesized).
func (pr *ProvenanceRecord) TotalTokens() int32 {
	return pr.TotalGroundedTokens() + pr.SynthesizedTokens
}

// UniqueSourceIDs returns deduplicated source IDs that contributed.
func (pr *ProvenanceRecord) UniqueSourceIDs() []uuid.UUID {
	seen := make(map[uuid.UUID]struct{})
	result := make([]uuid.UUID, 0)

	for _, chunk := range pr.ContributingChunks {
		if _, exists := seen[chunk.SourceID]; !exists {
			seen[chunk.SourceID] = struct{}{}
			result = append(result, chunk.SourceID)
		}
	}

	return result
}

// SourceContribution returns token counts per source.
func (pr *ProvenanceRecord) SourceContribution() map[uuid.UUID]int32 {
	result := make(map[uuid.UUID]int32)
	for _, chunk := range pr.ContributingChunks {
		result[chunk.SourceID] += chunk.TokenCount
	}
	return result
}
