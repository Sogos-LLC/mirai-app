package gemini

import (
	"encoding/json"
	"fmt"
)

// parseAndTransformComponent parses a single component response and transforms it to storage format.
// Returns the parsed component, the JSON content for storage, a summary string, and any error.
func parseAndTransformComponent(componentType, responseText string) (*flatLessonComponent, string, string, error) {
	comp := &flatLessonComponent{ComponentType: componentType}
	var contentJSON string
	var summary string

	switch componentType {
	case "text":
		contentJSON, summary = parseTextComponent(responseText, comp)
	case "heading":
		contentJSON, summary = parseHeadingComponent(responseText, comp)
	case "image":
		contentJSON, summary = parseImageComponent(responseText, comp)
	case "quiz":
		contentJSON, summary = parseQuizComponent(responseText, comp)
	case "code":
		contentJSON, summary = parseCodeComponent(responseText)
	case "callout":
		contentJSON, summary = parseCalloutComponent(responseText)
	case "statement":
		contentJSON, summary = parseStatementComponent(responseText)
	case "quote":
		contentJSON, summary = parseQuoteComponent(responseText)
	case "list":
		contentJSON, summary = parseListComponent(responseText)
	case "gallery":
		contentJSON, summary = parseGalleryComponent(responseText)
	case "multimedia":
		contentJSON, summary = parseMultimediaComponent(responseText)
	case "chart":
		contentJSON, summary = parseChartComponent(responseText)
	case "divider":
		contentJSON, summary = parseDividerComponent(responseText)
	default:
		return nil, "", "", fmt.Errorf("unknown component type: %s", componentType)
	}

	if contentJSON == "" {
		return nil, "", "", fmt.Errorf("failed to parse %s component", componentType)
	}

	return comp, contentJSON, summary, nil
}

func parseTextComponent(responseText string, comp *flatLessonComponent) (string, string) {
	var resp singleTextComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	comp.TextHTML = resp.TextHTML
	content := map[string]any{
		"textHtml":  resp.TextHTML,
		"plaintext": stripHTML(resp.TextHTML),
	}
	jsonBytes, _ := json.Marshal(content)
	// Summary: first 60 chars of plaintext
	plaintext := stripHTML(resp.TextHTML)
	summary := plaintext
	if len(plaintext) > 60 {
		summary = plaintext[:60] + "..."
	}
	return string(jsonBytes), summary
}

func parseHeadingComponent(responseText string, comp *flatLessonComponent) (string, string) {
	var resp singleHeadingComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	comp.HeadingLevel = resp.HeadingLevel
	comp.HeadingText = resp.HeadingText
	content := map[string]any{
		"headingLevel": resp.HeadingLevel,
		"headingText":  resp.HeadingText,
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("H%d: %s", resp.HeadingLevel, resp.HeadingText)
	return string(jsonBytes), summary
}

func parseImageComponent(responseText string, comp *flatLessonComponent) (string, string) {
	var resp singleImageComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	comp.ImageDescription = resp.ImageDescription
	comp.ImageAltText = resp.ImageAltText
	comp.ImageCaption = resp.ImageCaption
	// Use camelCase to match frontend ImageRenderer expectations
	content := map[string]any{
		"imageDescription": resp.ImageDescription,
		"altText":          resp.ImageAltText,
		"caption":          resp.ImageCaption,
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("Image: %s", resp.ImageAltText)
	return string(jsonBytes), summary
}

func parseQuizComponent(responseText string, comp *flatLessonComponent) (string, string) {
	var resp singleQuizComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	comp.QuizQuestion = resp.QuizQuestion
	comp.QuizOptions = resp.QuizOptions
	comp.QuizCorrectAnswerID = resp.QuizCorrectAnswerID
	comp.QuizExplanation = resp.QuizExplanation
	options := make([]map[string]string, len(resp.QuizOptions))
	for i, opt := range resp.QuizOptions {
		options[i] = map[string]string{"id": opt.ID, "text": opt.Text}
	}
	content := map[string]any{
		"question":          resp.QuizQuestion,
		"question_type":     "multiple_choice",
		"options":           options,
		"correct_answer_id": resp.QuizCorrectAnswerID,
		"explanation":       resp.QuizExplanation,
	}
	jsonBytes, _ := json.Marshal(content)
	// Summary: first 40 chars of question
	summary := fmt.Sprintf("Quiz: %s", resp.QuizQuestion)
	if len(resp.QuizQuestion) > 40 {
		summary = fmt.Sprintf("Quiz: %s...", resp.QuizQuestion[:40])
	}
	return string(jsonBytes), summary
}

func parseCodeComponent(responseText string) (string, string) {
	var resp singleCodeComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	content := map[string]any{
		"code":     resp.Code,
		"language": resp.Language,
	}
	jsonBytes, _ := json.Marshal(content)
	summary := fmt.Sprintf("Code (%s)", resp.Language)
	return string(jsonBytes), summary
}

func parseCalloutComponent(responseText string) (string, string) {
	var resp singleCalloutComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	// Convert string style to numeric enum value (matches proto CalloutStyle)
	styleNum := calloutStyleToNumber(resp.Style)
	content := map[string]any{
		"style":   styleNum,
		"title":   resp.Title,
		"content": resp.Content,
	}
	jsonBytes, _ := json.Marshal(content)
	var summary string
	if resp.Title != "" {
		summary = fmt.Sprintf("%s: %s", resp.Style, resp.Title)
	} else if len(resp.Content) > 40 {
		summary = fmt.Sprintf("%s: %s...", resp.Style, resp.Content[:40])
	} else {
		summary = fmt.Sprintf("%s: %s", resp.Style, resp.Content)
	}
	return string(jsonBytes), summary
}

func parseStatementComponent(responseText string) (string, string) {
	var resp singleStatementComponent
	if err := json.Unmarshal([]byte(responseText), &resp); err != nil {
		return "", ""
	}
	content := map[string]any{
		"text":    resp.StatementText,
		"subtext": resp.StatementSubtext,
	}
	jsonBytes, _ := json.Marshal(content)
	// Summary: first 50 chars of statement text
	summary := fmt.Sprintf("Statement: %s", resp.StatementText)
	if len(resp.StatementText) > 50 {
		summary = fmt.Sprintf("Statement: %s...", resp.StatementText[:50])
	}
	return string(jsonBytes), summary
}
