package gemini

// sectionsOnlySchema returns a flat schema for the first call - sections with lesson titles only
func sectionsOnlySchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"sections": map[string]any{
				"type":        "array",
				"description": "Course sections in logical order",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title":       map[string]any{"type": "string", "description": "Section title"},
						"description": map[string]any{"type": "string", "description": "Brief description of what this section covers"},
						"lesson_titles": map[string]any{
							"type":        "array",
							"description": "Lesson titles for this section (2-5 lessons)",
							"items":       map[string]any{"type": "string"},
						},
						"level": map[string]any{
							"type":        "string",
							"description": "Learning level for this section",
							"enum":        []string{"introduce", "develop", "master"},
						},
						"intent": map[string]any{
							"type":        "string",
							"description": "Primary purpose of this section",
							"enum":        []string{"teach", "assess", "reinforce"},
						},
						"emphasis": map[string]any{
							"type":        "string",
							"description": "Relative importance of this section",
							"enum":        []string{"low", "medium", "high"},
						},
						"mapped_outcome_indices": map[string]any{
							"type":        "array",
							"description": "Zero-based indices of course outcomes this section addresses",
							"items":       map[string]any{"type": "integer"},
						},
					},
					"required": []string{"title", "description", "lesson_titles", "level", "intent", "emphasis", "mapped_outcome_indices"},
				},
			},
		},
		"required": []string{"sections"},
	}
}

// sectionLessonsSchema returns a schema for generating detailed lessons for a single section
func sectionLessonsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"lessons": map[string]any{
				"type":        "array",
				"description": "Detailed lessons for this section",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"title":                      map[string]any{"type": "string", "description": "Lesson title"},
						"description":                map[string]any{"type": "string", "description": "Brief description of the lesson content"},
						"estimated_duration_minutes": map[string]any{"type": "integer", "description": "Estimated time to complete the lesson in minutes"},
						"learning_objectives": map[string]any{
							"type":        "array",
							"description": "Specific learning objectives for this lesson",
							"items":       map[string]any{"type": "string"},
						},
					},
					"required": []string{"title", "description", "estimated_duration_minutes", "learning_objectives"},
				},
			},
		},
		"required": []string{"lessons"},
	}
}

// smeProcessingSchema returns the schema for SME content processing
func smeProcessingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"summary": map[string]any{"type": "string", "description": "A comprehensive summary of the knowledge content"},
			"chunks": map[string]any{
				"type":        "array",
				"description": "Distilled knowledge chunks",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"content":         map[string]any{"type": "string", "description": "The knowledge content"},
						"topic":           map[string]any{"type": "string", "description": "Topic category for this chunk"},
						"keywords":        map[string]any{"type": "array", "description": "Keywords for this chunk", "items": map[string]any{"type": "string"}},
						"relevance_score": map[string]any{"type": "number", "description": "Relevance score from 0 to 1", "minimum": 0, "maximum": 1},
					},
					"required": []string{"content", "topic", "keywords", "relevance_score"},
				},
			},
		},
		"required": []string{"summary", "chunks"},
	}
}
