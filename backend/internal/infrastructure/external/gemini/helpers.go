package gemini

import (
	"google.golang.org/genai"
)

// extractTokensUsed extracts the total token count from a Gemini response.
func extractTokensUsed(result *genai.GenerateContentResponse) int64 {
	if result == nil || result.UsageMetadata == nil {
		return 0
	}
	return int64(result.UsageMetadata.TotalTokenCount)
}
