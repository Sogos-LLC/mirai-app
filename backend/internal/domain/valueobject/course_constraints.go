package valueobject

import (
	"fmt"
	"math"
)

// ConstraintViolation represents a specific constraint that was violated.
type ConstraintViolation struct {
	Field    string // Which constraint was violated
	Expected string // What was expected
	Actual   string // What was provided
	Message  string // Human-readable description
}

func (cv ConstraintViolation) String() string {
	return fmt.Sprintf("%s: expected %s, got %s (%s)", cv.Field, cv.Expected, cv.Actual, cv.Message)
}

// ConstraintsConfig holds configurable parameters for constraint calculation.
type ConstraintsConfig struct {
	// LessonFactor multiplies estimated lessons (default 1.0)
	// Use < 1.0 to create shorter courses, > 1.0 for more comprehensive
	LessonFactor float64

	// VariancePercent defines the +/- variance from calculated lesson count (default 0.2 = 20%)
	VariancePercent float64

	// MinLessonsPerSection is the absolute minimum lessons allowed per section (default 2)
	MinLessonsPerSection int

	// MaxLessonsPerSection is the absolute maximum lessons allowed per section (default 5)
	MaxLessonsPerSection int

	// TokensPerLesson is the estimated token budget per lesson (default 2000)
	TokensPerLesson int32

	// DefaultGroundingThreshold is the minimum grounding score for non-internal-only mode (default 0.6)
	DefaultGroundingThreshold float32

	// InternalOnlyGroundingThreshold is the minimum grounding score for internal-only mode (default 0.9)
	InternalOnlyGroundingThreshold float32
}

// DefaultConstraintsConfig returns sensible defaults for constraint calculation.
func DefaultConstraintsConfig() ConstraintsConfig {
	return ConstraintsConfig{
		LessonFactor:                   1.0,
		VariancePercent:                0.2,
		MinLessonsPerSection:           2,
		MaxLessonsPerSection:           5,
		TokensPerLesson:                2000,
		DefaultGroundingThreshold:      0.6,
		InternalOnlyGroundingThreshold: 0.9,
	}
}

// CourseConstraints represents deterministic bounds calculated from KnowledgeScope.
// The AI generation MUST respect these constraints - violations cause rejection.
type CourseConstraints struct {
	// Section bounds
	MinSections int
	MaxSections int

	// Lessons per section bounds
	MinLessonsPerSection int
	MaxLessonsPerSection int

	// Total lesson bounds (across entire course)
	MinTotalLessons int
	MaxTotalLessons int

	// Token budget per lesson for content generation
	TokenBudgetPerLesson int32

	// Minimum grounding score (how much content must come from knowledge sources)
	GroundingThreshold float32

	// Whether content must come entirely from knowledge sources (no AI synthesis)
	InternalDataOnly bool

	// Recommended content depth based on source material
	RecommendedDepth string

	// Calculation metadata (for debugging/audit)
	CalculatedFromTokens int32 // Total tokens used in calculation
	CalculatedFromDocs   int   // Number of documents used
	EstimatedLessons     int   // Raw estimated lessons before variance
}

