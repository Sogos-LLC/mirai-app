package service

// GroundingResult contains the calculated grounding metrics for content.
// Grounding measures how much of the generated content is traceable
// to specific knowledge sources vs AI-synthesized content.
type GroundingResult struct {
	Score            float32 // 0.0 - 1.0, ratio of grounded to total tokens
	CourseTokens     int32   // Tokens from course-specific knowledge
	TeamTokens       int32   // Tokens from team knowledge sources
	GlobalTokens     int32   // Tokens from global (tenant-wide) knowledge
	UngroundedTokens int32   // Tokens not traceable to knowledge sources
	TotalTokens      int32   // Total token count
	SourceCount      int32   // Number of unique knowledge sources
}

// CalculateGrounding computes grounding metrics from component provenance.
func CalculateGrounding(provenance *ComponentProvenance) GroundingResult {
	if provenance == nil {
		return GroundingResult{Score: 0}
	}

	groundedTokens := provenance.CourseTokens + provenance.TeamTokens + provenance.GlobalTokens

	result := GroundingResult{
		CourseTokens:     provenance.CourseTokens,
		TeamTokens:       provenance.TeamTokens,
		GlobalTokens:     provenance.GlobalTokens,
		TotalTokens:      provenance.TotalTokens,
		UngroundedTokens: provenance.TotalTokens - groundedTokens,
	}

	// Count unique sources
	sourceIDs := make(map[string]bool)
	for _, chunk := range provenance.SourceChunks {
		sourceIDs[chunk.SourceID] = true
	}
	result.SourceCount = int32(len(sourceIDs))

	// Calculate grounding score
	if provenance.TotalTokens > 0 {
		result.Score = float32(groundedTokens) / float32(provenance.TotalTokens)
	}

	return result
}

// CalculateLessonGrounding computes aggregate grounding for a full lesson.
func CalculateLessonGrounding(provenance *LessonProvenance) GroundingResult {
	if provenance == nil {
		return GroundingResult{Score: 0}
	}

	return GroundingResult{
		Score:            provenance.GroundingScore,
		CourseTokens:     provenance.CourseTokens,
		TeamTokens:       provenance.TeamTokens,
		GlobalTokens:     provenance.GlobalTokens,
		UngroundedTokens: provenance.UngroundedTokens,
		TotalTokens:      provenance.TotalTokens,
		SourceCount:      provenance.SourceCount,
	}
}

// IsLowGrounding returns true if the grounding score is below the threshold.
// Default threshold is 0.6 (60% grounded).
func IsLowGrounding(score float32, threshold ...float32) bool {
	t := float32(0.6)
	if len(threshold) > 0 {
		t = threshold[0]
	}
	return score < t
}

// GroundingLevel returns a human-readable grounding level.
func GroundingLevel(score float32) string {
	switch {
	case score >= 0.8:
		return "high"
	case score >= 0.6:
		return "moderate"
	case score >= 0.3:
		return "low"
	default:
		return "minimal"
	}
}
