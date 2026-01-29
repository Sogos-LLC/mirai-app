package gemini

import (
	"fmt"
)

// ContentValidationError represents a validation failure for generated content
type ContentValidationError struct {
	ComponentIndex int
	ComponentType  string
	Rule           string
	Message        string
}

func (e *ContentValidationError) Error() string {
	return fmt.Sprintf("content validation failed [%s] on component %d (%s): %s",
		e.Rule, e.ComponentIndex, e.ComponentType, e.Message)
}

// ContentValidationResult holds the results of validating a lesson's components
type ContentValidationResult struct {
	Errors   []*ContentValidationError
	Warnings []string
}

func (r *ContentValidationResult) HasErrors() bool {
	return len(r.Errors) > 0
}

// Content limits - these are enforced after generation
const (
	MaxTextCharacters      = 500  // Max characters in text_html (after stripping HTML)
	MaxListItems           = 7    // Max items in a list
	MaxStatementCharacters = 200  // Max characters in statement_text
	MaxCalloutCharacters   = 300  // Max characters in callout content
)

// ComponentForValidation represents a component to validate
type ComponentForValidation struct {
	Type    string
	Content map[string]any
}

// ValidateLessonComponents validates all components in a lesson after generation.
// Returns a result containing any validation errors or warnings.
func ValidateLessonComponents(components []ComponentForValidation) *ContentValidationResult {
	result := &ContentValidationResult{
		Errors:   make([]*ContentValidationError, 0),
		Warnings: make([]string, 0),
	}

	for i, comp := range components {
		if err := ValidateComponentContent(i, comp.Type, comp.Content); err != nil {
			result.Errors = append(result.Errors, err)
		}
	}

	// Check for structural issues across components
	result.Warnings = append(result.Warnings, checkStructuralIssues(components)...)

	return result
}

// ValidateComponentContent validates a single component's content against limits.
// Returns nil if valid, or a ContentValidationError describing the issue.
func ValidateComponentContent(index int, componentType string, content map[string]any) *ContentValidationError {
	switch componentType {
	case "text":
		return validateTextContent(index, content)
	case "list":
		return validateListContent(index, content)
	case "statement":
		return validateStatementContent(index, content)
	case "callout":
		return validateCalloutContent(index, content)
	case "quiz":
		return validateQuizContent(index, content)
	}
	return nil
}

func validateTextContent(index int, content map[string]any) *ContentValidationError {
	textHTML, ok := content["textHtml"].(string)
	if !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "text",
			Rule:           "missing_text_html",
			Message:        "text component missing textHtml field",
		}
	}

	// Strip HTML and check length
	plainText := stripHTML(textHTML)
	if len(plainText) > MaxTextCharacters {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "text",
			Rule:           "text_too_long",
			Message:        fmt.Sprintf("text content is %d characters (max %d)", len(plainText), MaxTextCharacters),
		}
	}

	return nil
}

func validateListContent(index int, content map[string]any) *ContentValidationError {
	items, ok := content["items"].([]any)
	if !ok {
		// Try typed slice
		if typedItems, ok := content["items"].([]map[string]any); ok {
			items = make([]any, len(typedItems))
			for i, item := range typedItems {
				items[i] = item
			}
		} else {
			return &ContentValidationError{
				ComponentIndex: index,
				ComponentType:  "list",
				Rule:           "missing_items",
				Message:        "list component missing items field",
			}
		}
	}

	if len(items) > MaxListItems {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "list",
			Rule:           "list_too_long",
			Message:        fmt.Sprintf("list has %d items (max %d)", len(items), MaxListItems),
		}
	}

	return nil
}

func validateStatementContent(index int, content map[string]any) *ContentValidationError {
	text, ok := content["statementText"].(string)
	if !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "statement",
			Rule:           "missing_statement_text",
			Message:        "statement component missing statementText field",
		}
	}

	if len(text) > MaxStatementCharacters {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "statement",
			Rule:           "statement_too_long",
			Message:        fmt.Sprintf("statement is %d characters (max %d)", len(text), MaxStatementCharacters),
		}
	}

	return nil
}

func validateCalloutContent(index int, content map[string]any) *ContentValidationError {
	calloutContent, ok := content["content"].(string)
	if !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "callout",
			Rule:           "missing_content",
			Message:        "callout component missing content field",
		}
	}

	if len(calloutContent) > MaxCalloutCharacters {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "callout",
			Rule:           "callout_too_long",
			Message:        fmt.Sprintf("callout is %d characters (max %d)", len(calloutContent), MaxCalloutCharacters),
		}
	}

	return nil
}

func validateQuizContent(index int, content map[string]any) *ContentValidationError {
	// Check required fields
	if _, ok := content["quizQuestion"].(string); !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "quiz",
			Rule:           "missing_question",
			Message:        "quiz component missing quizQuestion field",
		}
	}

	// Check options exist
	options, ok := content["quizOptions"].([]any)
	if !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "quiz",
			Rule:           "missing_options",
			Message:        "quiz component missing quizOptions field",
		}
	}

	if len(options) < 2 || len(options) > 5 {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "quiz",
			Rule:           "invalid_options_count",
			Message:        fmt.Sprintf("quiz has %d options (need 2-5)", len(options)),
		}
	}

	// Check correct answer exists
	if _, ok := content["quizCorrectAnswerId"].(string); !ok {
		return &ContentValidationError{
			ComponentIndex: index,
			ComponentType:  "quiz",
			Rule:           "missing_correct_answer",
			Message:        "quiz component missing quizCorrectAnswerId field",
		}
	}

	return nil
}

// checkStructuralIssues checks for issues across multiple components
func checkStructuralIssues(components []ComponentForValidation) []string {
	warnings := make([]string, 0)

	// Check for consecutive headings
	for i := 1; i < len(components); i++ {
		if components[i].Type == "heading" && components[i-1].Type == "heading" {
			warnings = append(warnings, fmt.Sprintf("consecutive headings at positions %d and %d", i-1, i))
		}
	}

	// Check for quiz not at end
	for i, comp := range components {
		if comp.Type == "quiz" && i != len(components)-1 {
			warnings = append(warnings, fmt.Sprintf("quiz found at position %d but should be last", i))
		}
	}

	// Count component variety
	types := make(map[string]bool)
	for _, comp := range components {
		types[comp.Type] = true
	}
	if len(types) < 4 {
		warnings = append(warnings, fmt.Sprintf("low component variety: only %d types used", len(types)))
	}

	return warnings
}

// Note: stripHTML is defined in helpers.go - use that implementation
