package gemini

func improvedTitleSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"improved_title": map[string]any{
				"type":        "string",
				"description": "A polished, professional course title that is clear, engaging, and accurately represents the content.",
			},
			"description": map[string]any{
				"type":        "string",
				"description": "A compelling 2-3 sentence description of the course that highlights what learners will gain.",
			},
		},
		"required": []string{"improved_title", "description"},
	}
}

func courseOutcomesSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"outcomes": map[string]any{
				"type":        "string",
				"description": "A formatted list of 3-5 learning outcomes as bullet points, each starting with an action verb.",
			},
		},
		"required": []string{"outcomes"},
	}
}

func smePersonasSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"personas": map[string]any{
				"type": "array", "description": "3 diverse SME personas with different expertise angles",
				"minItems": 3, "maxItems": 3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":          map[string]any{"type": "string", "description": "Unique identifier (e.g., 'sme-1', 'sme-2', 'sme-3')"},
						"job_title":   map[string]any{"type": "string", "description": "Professional job title"},
						"description": map[string]any{"type": "string", "description": "2-3 sentence background describing their expertise"},
						"skills":      map[string]any{"type": "array", "description": "3-5 key skills", "items": map[string]any{"type": "string"}},
						"voice":       map[string]any{"type": "string", "description": "Their teaching voice/style"},
					},
					"required": []string{"id", "job_title", "description", "skills", "voice"},
				},
			},
		},
		"required": []string{"personas"},
	}
}

func audiencePersonasSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"personas": map[string]any{
				"type": "array", "description": "3 diverse audience personas representing different learner profiles",
				"minItems": 3, "maxItems": 3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":          map[string]any{"type": "string", "description": "Unique identifier"},
						"name":        map[string]any{"type": "string", "description": "A representative name for this persona"},
						"role":        map[string]any{"type": "string", "description": "Their current job role"},
						"description": map[string]any{"type": "string", "description": "2-3 sentence description of their background"},
						"goals":       map[string]any{"type": "array", "description": "2-4 learning goals", "items": map[string]any{"type": "string"}},
					},
					"required": []string{"id", "name", "role", "description", "goals"},
				},
			},
		},
		"required": []string{"personas"},
	}
}

func toneOptionsSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"options": map[string]any{
				"type": "array", "description": "3 distinct tone/style options for the course",
				"minItems": 3, "maxItems": 3,
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":              map[string]any{"type": "string", "description": "Unique identifier"},
						"name":            map[string]any{"type": "string", "description": "Short name for this tone"},
						"description":     map[string]any{"type": "string", "description": "2-3 sentence description of the tone"},
						"level_of_detail": map[string]any{"type": "string", "enum": []string{"brief", "moderate", "comprehensive"}, "description": "The depth of content coverage"},
					},
					"required": []string{"id", "name", "description", "level_of_detail"},
				},
			},
		},
		"required": []string{"options"},
	}
}
