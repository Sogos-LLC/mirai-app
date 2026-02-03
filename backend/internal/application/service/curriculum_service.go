package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/repository"
)

// CurriculumService handles curriculum map operations.
type CurriculumService struct {
	aiService *AIGenerationService
	userRepo  repository.UserRepository
}

// NewCurriculumService creates a new curriculum service.
func NewCurriculumService(
	aiService *AIGenerationService,
	userRepo repository.UserRepository,
) *CurriculumService {
	return &CurriculumService{
		aiService: aiService,
		userRepo:  userRepo,
	}
}

// GetCurriculumMap retrieves the curriculum map for a course.
func (s *CurriculumService) GetCurriculumMap(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID) (*S3CurriculumMap, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil || user.TenantID == nil {
		return nil, fmt.Errorf("user not found")
	}

	content, err := s.aiService.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to read course content: %w", err)
	}

	if content.CurriculumMap == nil {
		return nil, nil // No curriculum map yet
	}

	// Check for staleness
	currentHash := s.computeOutlineHash(content)
	if content.CurriculumMap.OutlineVersionHash != currentHash {
		content.CurriculumMap.Status = "stale"
	}

	return content.CurriculumMap, nil
}

// GenerateCurriculumMap generates or regenerates the curriculum map.
func (s *CurriculumService) GenerateCurriculumMap(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID, forceRegenerate bool) (*S3CurriculumMap, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil || user.TenantID == nil {
		return nil, fmt.Errorf("user not found")
	}

	content, err := s.aiService.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to read course content: %w", err)
	}

	// Check if we need to regenerate
	currentHash := s.computeOutlineHash(content)
	if content.CurriculumMap != nil && !forceRegenerate {
		if content.CurriculumMap.OutlineVersionHash == currentHash && content.CurriculumMap.Status != "stale" {
			return content.CurriculumMap, nil // Already up to date
		}
	}

	// Extract outcomes from desired outcomes (split by newlines/bullet points)
	outcomes := s.extractOutcomes(content)

	// Build curriculum map from sections
	currMap := &S3CurriculumMap{
		ID:                 uuid.New().String(),
		OutlineVersionHash: currentHash,
		Status:             "pending",
		GeneratedAt:        time.Now(),
		Rows:               make([]S3CurriculumRow, 0),
	}

	var totalGroundingScore float32
	totalSources := make(map[string]bool)

	for _, sectionMap := range content.Content.Sections {
		sectionID, _ := sectionMap["id"].(string)
		sectionTitle, _ := sectionMap["title"].(string)
		sectionOrder := 0
		if order, ok := sectionMap["order"].(float64); ok {
			sectionOrder = int(order)
		}

		// Get section metadata
		level, _ := sectionMap["level"].(string)
		intent, _ := sectionMap["intent"].(string)
		emphasis, _ := sectionMap["emphasis"].(string)
		groundingScore := float32(0)
		if gs, ok := sectionMap["groundingScore"].(float64); ok {
			groundingScore = float32(gs)
		}
		totalGroundingScore += groundingScore

		// Get mapped outcome indices
		mappedIndices := make([]int, 0)
		if indices, ok := sectionMap["mappedOutcomeIndices"].([]interface{}); ok {
			for _, idx := range indices {
				if i, ok := idx.(float64); ok {
					mappedIndices = append(mappedIndices, int(i))
				}
			}
		}

		// Get contributing chunk IDs
		if chunkIDs, ok := sectionMap["contributingChunkIds"].([]interface{}); ok {
			for _, id := range chunkIDs {
				if idStr, ok := id.(string); ok {
					totalSources[idStr] = true
				}
			}
		}

		// Get lesson IDs
		lessonIDs := make([]string, 0)
		if lessons, ok := sectionMap["lessons"].([]interface{}); ok {
			for _, l := range lessons {
				if lessonMap, ok := l.(map[string]interface{}); ok {
					if lessonID, ok := lessonMap["id"].(string); ok {
						lessonIDs = append(lessonIDs, lessonID)
					}
				}
			}
		}

		// Build cells for each outcome
		cells := make([]S3CurriculumCell, len(outcomes))
		for i, outcome := range outcomes {
			cell := S3CurriculumCell{
				OutcomeID:   fmt.Sprintf("outcome-%d", i),
				OutcomeText: outcome,
				Intent:      "", // Not covered by default
				Level:       "",
				Emphasis:    0,
				LessonIDs:   []string{},
				Confidence:  0,
			}

			// Check if this section covers this outcome
			for _, idx := range mappedIndices {
				if idx == i {
					cell.Intent = intent
					cell.Level = level
					cell.Emphasis = s.emphasisToInt(emphasis)
					cell.LessonIDs = lessonIDs
					cell.Confidence = 0.8 // AI-generated mapping
					break
				}
			}

			cells[i] = cell
		}

		currMap.Rows = append(currMap.Rows, S3CurriculumRow{
			SectionID:    sectionID,
			SectionTitle: sectionTitle,
			SectionOrder: int32(sectionOrder),
			Cells:        cells,
		})
	}

	// Calculate aggregate grounding
	if len(content.Content.Sections) > 0 {
		currMap.AggregateGroundingScore = totalGroundingScore / float32(len(content.Content.Sections))
	}
	currMap.TotalSourceCount = int32(len(totalSources))

	// Run validation
	currMap.Issues = s.validateCurriculumMap(currMap, outcomes)

	// Determine status based on issues
	hasErrors := false
	hasWarnings := false
	for _, issue := range currMap.Issues {
		if issue.Severity == "error" {
			hasErrors = true
		}
		if issue.Severity == "warning" {
			hasWarnings = true
		}
	}

	if hasErrors {
		currMap.Status = "pending" // Has errors, needs fixing
	} else if hasWarnings {
		currMap.Status = "warnings" // Has warnings, can proceed with acknowledgment
	} else {
		currMap.Status = "valid" // No issues
	}

	// Save to S3
	content.CurriculumMap = currMap
	if err := s.aiService.writeCourseContent(ctx, *user.TenantID, courseID, content); err != nil {
		return nil, fmt.Errorf("failed to save curriculum map: %w", err)
	}

	return currMap, nil
}

