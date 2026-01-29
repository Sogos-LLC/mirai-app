package gemini

// componentPlanSchema returns a simple schema for planning lesson components.
func componentPlanSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"components": map[string]any{
				"type":        "array",
				"description": "Planned components for this lesson (5-8 components)",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"component_type": map[string]any{
							"type": "string",
							"enum": []string{
								"text", "heading", "image", "quiz", "code",
								"callout", "statement", "quote", "list",
								"gallery", "multimedia", "chart", "divider",
							},
							"description": "The type of component",
						},
						"purpose": map[string]any{
							"type":        "string",
							"description": "Brief description of what this component will contain (1-2 sentences)",
						},
					},
					"required": []string{"component_type", "purpose"},
				},
			},
		},
		"required": []string{"components"},
	}
}

// singleComponentSchema returns the schema for generating a single component.
func singleComponentSchema(componentType string) map[string]any {
	switch componentType {
	case "text":
		return singleTextSchema()
	case "heading":
		return singleHeadingSchema()
	case "image":
		return singleImageSchema()
	case "quiz":
		return singleQuizSchema()
	case "code":
		return singleCodeSchema()
	case "callout":
		return singleCalloutSchema()
	case "statement":
		return singleStatementSchema()
	case "quote":
		return singleQuoteSchema()
	case "list":
		return singleListSchema()
	case "gallery":
		return singleGallerySchema()
	case "multimedia":
		return singleMultimediaSchema()
	case "chart":
		return singleChartSchema()
	case "divider":
		return singleDividerSchema()
	default:
		return singleTextSchema()
	}
}

func singleTextSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"text_html": map[string]any{
				"type":        "string",
				"description": "HTML-formatted rich text content (2-4 paragraphs with <p> tags, can include <strong>, <em>, <ul>, <li>)",
			},
		},
		"required": []string{"text_html"},
	}
}

func singleHeadingSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"heading_level": map[string]any{
				"type":        "integer",
				"minimum":     1,
				"maximum":     4,
				"description": "Heading level (2 for main sections, 3 for subsections)",
			},
			"heading_text": map[string]any{
				"type":        "string",
				"description": "The heading text",
			},
		},
		"required": []string{"heading_level", "heading_text"},
	}
}

func singleImageSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"image_description": map[string]any{
				"type":        "string",
				"description": "Detailed description of what image should show (for later generation/selection)",
			},
			"image_alt_text": map[string]any{
				"type":        "string",
				"description": "Accessibility alt text for the image",
			},
			"image_caption": map[string]any{
				"type":        "string",
				"description": "Optional caption to display below the image",
			},
		},
		"required": []string{"image_description", "image_alt_text"},
	}
}

func singleQuizSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"quiz_question": map[string]any{
				"type":        "string",
				"description": "The quiz question text",
			},
			"quiz_options": map[string]any{
				"type":        "array",
				"description": "2-4 answer options",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id":   map[string]any{"type": "string", "description": "Option ID (a, b, c, or d)"},
						"text": map[string]any{"type": "string", "description": "Option text"},
					},
					"required": []string{"id", "text"},
				},
				"minItems": 2,
				"maxItems": 4,
			},
			"quiz_correct_answer_id": map[string]any{
				"type":        "string",
				"description": "ID of the correct answer",
			},
			"quiz_explanation": map[string]any{
				"type":        "string",
				"description": "Explanation of why the correct answer is right",
			},
		},
		"required": []string{"quiz_question", "quiz_options", "quiz_correct_answer_id", "quiz_explanation"},
	}
}

func segueSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"segue_text": map[string]any{
				"type":        "string",
				"description": "Transition text to the next lesson (1-2 sentences)",
			},
		},
		"required": []string{"segue_text"},
	}
}

func singleCodeSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"code": map[string]any{
				"type":        "string",
				"description": "Code snippet (5-15 lines, relevant to the lesson)",
			},
			"language": map[string]any{
				"type":        "string",
				"description": "Programming language (javascript, python, go, html, css, sql, bash, etc.)",
			},
		},
		"required": []string{"code", "language"},
	}
}

func singleCalloutSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"style": map[string]any{
				"type":        "string",
				"enum":        []string{"info", "warning", "success", "error", "tip"},
				"description": "Visual style of the callout",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Optional short title for the callout",
			},
			"content": map[string]any{
				"type":        "string",
				"description": "Callout message (1-2 sentences of important information)",
			},
		},
		"required": []string{"style", "content"},
	}
}

func singleStatementSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"statement_text": map[string]any{
				"type":        "string",
				"description": "The key takeaway or principle (1-2 sentences max). This should be a memorable 'golden nugget' learners remember.",
			},
			"statement_subtext": map[string]any{
				"type":        "string",
				"description": "Optional brief supporting context (1 sentence max)",
			},
		},
		"required": []string{"statement_text"},
	}
}
