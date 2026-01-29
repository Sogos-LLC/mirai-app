package gemini

import "fmt"

// PlanValidationError represents a validation failure with details
type PlanValidationError struct {
	Rule    string
	Message string
}

func (e *PlanValidationError) Error() string {
	return fmt.Sprintf("plan validation failed [%s]: %s", e.Rule, e.Message)
}

// ValidateComponentPlan checks that a component plan meets ILD requirements.
// Returns nil if valid, or a PlanValidationError describing the issue.
func ValidateComponentPlan(plan []plannedComponent) error {
	if len(plan) == 0 {
		return &PlanValidationError{
			Rule:    "empty_plan",
			Message: "plan has no components",
		}
	}

	counts := countComponentTypes(plan)

	// Rule 1: At least 1 heading
	if counts["heading"] < 1 {
		return &PlanValidationError{
			Rule:    "min_heading",
			Message: "plan must have at least 1 heading component",
		}
	}

	// Rule 2: At least 1 text component
	if counts["text"] < 1 {
		return &PlanValidationError{
			Rule:    "min_text",
			Message: "plan must have at least 1 text component",
		}
	}

	// Rule 3: Exactly 1 quiz
	if counts["quiz"] < 1 {
		return &PlanValidationError{
			Rule:    "min_quiz",
			Message: "plan must have exactly 1 quiz component as knowledge check",
		}
	}
	if counts["quiz"] > 1 {
		return &PlanValidationError{
			Rule:    "max_quiz",
			Message: fmt.Sprintf("plan has %d quiz components (must have exactly 1 at the end)", counts["quiz"]),
		}
	}

	// Rule 3b: Quiz must be the last component
	if plan[len(plan)-1].ComponentType != "quiz" {
		return &PlanValidationError{
			Rule:    "quiz_position",
			Message: "quiz must be the LAST component of the lesson (knowledge check)",
		}
	}

	// Rule 4: No consecutive images (2 or more in a row)
	if consecutiveCount := findMaxConsecutiveImages(plan); consecutiveCount >= 2 {
		return &PlanValidationError{
			Rule:    "consecutive_images",
			Message: fmt.Sprintf("plan has %d consecutive image components (max 1 allowed)", consecutiveCount),
		}
	}

	// Rule 5: Maximum 3 images total
	if counts["image"] > 3 {
		return &PlanValidationError{
			Rule:    "max_images",
			Message: fmt.Sprintf("plan has %d image components (max 3 allowed)", counts["image"]),
		}
	}

	// Rule 6: First component should not be image
	if len(plan) > 0 && plan[0].ComponentType == "image" {
		return &PlanValidationError{
			Rule:    "start_with_image",
			Message: "plan should not start with an image component",
		}
	}

	// Rule 7: No consecutive headings (2 or more in a row)
	if consecutiveHeadings := findMaxConsecutiveHeadings(plan); consecutiveHeadings >= 2 {
		return &PlanValidationError{
			Rule:    "consecutive_headings",
			Message: fmt.Sprintf("plan has %d consecutive heading components (max 1 allowed - add content between headings)", consecutiveHeadings),
		}
	}

	// Rule 8: Minimum component variety (at least 4 different types)
	uniqueTypes := countUniqueTypes(counts)
	if uniqueTypes < 4 {
		return &PlanValidationError{
			Rule:    "min_variety",
			Message: fmt.Sprintf("plan has only %d component types (need at least 4 for engaging content)", uniqueTypes),
		}
	}

	// Rule 9: Must have at least 1 emphasis component (STATEMENT or CALLOUT)
	emphasisCount := counts["statement"] + counts["callout"]
	if emphasisCount < 1 {
		return &PlanValidationError{
			Rule:    "min_emphasis",
			Message: "plan must have at least 1 STATEMENT or CALLOUT component for emphasis",
		}
	}

	return nil
}

// countComponentTypes returns a count of each component type in the plan
func countComponentTypes(plan []plannedComponent) map[string]int {
	counts := make(map[string]int)
	for _, comp := range plan {
		counts[comp.ComponentType]++
	}
	return counts
}

// findMaxConsecutiveImages returns the maximum number of consecutive image components
func findMaxConsecutiveImages(plan []plannedComponent) int {
	maxConsecutive := 0
	currentConsecutive := 0

	for _, comp := range plan {
		if comp.ComponentType == "image" || comp.ComponentType == "gallery" {
			currentConsecutive++
			if currentConsecutive > maxConsecutive {
				maxConsecutive = currentConsecutive
			}
		} else {
			currentConsecutive = 0
		}
	}

	return maxConsecutive
}

// findMaxConsecutiveHeadings returns the maximum number of consecutive heading components
func findMaxConsecutiveHeadings(plan []plannedComponent) int {
	maxConsecutive := 0
	currentConsecutive := 0

	for _, comp := range plan {
		if comp.ComponentType == "heading" {
			currentConsecutive++
			if currentConsecutive > maxConsecutive {
				maxConsecutive = currentConsecutive
			}
		} else {
			currentConsecutive = 0
		}
	}

	return maxConsecutive
}

// countUniqueTypes returns the number of unique component types in the counts map
func countUniqueTypes(counts map[string]int) int {
	unique := 0
	for _, count := range counts {
		if count > 0 {
			unique++
		}
	}
	return unique
}