// ApproveCurriculumMap approves the curriculum map.
func (s *CurriculumService) ApproveCurriculumMap(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID, acknowledgeWarnings bool) (*S3CurriculumMap, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil || user.TenantID == nil {
		return nil, fmt.Errorf("user not found")
	}

	content, err := s.aiService.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to read course content: %w", err)
	}

	if content.CurriculumMap == nil {
		return nil, fmt.Errorf("curriculum map not found")
	}

	// Check for blocking errors
	for _, issue := range content.CurriculumMap.Issues {
		if issue.Severity == "error" {
			return nil, fmt.Errorf("cannot approve: curriculum map has errors that must be resolved")
		}
	}

	// Check if warnings need acknowledgment
	hasWarnings := false
	for _, issue := range content.CurriculumMap.Issues {
		if issue.Severity == "warning" {
			hasWarnings = true
			break
		}
	}
	if hasWarnings && !acknowledgeWarnings {
		return nil, fmt.Errorf("must acknowledge warnings to approve")
	}

	// Approve
	now := time.Now()
	userIDStr := user.ID.String()
	content.CurriculumMap.Status = "approved"
	content.CurriculumMap.ApprovedAt = &now
	content.CurriculumMap.ApprovedByUserID = &userIDStr

	// Save
	if err := s.aiService.writeCourseContent(ctx, *user.TenantID, courseID, content); err != nil {
		return nil, fmt.Errorf("failed to save approval: %w", err)
	}

	return content.CurriculumMap, nil
}

