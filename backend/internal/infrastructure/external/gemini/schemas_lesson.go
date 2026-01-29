package gemini

// lessonContentSchema returns the schema for full lesson content generation (legacy).
func lessonContentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"components": map[string]any{
				"type":        "array",
				"description": "Lesson content components in order. Each component has a type and type-specific fields.",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						// Discriminator field
						"component_type": map[string]any{
							"type":        "string",
							"enum":        []string{"text", "heading", "image", "quiz", "code", "callout", "statement"},
							"description": "The type of component. Determines which other fields are used.",
						},
						// Text component fields (used when component_type = "text")
						"text_html": map[string]any{
							"type":        "string",
							"description": "For text components: HTML-formatted rich text content with paragraphs, lists, emphasis, etc.",
						},
						// Heading component fields (used when component_type = "heading")
						"heading_level": map[string]any{
							"type":        "integer",
							"minimum":     1,
							"maximum":     4,
							"description": "For heading components: Heading level (1=largest, 4=smallest). Use 2 for section titles, 3 for subsections.",
						},
						"heading_text": map[string]any{
							"type":        "string",
							"description": "For heading components: The heading text.",
						},
						// Image component fields (used when component_type = "image")
						"image_description": map[string]any{
							"type":        "string",
							"description": "For image components: Detailed description of what image should be displayed (e.g. 'A diagram showing the water circulation system in a hot tub'). This will be used to find or generate an appropriate image later.",
						},
						"image_alt_text": map[string]any{
							"type":        "string",
							"description": "For image components: Accessibility alt text describing the image for screen readers.",
						},
						"image_caption": map[string]any{
							"type":        "string",
							"description": "For image components: Optional caption to display below the image.",
						},
						// Quiz component fields (used when component_type = "quiz")
						"quiz_question": map[string]any{
							"type":        "string",
							"description": "For quiz components: The question text.",
						},
						"quiz_options": map[string]any{
							"type":        "array",
							"description": "For quiz components: Array of 2-4 answer options.",
							"items": map[string]any{
								"type": "object",
								"properties": map[string]any{
									"id": map[string]any{
										"type":        "string",
										"description": "Unique identifier for this option (e.g. 'a', 'b', 'c', 'd').",
									},
									"text": map[string]any{
										"type":        "string",
										"description": "The answer option text.",
									},
								},
								"required": []string{"id", "text"},
							},
							"minItems": 2,
							"maxItems": 4,
						},
						"quiz_correct_answer_id": map[string]any{
							"type":        "string",
							"description": "For quiz components: The id of the correct answer option.",
						},
						"quiz_explanation": map[string]any{
							"type":        "string",
							"description": "For quiz components: Explanation shown after answering, explaining why the correct answer is right.",
						},
					},
					"required": []string{"component_type"},
				},
			},
			"segue_text": map[string]any{
				"type":        "string",
				"description": "Transition text to the next lesson. Should smoothly connect this lesson's content to the next topic. Leave empty if this is the final lesson in the course.",
			},
		},
		"required": []string{"components", "segue_text"},
	}
}

// componentSchema returns the schema for a specific component type.
func componentSchema(componentType string) map[string]any {
	switch componentType {
	case "text":
		return textComponentSchema()
	case "heading":
		return headingComponentSchema()
	case "image":
		return imageComponentSchema()
	case "quiz":
		return quizComponentSchema()
	default:
		return textComponentSchema()
	}
}

func textComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"html": map[string]any{
				"type":        "string",
				"description": "HTML-formatted text content",
			},
			"plaintext": map[string]any{
				"type":        "string",
				"description": "Plain text version of the content",
			},
		},
		"required": []string{"html", "plaintext"},
	}
}

func headingComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"level": map[string]any{
				"type":        "integer",
				"description": "Heading level (1-4)",
				"minimum":     1,
				"maximum":     4,
			},
			"text": map[string]any{
				"type":        "string",
				"description": "Heading text",
			},
		},
		"required": []string{"level", "text"},
	}
}

func imageComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"url": map[string]any{
				"type":        "string",
				"description": "Image URL or placeholder description",
			},
			"alt_text": map[string]any{
				"type":        "string",
				"description": "Alternative text for accessibility",
			},
			"caption": map[string]any{
				"type":        "string",
				"description": "Optional image caption",
			},
		},
		"required": []string{"url", "alt_text"},
	}
}

func quizComponentSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"question": map[string]any{
				"type":        "string",
				"description": "The quiz question",
			},
			"question_type": map[string]any{
				"type":        "string",
				"enum":        []string{"multiple_choice", "true_false"},
				"description": "Type of quiz question",
			},
			"options": map[string]any{
				"type":        "array",
				"description": "Answer options",
				"items": map[string]any{
					"type": "object",
					"properties": map[string]any{
						"id": map[string]any{
							"type":        "string",
							"description": "Unique option identifier",
						},
						"text": map[string]any{
							"type":        "string",
							"description": "Option text",
						},
					},
					"required": []string{"id", "text"},
				},
			},
			"correct_answer_id": map[string]any{
				"type":        "string",
				"description": "ID of the correct answer option",
			},
			"explanation": map[string]any{
				"type":        "string",
				"description": "Explanation of the correct answer",
			},
			"correct_feedback": map[string]any{
				"type":        "string",
				"description": "Feedback shown when answer is correct",
			},
			"incorrect_feedback": map[string]any{
				"type":        "string",
				"description": "Feedback shown when answer is incorrect",
			},
		},
		"required": []string{"question", "question_type", "options", "correct_answer_id", "explanation"},
	}
}
