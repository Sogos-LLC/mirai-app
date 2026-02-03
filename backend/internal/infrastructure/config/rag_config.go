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
			},
			"sme_persona": {
				TopK:          5,
				MinSimilarity: 0.65,
			},
			"audience_persona": {
				TopK:          10,
				MinSimilarity: 0.6,
			},
			"outline": {
				TopK:          30,
				MinSimilarity: 0.55,
			},
			"section": {
				TopK:          15,
				MinSimilarity: 0.6,
			},
			"lesson": {
				TopK:          10,
				MinSimilarity: 0.65,
			},
			"component_text": {
				TopK:          10,
				MinSimilarity: 0.6,
			},
			"component_quiz": {
				TopK:          15,
				MinSimilarity: 0.55,
			},
			"component_media": {
				TopK:          5,
				MinSimilarity: 0.7,
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
	}
}