// CalculateCourseConstraints deterministically calculates constraints from a KnowledgeScope.
// This is a pure function - same inputs always produce same outputs.
func CalculateCourseConstraints(scope *KnowledgeScope, internalDataOnly bool, config ConstraintsConfig) (*CourseConstraints, error) {
	if scope == nil {
		return nil, fmt.Errorf("knowledge scope is required")
	}

	// Apply defaults for zero values
	if config.LessonFactor <= 0 {
		config.LessonFactor = 1.0
	}
	if config.VariancePercent <= 0 {
		config.VariancePercent = 0.2
	}
	if config.MinLessonsPerSection <= 0 {
		config.MinLessonsPerSection = 2
	}
	if config.MaxLessonsPerSection <= 0 {
		config.MaxLessonsPerSection = 5
	}
	if config.TokensPerLesson <= 0 {
		config.TokensPerLesson = 2000
	}
	if config.DefaultGroundingThreshold <= 0 {
		config.DefaultGroundingThreshold = 0.6
	}
	if config.InternalOnlyGroundingThreshold <= 0 {
		config.InternalOnlyGroundingThreshold = 0.9
	}

	// Step 1: Calculate estimated lessons
	// Prefer EstimatedLessonCount from DocumentIndex if available
	estimatedLessons := scope.EstimatedTotalLessons()

	// Fallback: estimate from tokens if EstimatedLessonCount is not available
	if estimatedLessons == 0 && scope.TotalTokens() > 0 {
		estimatedLessons = int(scope.TotalTokens() / config.TokensPerLesson)
	}

	// Minimum of 3 lessons for any course
	if estimatedLessons < 3 {
		estimatedLessons = 3
	}

	// Step 2: Apply lesson factor
	adjustedLessons := float64(estimatedLessons) * config.LessonFactor

	// Step 3: Calculate lesson bounds with variance
	minLessons := int(math.Round(adjustedLessons * (1.0 - config.VariancePercent)))
	maxLessons := int(math.Round(adjustedLessons * (1.0 + config.VariancePercent)))

	// Ensure minimum bounds
	if minLessons < 3 {
		minLessons = 3
	}
	if maxLessons < minLessons {
		maxLessons = minLessons + 1
	}

	// Step 4: Calculate section bounds
	avgSectionSize := 3.5 // Midpoint of typical 2-5 lessons per section
	idealSections := math.Ceil(adjustedLessons / avgSectionSize)

	minSections := int(math.Max(1, idealSections-1))
	maxSections := int(idealSections + 1)

	// Ensure maxSections can accommodate maxLessons with MinLessonsPerSection
	minSectionsForMaxLessons := int(math.Ceil(float64(maxLessons) / float64(config.MaxLessonsPerSection)))
	if minSections < minSectionsForMaxLessons {
		minSections = minSectionsForMaxLessons
	}

	// Step 5: Calculate token budget per lesson
	tokenBudget := config.TokensPerLesson
	if scope.TotalTokens() > 0 && maxLessons > 0 {
		// Distribute available tokens evenly, capped at config max
		distributedBudget := scope.TotalTokens() / int32(maxLessons)
		if distributedBudget < tokenBudget {
			tokenBudget = distributedBudget
		}
	}

	// Step 6: Set grounding threshold based on mode
	groundingThreshold := config.DefaultGroundingThreshold
	if internalDataOnly {
		groundingThreshold = config.InternalOnlyGroundingThreshold
	}

	return &CourseConstraints{
		MinSections:          minSections,
		MaxSections:          maxSections,
		MinLessonsPerSection: config.MinLessonsPerSection,
		MaxLessonsPerSection: config.MaxLessonsPerSection,
		MinTotalLessons:      minLessons,
		MaxTotalLessons:      maxLessons,
		TokenBudgetPerLesson: tokenBudget,
		GroundingThreshold:   groundingThreshold,
		InternalDataOnly:     internalDataOnly,
		RecommendedDepth:     scope.PrimaryContentDepth(),
		CalculatedFromTokens: scope.TotalTokens(),
		CalculatedFromDocs:   scope.SourceCount(),
		EstimatedLessons:     estimatedLessons,
	}, nil
}

