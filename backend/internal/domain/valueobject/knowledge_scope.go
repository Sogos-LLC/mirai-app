package valueobject

import (
	"fmt"
	"time"

	"github.com/google/uuid"
)

// KnowledgeSourceScope defines where a knowledge source is available.
type KnowledgeSourceScope string

const (
	KnowledgeSourceScopeCourse KnowledgeSourceScope = "course"
	KnowledgeSourceScopeTeam   KnowledgeSourceScope = "team"
	KnowledgeSourceScopeGlobal KnowledgeSourceScope = "global"
)

func (s KnowledgeSourceScope) String() string {
	return string(s)
}

func (s KnowledgeSourceScope) IsValid() bool {
	switch s {
	case KnowledgeSourceScopeCourse, KnowledgeSourceScopeTeam, KnowledgeSourceScopeGlobal:
		return true
	}
	return false
}

func ParseKnowledgeSourceScope(str string) (KnowledgeSourceScope, error) {
	s := KnowledgeSourceScope(str)
	if !s.IsValid() {
		return "", fmt.Errorf("invalid knowledge source scope: %s", str)
	}
	return s, nil
}

// KnowledgeSourceSummary provides aggregate metrics for a single knowledge source.
// Used within KnowledgeScope to track what material is available for course generation.
type KnowledgeSourceSummary struct {
	ID                   uuid.UUID
	Name                 string
	Scope                KnowledgeSourceScope
	TokenCount           int32
	ChunkCount           int32
	EstimatedLessonCount int
	ContentDepth         string   // "basic", "intermediate", "advanced"
	MainTopics           []string // Major sections/topics found in the document
	KeyConcepts          []string // Important terms and concepts
}

// KnowledgeScope is an immutable value object holding selected knowledge sources
// with aggregate metrics. Once locked, the scope cannot be modified, ensuring
// deterministic constraint calculation throughout the generation process.
type KnowledgeScope struct {
	sources      []KnowledgeSourceSummary
	lockedAt     time.Time
	lockedByUser uuid.UUID

	// Cached aggregates (computed once at construction)
	totalTokens           int32
	totalChunks           int32
	estimatedTotalLessons int
	scopeBreakdown        map[KnowledgeSourceScope]int32
	allTopics             []string
	allConcepts           []string
}

// NewKnowledgeScope creates a new immutable KnowledgeScope.
// All aggregate metrics are computed and cached at construction time.
func NewKnowledgeScope(sources []KnowledgeSourceSummary, lockedByUser uuid.UUID) (*KnowledgeScope, error) {
	if len(sources) == 0 {
		return nil, fmt.Errorf("knowledge scope must have at least one source")
	}

	ks := &KnowledgeScope{
		sources:        make([]KnowledgeSourceSummary, len(sources)),
		lockedAt:       time.Now().UTC(),
		lockedByUser:   lockedByUser,
		scopeBreakdown: make(map[KnowledgeSourceScope]int32),
	}

	// Copy sources to prevent external mutation
	copy(ks.sources, sources)

	// Compute aggregates
	topicsSet := make(map[string]struct{})
	conceptsSet := make(map[string]struct{})

	for _, src := range ks.sources {
		ks.totalTokens += src.TokenCount
		ks.totalChunks += src.ChunkCount
		ks.estimatedTotalLessons += src.EstimatedLessonCount
		ks.scopeBreakdown[src.Scope] += src.TokenCount

		for _, topic := range src.MainTopics {
			topicsSet[topic] = struct{}{}
		}
		for _, concept := range src.KeyConcepts {
			conceptsSet[concept] = struct{}{}
		}
	}

	// Convert sets to slices
	ks.allTopics = make([]string, 0, len(topicsSet))
	for topic := range topicsSet {
		ks.allTopics = append(ks.allTopics, topic)
	}

	ks.allConcepts = make([]string, 0, len(conceptsSet))
	for concept := range conceptsSet {
		ks.allConcepts = append(ks.allConcepts, concept)
	}

	return ks, nil
}

// SourceIDs returns the IDs of all knowledge sources in this scope.
func (ks *KnowledgeScope) SourceIDs() []uuid.UUID {
	ids := make([]uuid.UUID, len(ks.sources))
	for i, src := range ks.sources {
		ids[i] = src.ID
	}
	return ids
}

// Sources returns a copy of all knowledge source summaries.
func (ks *KnowledgeScope) Sources() []KnowledgeSourceSummary {
	result := make([]KnowledgeSourceSummary, len(ks.sources))
	copy(result, ks.sources)
	return result
}

// SourceCount returns the number of knowledge sources.
func (ks *KnowledgeScope) SourceCount() int {
	return len(ks.sources)
}

// TotalTokens returns the total token count across all sources.
func (ks *KnowledgeScope) TotalTokens() int32 {
	return ks.totalTokens
}

// TotalChunks returns the total chunk count across all sources.
func (ks *KnowledgeScope) TotalChunks() int32 {
	return ks.totalChunks
}

// EstimatedTotalLessons returns the estimated total lessons based on document indices.
func (ks *KnowledgeScope) EstimatedTotalLessons() int {
	return ks.estimatedTotalLessons
}

// ScopeBreakdown returns token counts grouped by source scope.
func (ks *KnowledgeScope) ScopeBreakdown() map[KnowledgeSourceScope]int32 {
	// Return a copy to prevent mutation
	result := make(map[KnowledgeSourceScope]int32, len(ks.scopeBreakdown))
	for k, v := range ks.scopeBreakdown {
		result[k] = v
	}
	return result
}

// AllTopics returns all unique topics across all sources.
func (ks *KnowledgeScope) AllTopics() []string {
	result := make([]string, len(ks.allTopics))
	copy(result, ks.allTopics)
	return result
}

// AllConcepts returns all unique concepts across all sources.
func (ks *KnowledgeScope) AllConcepts() []string {
	result := make([]string, len(ks.allConcepts))
	copy(result, ks.allConcepts)
	return result
}

// LockedAt returns when this scope was locked.
func (ks *KnowledgeScope) LockedAt() time.Time {
	return ks.lockedAt
}

// LockedByUser returns the user who locked this scope.
func (ks *KnowledgeScope) LockedByUser() uuid.UUID {
	return ks.lockedByUser
}

// HasScope returns true if any sources are from the given scope.
func (ks *KnowledgeScope) HasScope(scope KnowledgeSourceScope) bool {
	_, exists := ks.scopeBreakdown[scope]
	return exists && ks.scopeBreakdown[scope] > 0
}

// TokensForScope returns the total tokens for a specific scope.
func (ks *KnowledgeScope) TokensForScope(scope KnowledgeSourceScope) int32 {
	return ks.scopeBreakdown[scope]
}

// PrimaryContentDepth returns the most common content depth across sources.
// Returns "intermediate" as default if no sources have depth specified.
func (ks *KnowledgeScope) PrimaryContentDepth() string {
	depthCounts := make(map[string]int)
	for _, src := range ks.sources {
		if src.ContentDepth != "" {
			depthCounts[src.ContentDepth]++
		}
	}

	if len(depthCounts) == 0 {
		return "intermediate"
	}

	maxCount := 0
	primaryDepth := "intermediate"
	for depth, count := range depthCounts {
		if count > maxCount {
			maxCount = count
			primaryDepth = depth
		}
	}
	return primaryDepth
}
