package gemini

import (
	"regexp"
	"strings"

	"google.golang.org/genai"
)

// calloutStyleToNumber converts a string style to its numeric enum value.
func calloutStyleToNumber(style string) int {
	switch strings.ToLower(style) {
	case "info":
		return 1
	case "warning":
		return 2
	case "success":
		return 3
	case "error":
		return 4
	case "tip":
		return 5
	default:
		return 1 // Default to info
	}
}

// listStyleToNumber converts a list style string to its numeric enum value.
func listStyleToNumber(style string) int {
	switch strings.ToLower(style) {
	case "bulleted":
		return 1
	case "numbered":
		return 2
	case "icon":
		return 3
	case "process":
		return 4
	case "accordion":
		return 5
	default:
		return 5 // Default to accordion (best for learning UX)
	}
}

// galleryStyleToNumber converts a gallery style string to its numeric enum value.
func galleryStyleToNumber(style string) int {
	switch strings.ToLower(style) {
	case "carousel":
		return 1
	case "labeled_graphic":
		return 2
	default:
		return 1 // Default to carousel
	}
}

// multimediaTypeToNumber converts a multimedia type string to its numeric enum value.
func multimediaTypeToNumber(mediaType string) int {
	switch strings.ToLower(mediaType) {
	case "video":
		return 1
	case "audio":
		return 2
	case "interactive":
		return 3
	default:
		return 1 // Default to video
	}
}

// chartTypeToNumber converts a chart type string to its numeric enum value.
func chartTypeToNumber(chartType string) int {
	switch strings.ToLower(chartType) {
	case "bar":
		return 1
	case "line":
		return 2
	case "pie":
		return 3
	case "donut":
		return 4
	case "table":
		return 5
	default:
		return 1 // Default to bar
	}
}

// stripHTML removes HTML tags from a string.
func stripHTML(html string) string {
	// Simple regex-based HTML stripping
	re := regexp.MustCompile(`<[^>]*>`)
	text := re.ReplaceAllString(html, "")
	// Clean up extra whitespace
	text = strings.TrimSpace(text)
	text = regexp.MustCompile(`\s+`).ReplaceAllString(text, " ")
	return text
}

// extractTokensUsed extracts the total token count from a Gemini response.
func extractTokensUsed(result *genai.GenerateContentResponse) int64 {
	if result == nil || result.UsageMetadata == nil {
		return 0
	}
	return int64(result.UsageMetadata.TotalTokenCount)
}