// Validate checks if a generated outline respects these constraints.
// Returns a list of violations (empty if valid).
func (c *CourseConstraints) Validate(sectionCount, totalLessonCount int, lessonCountsPerSection []int) []ConstraintViolation {
	var violations []ConstraintViolation

	// Check section count
	if sectionCount < c.MinSections {
		violations = append(violations, ConstraintViolation{
			Field:    "section_count",
			Expected: fmt.Sprintf(">= %d", c.MinSections),
			Actual:   fmt.Sprintf("%d", sectionCount),
			Message:  "Too few sections",
		})
	}
	if sectionCount > c.MaxSections {
		violations = append(violations, ConstraintViolation{
			Field:    "section_count",
			Expected: fmt.Sprintf("<= %d", c.MaxSections),
			Actual:   fmt.Sprintf("%d", sectionCount),
			Message:  "Too many sections",
		})
	}

	// Check total lesson count
	if totalLessonCount < c.MinTotalLessons {
		violations = append(violations, ConstraintViolation{
			Field:    "total_lessons",
			Expected: fmt.Sprintf(">= %d", c.MinTotalLessons),
			Actual:   fmt.Sprintf("%d", totalLessonCount),
			Message:  "Too few total lessons",
		})
	}
	if totalLessonCount > c.MaxTotalLessons {
		violations = append(violations, ConstraintViolation{
			Field:    "total_lessons",
			Expected: fmt.Sprintf("<= %d", c.MaxTotalLessons),
			Actual:   fmt.Sprintf("%d", totalLessonCount),
			Message:  "Too many total lessons",
		})
	}

	// Check lessons per section
	for i, lessonCount := range lessonCountsPerSection {
		if lessonCount < c.MinLessonsPerSection {
			violations = append(violations, ConstraintViolation{
				Field:    fmt.Sprintf("section_%d_lessons", i+1),
				Expected: fmt.Sprintf(">= %d", c.MinLessonsPerSection),
				Actual:   fmt.Sprintf("%d", lessonCount),
				Message:  fmt.Sprintf("Section %d has too few lessons", i+1),
			})
		}
		if lessonCount > c.MaxLessonsPerSection {
			violations = append(violations, ConstraintViolation{
				Field:    fmt.Sprintf("section_%d_lessons", i+1),
				Expected: fmt.Sprintf("<= %d", c.MaxLessonsPerSection),
				Actual:   fmt.Sprintf("%d", lessonCount),
				Message:  fmt.Sprintf("Section %d has too many lessons", i+1),
			})
		}
	}

	return violations
}

// ValidateGrounding checks if a grounding score meets the threshold.
func (c *CourseConstraints) ValidateGrounding(score float32) bool {
	return score >= c.GroundingThreshold
}

// Summary returns a human-readable summary of the constraints.
// Useful for logging and debugging.
func (c *CourseConstraints) Summary() string {
	return fmt.Sprintf(
		"Constraints: %d-%d sections, %d-%d lessons/section, %d-%d total lessons, "+
			"%.0f%% grounding threshold, internal_only=%v, depth=%s",
		c.MinSections, c.MaxSections,
		c.MinLessonsPerSection, c.MaxLessonsPerSection,
		c.MinTotalLessons, c.MaxTotalLessons,
		c.GroundingThreshold*100,
		c.InternalDataOnly,
		c.RecommendedDepth,
	)
}

// ForPrompt returns constraint text formatted for AI prompt injection.
// This text should be placed at the top of generation prompts.
func (c *CourseConstraints) ForPrompt() string {
	modeText := "standard"
	if c.InternalDataOnly {
		modeText = "INTERNAL DATA ONLY - all content must come from provided source material"
	}

	return fmt.Sprintf(`## MANDATORY COURSE STRUCTURE CONSTRAINTS
**CRITICAL: These are HARD requirements derived from available source material.**

- **Section Count**: EXACTLY %d to %d sections
- **Lessons Per Section**: EXACTLY %d to %d lessons per section
- **Total Lessons**: EXACTLY %d to %d total lessons
- **Content Depth**: Target %s level content
- **Mode**: %s

**Your response will be REJECTED if it violates these constraints.**

`,
		c.MinSections, c.MaxSections,
		c.MinLessonsPerSection, c.MaxLessonsPerSection,
		c.MinTotalLessons, c.MaxTotalLessons,
		c.RecommendedDepth,
		modeText,
	)
}
