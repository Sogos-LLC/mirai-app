package config

// RAGConfig holds RAG (Retrieval-Augmented Generation) configuration.
// Defines Top-K and minimum similarity thresholds per generation stage.
type RAGConfig struct {
	Stages         map[string]RAGStageConfig
	MaxTotalChunks int
}

// RAGStageConfig defines settings for a specific generation stage.
type RAGStageConfig struct {
	TopK          int
	MinSimilarity float32
	ScopeOrder    []string // Priority order for scopes: ["course", "team", "global"]
}

// DefaultRAGConfig returns the default RAG configuration.
// These values can be overridden via environment variables or database settings.
func DefaultRAGConfig() *RAGConfig {
	return &RAGConfig{
		MaxTotalChunks: 50,
		Stages: map[string]RAGStageConfig{
			"outcomes": {
				TopK:          20,
				MinSimilarity: 0.6,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"sme_persona": {
				TopK:          5,
				MinSimilarity: 0.65,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"audience_persona": {
				TopK:          10,
				MinSimilarity: 0.6,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"outline": {
				TopK:          30,
				MinSimilarity: 0.55,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"section": {
				TopK:          15,
				MinSimilarity: 0.6,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"lesson": {
				TopK:          10,
				MinSimilarity: 0.65,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"component_text": {
				TopK:          10,
				MinSimilarity: 0.6,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"component_quiz": {
				TopK:          15,
				MinSimilarity: 0.55,
				ScopeOrder:    []string{"course", "team", "global"},
			},
			"component_media": {
				TopK:          5,
				MinSimilarity: 0.7,
				ScopeOrder:    []string{"course", "team", "global"},
			},
		},
	}
}

// GetStageConfig returns the configuration for a specific stage.
// Falls back to default values if the stage is not found.
func (c *RAGConfig) GetStageConfig(stage string) RAGStageConfig {
	if cfg, ok := c.Stages[stage]; ok {
		return cfg
	}
	// Default fallback
	return RAGStageConfig{
		TopK:          10,
		MinSimilarity: 0.6,
		ScopeOrder:    []string{"course", "team", "global"},
	}
}