// UpdateCoverageCell updates a specific coverage cell.
func (s *CurriculumService) UpdateCoverageCell(
	ctx context.Context,
	kratosID uuid.UUID,
	courseID uuid.UUID,
	sectionID string,
	outcomeID string,
	intent string,
	level string,
	emphasis int32,
) (*S3CurriculumMap, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil || user.TenantID == nil {
		return nil, fmt.Errorf("user not found")
	}

	content, err := s.aiService.readCourseContent(ctx, *user.TenantID, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to read course content: %w", err)
	}

	if content.CurriculumMap == nil {
		return nil, fmt.Errorf("curriculum map not found")
	}

	// Find and update the cell
	for i, row := range content.CurriculumMap.Rows {
		if row.SectionID == sectionID {
			for j, cell := range row.Cells {
				if cell.OutcomeID == outcomeID {
					content.CurriculumMap.Rows[i].Cells[j].Intent = intent
					content.CurriculumMap.Rows[i].Cells[j].Level = level
					content.CurriculumMap.Rows[i].Cells[j].Emphasis = emphasis
					content.CurriculumMap.Rows[i].Cells[j].Confidence = 1.0 // Manual override
					break
				}
			}
			break
		}
	}

	// Re-validate
	outcomes := s.extractOutcomes(content)
	content.CurriculumMap.Issues = s.validateCurriculumMap(content.CurriculumMap, outcomes)

	// Reset approval if it was approved
	if content.CurriculumMap.Status == "approved" {
		content.CurriculumMap.Status = "pending"
		content.CurriculumMap.ApprovedAt = nil
		content.CurriculumMap.ApprovedByUserID = nil
	}

	// Save
	if err := s.aiService.writeCourseContent(ctx, *user.TenantID, courseID, content); err != nil {
		return nil, fmt.Errorf("failed to save cell update: %w", err)
	}

	return content.CurriculumMap, nil
}

// computeOutlineHash creates a hash of the outline structure for staleness detection.
func (s *CurriculumService) computeOutlineHash(content *S3CourseContent) string {
	var parts []string

	for _, sectionMap := range content.Content.Sections {
		sectionID, _ := sectionMap["id"].(string)
		sectionTitle, _ := sectionMap["title"].(string)
		parts = append(parts, sectionID, sectionTitle)

		if lessons, ok := sectionMap["lessons"].([]interface{}); ok {
			for _, l := range lessons {
				if lessonMap, ok := l.(map[string]interface{}); ok {
					lessonID, _ := lessonMap["id"].(string)
					lessonTitle, _ := lessonMap["title"].(string)
					parts = append(parts, lessonID, lessonTitle)
				}
			}
		}
	}

	hash := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(hash[:8]) // Use first 8 bytes
}

// extractOutcomes parses the desired outcomes into individual items.
func (s *CurriculumService) extractOutcomes(content *S3CourseContent) []string {
	outcomes := make([]string, 0)

	desiredOutcomes := ""
	if content.WizardData != nil {
		desiredOutcomes = content.WizardData.DesiredOutcomes
	}
	if desiredOutcomes == "" {
		desiredOutcomes = content.Settings.DesiredOutcome
	}

	if desiredOutcomes == "" {
		return outcomes
	}

	// Split by newlines or bullet points
	lines := strings.Split(desiredOutcomes, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		// Remove bullet point prefixes
		line = strings.TrimPrefix(line, "-")
		line = strings.TrimPrefix(line, "•")
		line = strings.TrimPrefix(line, "*")
		line = strings.TrimSpace(line)
		if line != "" {
			outcomes = append(outcomes, line)
		}
	}

	return outcomes
}

// emphasisToInt converts emphasis string to int.
func (s *CurriculumService) emphasisToInt(emphasis string) int32 {
	switch emphasis {
	case "high":
		return 100
	case "medium":
		return 50
	case "low":
		return 25
	default:
		return 0
	}
}

