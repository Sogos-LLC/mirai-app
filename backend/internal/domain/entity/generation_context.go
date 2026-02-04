package entity

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SMEContextItem represents SME persona data for generation context.
type SMEContextItem struct {
	ID          string
	JobTitle    string
	Description string
	Skills      []string
	Voice       string
}

// AudienceContextItem represents audience persona data for generation context.
type AudienceContextItem struct {
	ID          string
	Name        string
	Role        string
	Description string
	Goals       []string
}

// ToneContext represents the selected tone for content generation.
type ToneContext struct {
	ID            string
	Name          string
	Description   string
	LevelOfDetail string
}

// GenerationContext is the aggregate root for AI course generation.
// It composes KnowledgeScope, CourseConstraints, and all context needed
// for deterministic, knowledge-grounded generation.
type GenerationContext struct {
	ID       uuid.UUID
	CourseID uuid.UUID
	TenantID uuid.UUID
	UserID   uuid.UUID

	// Immutable knowledge scope (selected sources)
	KnowledgeScope *valueobject.KnowledgeScope

	// Deterministic constraints (calculated from scope)
	Constraints *valueobject.CourseConstraints

	// Generation mode
	InternalDataOnly bool

	// Course metadata
	CourseTitle     string
	DesiredOutcomes string

	// Persona context
	SMEContext      []SMEContextItem
	AudienceContext []AudienceContextItem
	ToneContext     *ToneContext

	// Additional instructions
	AdditionalContext string

	// Provenance tracking
	ProvenanceRecords []ProvenanceRecord

	// Timestamps
	CreatedAt time.Time
}

// NewGenerationContext creates a new GenerationContext with calculated constraints.
func NewGenerationContext(
	courseID, tenantID, userID uuid.UUID,
	scope *valueobject.KnowledgeScope,
	internalDataOnly bool,
) (*GenerationContext, error) {
	if scope == nil {
		return nil, fmt.Errorf("knowledge scope is required")
	}

	// Calculate constraints from scope
	constraints, err := valueobject.CalculateCourseConstraints(
		scope,
		internalDataOnly,
		valueobject.DefaultConstraintsConfig(),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate constraints: %w", err)
	}

	return &GenerationContext{
		ID:                uuid.New(),
		CourseID:          courseID,
		TenantID:          tenantID,
		UserID:            userID,
		KnowledgeScope:    scope,
		Constraints:       constraints,
		InternalDataOnly:  internalDataOnly,
		ProvenanceRecords: make([]ProvenanceRecord, 0),
		CreatedAt:         time.Now().UTC(),
	}, nil
}

// WithCourseMetadata sets course title and desired outcomes.
func (gc *GenerationContext) WithCourseMetadata(title, outcomes string) *GenerationContext {
	gc.CourseTitle = title
	gc.DesiredOutcomes = outcomes
	return gc
}

// WithSMEContext sets the SME personas for generation.
func (gc *GenerationContext) WithSMEContext(smes []SMEContextItem) *GenerationContext {
	gc.SMEContext = smes
	return gc
}

// WithAudienceContext sets the audience personas for generation.
func (gc *GenerationContext) WithAudienceContext(audiences []AudienceContextItem) *GenerationContext {
	gc.AudienceContext = audiences
	return gc
}

// WithToneContext sets the tone for content generation.
func (gc *GenerationContext) WithToneContext(tone *ToneContext) *GenerationContext {
	gc.ToneContext = tone
	return gc
}

// WithAdditionalContext sets additional instructions.
func (gc *GenerationContext) WithAdditionalContext(ctx string) *GenerationContext {
	gc.AdditionalContext = ctx
	return gc
}

// AddProvenanceRecord adds a provenance record for audit tracking.
func (gc *GenerationContext) AddProvenanceRecord(record ProvenanceRecord) {
	gc.ProvenanceRecords = append(gc.ProvenanceRecords, record)
}

// GetConstraintsSummary returns a formatted summary for prompt injection.
func (gc *GenerationContext) GetConstraintsSummary() string {
	if gc.Constraints == nil {
		return ""
	}
	return gc.Constraints.ForPrompt()
}

// GetSMESummary returns a formatted summary of selected SME personas.
func (gc *GenerationContext) GetSMESummary() string {
	if len(gc.SMEContext) == 0 {
		return "No specific SME perspective defined."
	}

	var sb strings.Builder
	sb.WriteString("Course authored from the perspective of:\n")
	for _, sme := range gc.SMEContext {
		sb.WriteString(fmt.Sprintf("- %s: %s\n", sme.JobTitle, sme.Description))
	}
	return sb.String()
}

// GetAudienceSummary returns a formatted summary of target audiences.
func (gc *GenerationContext) GetAudienceSummary() string {
	if len(gc.AudienceContext) == 0 {
		return "No specific target audience defined."
	}

	var sb strings.Builder
	sb.WriteString("Target audience:\n")
	for _, aud := range gc.AudienceContext {
		sb.WriteString(fmt.Sprintf("- %s (%s): %s\n", aud.Name, aud.Role, aud.Description))
	}
	return sb.String()
}

// GetToneSummary returns a formatted summary of the content tone.
func (gc *GenerationContext) GetToneSummary() string {
	if gc.ToneContext == nil {
		return "Use a professional, clear tone."
	}
	return fmt.Sprintf("Tone: %s - %s (Detail level: %s)",
		gc.ToneContext.Name,
		gc.ToneContext.Description,
		gc.ToneContext.LevelOfDetail,
	)
}

// SourceIDs returns the knowledge source IDs for this context.
func (gc *GenerationContext) SourceIDs() []uuid.UUID {
	if gc.KnowledgeScope == nil {
		return nil
	}
	return gc.KnowledgeScope.SourceIDs()
}
