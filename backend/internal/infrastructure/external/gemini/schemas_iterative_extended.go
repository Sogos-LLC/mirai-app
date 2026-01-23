package gemini

func singleQuoteSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"text": map[string]any{
				"type":        "string",
				"description": "The quote text (1-3 sentences)",
			},
			"attribution": map[string]any{
				"type":        "string",
				"description": "Who said it - name, title, or source",
			},
		},
		"required": []string{"text", "attribution"},
	}
}

func singleListSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"style": map[string]any{
				"type":        "string",
				"enum":        []string{"bulleted", "numbered", "icon", "process", "accordion"},
				"description": "List style: bulleted (unordered), numbered (sequences), icon (with emojis), process (step-by-step), accordion (expandable - great for learning UX)",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Optional title above the list",
			},
			"items": map[string]any{
				"type":        "array",
				"description": "List items (3-7 items recommended)",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"text": map[string]any{
							"type":        "string",
							"description": "The list item text (for accordion: the collapsed header)",
						},
						"description": map[string]any{
							"type":        "string",
							"description": "Optional description (required for accordion style - shows when expanded)",
						},
					},
					"required": []string{"text"},
				},
			},
		},
		"required": []string{"style", "items"},
	}
}

func singleGallerySchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"style": map[string]any{
				"type":        "string",
				"enum":        []string{"carousel", "labeled_graphic"},
				"description": "Gallery style: carousel for slideshow, labeled_graphic for annotated image",
			},
			"images": map[string]any{
				"type":        "array",
				"description": "Images in the gallery (2-5 images)",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"description": map[string]any{
							"type":        "string",
							"description": "Detailed image description for AI generation",
						},
						"alt_text": map[string]any{
							"type":        "string",
							"description": "Accessibility alt text",
						},
						"caption": map[string]any{
							"type":        "string",
							"description": "Optional caption below image",
						},
					},
					"required": []string{"description", "alt_text"},
				},
			},
		},
		"required": []string{"style", "images"},
	}
}

func singleMultimediaSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"media_type": map[string]any{
				"type":        "string",
				"enum":        []string{"video", "audio"},
				"description": "Type of media content",
			},
			"description": map[string]any{
				"type":        "string",
				"description": "What the video/audio should show or explain",
			},
			"caption": map[string]any{
				"type":        "string",
				"description": "Optional caption or transcript hint",
			},
		},
		"required": []string{"media_type", "description"},
	}
}

func singleChartSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"chart_type": map[string]any{
				"type":        "string",
				"enum":        []string{"bar", "line", "pie", "table"},
				"description": "Type of data visualization",
			},
			"title": map[string]any{
				"type":        "string",
				"description": "Chart title",
			},
			"labels": map[string]any{
				"type":        "array",
				"description": "Data labels (categories, x-axis values)",
				"items": map[string]any{
					"type": "string",
				},
			},
			"values": map[string]any{
				"type":        "array",
				"description": "Data values corresponding to labels",
				"items": map[string]any{
					"type": "number",
				},
			},
		},
		"required": []string{"chart_type", "title", "labels", "values"},
	}
}

func singleDividerSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"style": map[string]any{
				"type":        "string",
				"enum":        []string{"line", "dots", "space"},
				"description": "Divider style",
			},
		},
		"required": []string{},
	}
}