// validateCurriculumMap runs validation rules on the curriculum map.
func (s *CurriculumService) validateCurriculumMap(currMap *S3CurriculumMap, outcomes []string) []S3CurriculumValidationIssue {
	issues := make([]S3CurriculumValidationIssue, 0)

	// Build coverage tracking per outcome
	outcomeCoverage := make(map[string]struct {
		hasTaught    bool
		hasAssessed  bool
		teachSection int
		assessSection int
		sectionCount int
	})

	for i := range outcomes {
		outcomeID := fmt.Sprintf("outcome-%d", i)
		outcomeCoverage[outcomeID] = struct {
			hasTaught    bool
			hasAssessed  bool
			teachSection int
			assessSection int
			sectionCount int
		}{}
	}

	// Analyze coverage
	for rowIdx, row := range currMap.Rows {
		for _, cell := range row.Cells {
			if cell.Intent == "" {
				continue // Not covered
			}

			coverage := outcomeCoverage[cell.OutcomeID]
			coverage.sectionCount++

			if cell.Intent == "teach" {
				if !coverage.hasTaught {
					coverage.hasTaught = true
					coverage.teachSection = rowIdx
				}
			}
			if cell.Intent == "assess" {
				if !coverage.hasAssessed {
					coverage.hasAssessed = true
					coverage.assessSection = rowIdx
				}
			}
			outcomeCoverage[cell.OutcomeID] = coverage
		}
	}

	// Rule 1: uncovered_outcome (ERROR) - Every outcome must have coverage
	for i, outcome := range outcomes {
		outcomeID := fmt.Sprintf("outcome-%d", i)
		coverage := outcomeCoverage[outcomeID]
		if coverage.sectionCount == 0 {
			issues = append(issues, S3CurriculumValidationIssue{
				Rule:      "uncovered_outcome",
				Severity:  "error",
				Message:   fmt.Sprintf("Outcome not covered by any section: %q", truncate(outcome, 60)),
				OutcomeID: &outcomeID,
			})
		}
	}

	// Rule 2: assess_before_teach (ERROR) - Cannot assess before teaching
	for i, outcome := range outcomes {
		outcomeID := fmt.Sprintf("outcome-%d", i)
		coverage := outcomeCoverage[outcomeID]
		if coverage.hasAssessed && coverage.hasTaught && coverage.assessSection < coverage.teachSection {
			issues = append(issues, S3CurriculumValidationIssue{
				Rule:      "assess_before_teach",
				Severity:  "error",
				Message:   fmt.Sprintf("Assessment comes before teaching for: %q", truncate(outcome, 60)),
				OutcomeID: &outcomeID,
			})
		}
	}

	// Rule 3: no_primary_teaching (ERROR) - Each outcome needs at least one TEACH
	for i, outcome := range outcomes {
		outcomeID := fmt.Sprintf("outcome-%d", i)
		coverage := outcomeCoverage[outcomeID]
		if coverage.sectionCount > 0 && !coverage.hasTaught {
			issues = append(issues, S3CurriculumValidationIssue{
				Rule:      "no_primary_teaching",
				Severity:  "error",
				Message:   fmt.Sprintf("No teaching section for outcome: %q", truncate(outcome, 60)),
				OutcomeID: &outcomeID,
			})
		}
	}

	// Rule 4: outcome_concentration (WARNING) - Outcome only in one section
	for i, outcome := range outcomes {
		outcomeID := fmt.Sprintf("outcome-%d", i)
		coverage := outcomeCoverage[outcomeID]
		if coverage.sectionCount == 1 {
			issues = append(issues, S3CurriculumValidationIssue{
				Rule:      "outcome_concentration",
				Severity:  "warning",
				Message:   fmt.Sprintf("Outcome covered in only one section: %q", truncate(outcome, 60)),
				OutcomeID: &outcomeID,
			})
		}
	}

	return issues
}

// truncate shortens a string to maxLen characters.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
