package entity

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ToneDetailLevel represents the level of detail for course content.
type ToneDetailLevel string

const (
	ToneDetailLevelBrief         ToneDetailLevel = "brief"
	ToneDetailLevelModerate      ToneDetailLevel = "moderate"
	ToneDetailLevelComprehensive ToneDetailLevel = "comprehensive"
)

// String returns the string representation of the tone detail level.
func (t ToneDetailLevel) String() string {
	return string(t)
}

// ParseToneDetailLevel parses a string into a ToneDetailLevel.
func ParseToneDetailLevel(s string) ToneDetailLevel {
	switch s {
	case "brief":
		return ToneDetailLevelBrief
	case "moderate":
		return ToneDetailLevelModerate
	case "comprehensive":
		return ToneDetailLevelComprehensive
	default:
		return ToneDetailLevelModerate
	}
}

// WizardSMEPersona represents a Subject Matter Expert persona for the wizard.
type WizardSMEPersona struct {
	ID          string   `json:"id"`
	JobTitle    string   `json:"job_title"`
	Description string   `json:"description"`
	Skills      []string `json:"skills"`
	Voice       string   `json:"voice"`
}

// WizardAudiencePersona represents a target audience persona for the wizard.
type WizardAudiencePersona struct {
	ID          string   `json:"id"`
	Role        string   `json:"role"`
	Description string   `json:"description"`
	Goals       []string `json:"goals"`
}

// WizardToneOption represents a tone/style option for the course.
type WizardToneOption struct {
	ID            string          `json:"id"`
	Name          string          `json:"name"`
	Description   string          `json:"description"`
	LevelOfDetail ToneDetailLevel `json:"level_of_detail"`
}

// WizardStepData holds all wizard form data accumulated across steps.
type WizardStepData struct {
	CourseName          string                  `json:"course_name"`
	ImprovedTitle       string                  `json:"improved_title"`
	Description         string                  `json:"description"`
	SMEPersonas         []WizardSMEPersona      `json:"sme_personas"`
	SelectedSMEIDs      []string                `json:"selected_sme_ids"`
	AudiencePersonas    []WizardAudiencePersona `json:"audience_personas"`
	SelectedAudienceIDs []string                `json:"selected_audience_ids"`
	ToneOptions         []WizardToneOption      `json:"tone_options"`
	SelectedToneID      string                  `json:"selected_tone_id"`
	AdditionalContext   string                  `json:"additional_context"`
	DesiredOutcomes     string                  `json:"desired_outcomes"` // Course outcomes - the "north star" for all content generation
	// SelectedTeamDocIDs contains the IDs of team-level knowledge sources selected for this course.
	SelectedTeamDocIDs []string `json:"selected_team_doc_ids"`
	// SelectedGlobalDocIDs contains the IDs of global/tenant-level knowledge sources selected for this course.
	SelectedGlobalDocIDs []string `json:"selected_global_doc_ids"`
	// InternalDataOnly: When true, course content is generated exclusively from
	// uploaded knowledge sources. AI will not add external information.
	InternalDataOnly bool `json:"internal_data_only"`
}

// ToJSON serializes WizardStepData to JSON.
func (d *WizardStepData) ToJSON() (json.RawMessage, error) {
	return json.Marshal(d)
}

// WizardStepDataFromJSON deserializes WizardStepData from JSON.
func WizardStepDataFromJSON(data json.RawMessage) (*WizardStepData, error) {
	var stepData WizardStepData
	if err := json.Unmarshal(data, &stepData); err != nil {
		return nil, err
	}
	return &stepData, nil
}

// WizardState represents the saved wizard progress for a user.
type WizardState struct {
	ID          uuid.UUID
	TenantID    uuid.UUID
	UserID      uuid.UUID
	CurrentStep string // courseName, titleDescription, smeSelection, etc.
	Data        *WizardStepData
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// GetSelectedSMEPersonas returns the SME personas that were selected by the user.
func (d *WizardStepData) GetSelectedSMEPersonas() []WizardSMEPersona {
	if d == nil || len(d.SelectedSMEIDs) == 0 {
		return nil
	}

	selectedSet := make(map[string]bool)
	for _, id := range d.SelectedSMEIDs {
		selectedSet[id] = true
	}

	var selected []WizardSMEPersona
	for _, persona := range d.SMEPersonas {
		if selectedSet[persona.ID] {
			selected = append(selected, persona)
		}
	}
	return selected
}

// GetSelectedAudiencePersonas returns the audience personas that were selected by the user.
func (d *WizardStepData) GetSelectedAudiencePersonas() []WizardAudiencePersona {
	if d == nil || len(d.SelectedAudienceIDs) == 0 {
		return nil
	}

	selectedSet := make(map[string]bool)
	for _, id := range d.SelectedAudienceIDs {
		selectedSet[id] = true
	}

	var selected []WizardAudiencePersona
	for _, persona := range d.AudiencePersonas {
		if selectedSet[persona.ID] {
			selected = append(selected, persona)
		}
	}
	return selected
}

// GetSelectedTone returns the selected tone option.
func (d *WizardStepData) GetSelectedTone() *WizardToneOption {
	if d == nil || d.SelectedToneID == "" {
		return nil
	}

	for _, option := range d.ToneOptions {
		if option.ID == d.SelectedToneID {
			return &option
		}
	}
	return nil
}
