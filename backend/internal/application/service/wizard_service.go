package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
)

// APIKeyDecryptor decrypts per-tenant AI API keys.
type APIKeyDecryptor interface {
	GetDecryptedAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error)
}

// WizardService handles the multi-step course wizard operations.
type WizardService struct {
	wizardRepo     repository.WizardStateRepository
	userRepo       repository.UserRepository
	aiSettingsRepo repository.TenantAISettingsRepository
	keyDecryptor   APIKeyDecryptor
	workflowStart  WorkflowStarter
	logger         domainservice.Logger
}

// NewWizardService creates a new wizard service.
func NewWizardService(
	wizardRepo repository.WizardStateRepository,
	userRepo repository.UserRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	keyDecryptor APIKeyDecryptor,
	workflowStart WorkflowStarter,
	logger domainservice.Logger,
) *WizardService {
	return &WizardService{
		wizardRepo:     wizardRepo,
		userRepo:       userRepo,
		aiSettingsRepo: aiSettingsRepo,
		keyDecryptor:   keyDecryptor,
		workflowStart:  workflowStart,
		logger:         logger,
	}
}

// ---------------------------------------------------------------------------
// Generation methods — each calls ExecuteWizardStep via Temporal
// ---------------------------------------------------------------------------

// WizardStepInput is the Temporal workflow input (mirrors Python WizardStepInput).
type WizardStepInput struct {
	StepType    string            `json:"step_type"`
	APIKey      string            `json:"api_key"`
	PayloadJSON string            `json:"payload_json"`
	RagFilters  map[string]string `json:"rag_filters"`
}

// buildRAGFilters creates a filter map from selected doc IDs for the Python side.
func buildRAGFilters(teamDocIDs, globalDocIDs []string) map[string]string {
	filters := make(map[string]string)
	if len(teamDocIDs) > 0 {
		b, _ := json.Marshal(teamDocIDs)
		filters["team_doc_ids"] = string(b)
	}
	if len(globalDocIDs) > 0 {
		b, _ := json.Marshal(globalDocIDs)
		filters["global_doc_ids"] = string(b)
	}
	return filters
}

// resolveUser validates the user and returns (user, tenantID, error).
func (s *WizardService) resolveUser(ctx context.Context, kratosID uuid.UUID) (*entity.User, uuid.UUID, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, uuid.Nil, domainerrors.ErrUserNotFound
	}
	if user.TenantID == nil {
		return nil, uuid.Nil, domainerrors.ErrUserHasNoCompany
	}
	return user, *user.TenantID, nil
}

// getAPIKey decrypts the tenant's AI API key.
func (s *WizardService) getAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error) {
	apiKey, err := s.keyDecryptor.GetDecryptedAPIKey(ctx, tenantID)
	if err != nil {
		return "", domainerrors.ErrInternal.WithMessage("failed to decrypt API key")
	}
	return apiKey, nil
}

// executeStep runs a wizard step via Temporal and returns the raw result.
func (s *WizardService) executeStep(ctx context.Context, stepType, apiKey string, payload interface{}, ragFilters map[string]string) (map[string]interface{}, error) {
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	input := WizardStepInput{
		StepType:    stepType,
		APIKey:      apiKey,
		PayloadJSON: string(payloadJSON),
		RagFilters:  ragFilters,
	}

	result, err := s.workflowStart.ExecuteWizardStep(ctx, stepType, input)
	if err != nil {
		s.logger.Error("wizard step failed", "stepType", stepType, "error", err)
		return nil, domainerrors.ErrInternal.WithMessage(fmt.Sprintf("wizard step %s failed: %v", stepType, err))
	}

	return result, nil
}

// GenerateTitleResult holds the result of title generation.
type GenerateTitleResult struct {
	ImprovedTitle string
	Description   string
}

// GenerateTitle generates an improved course title and description.
func (s *WizardService) GenerateTitle(ctx context.Context, kratosID uuid.UUID, courseName string, teamDocIDs, globalDocIDs []string) (*GenerateTitleResult, error) {
	_, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	apiKey, err := s.getAPIKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	payload := map[string]string{"course_name": courseName}
	result, err := s.executeStep(ctx, "generate_title", apiKey, payload, buildRAGFilters(teamDocIDs, globalDocIDs))
	if err != nil {
		return nil, err
	}

	return &GenerateTitleResult{
		ImprovedTitle: stringFromMap(result, "improved_title"),
		Description:   stringFromMap(result, "description"),
	}, nil
}

// GenerateOutcomesResult holds the result of outcomes generation.
type GenerateOutcomesResult struct {
	Outcomes string
}

// GenerateOutcomes generates desired learning outcomes for a course.
func (s *WizardService) GenerateOutcomes(ctx context.Context, kratosID uuid.UUID, courseName string, teamDocIDs, globalDocIDs []string) (*GenerateOutcomesResult, error) {
	_, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	apiKey, err := s.getAPIKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	payload := map[string]string{"course_name": courseName}
	result, err := s.executeStep(ctx, "generate_outcomes", apiKey, payload, buildRAGFilters(teamDocIDs, globalDocIDs))
	if err != nil {
		return nil, err
	}

	return &GenerateOutcomesResult{
		Outcomes: stringFromMap(result, "outcomes"),
	}, nil
}

// GenerateSMEPersonasResult holds the result of SME persona generation.
type GenerateSMEPersonasResult struct {
	Personas []entity.WizardSMEPersona
}

// GenerateSMEPersonas generates 3 SME personas based on course topic.
func (s *WizardService) GenerateSMEPersonas(ctx context.Context, kratosID uuid.UUID, title, description string, teamDocIDs, globalDocIDs []string) (*GenerateSMEPersonasResult, error) {
	_, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	apiKey, err := s.getAPIKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	payload := map[string]string{"title": title, "description": description}
	result, err := s.executeStep(ctx, "generate_sme_personas", apiKey, payload, buildRAGFilters(teamDocIDs, globalDocIDs))
	if err != nil {
		return nil, err
	}

	personas := parseSMEPersonas(result)
	return &GenerateSMEPersonasResult{Personas: personas}, nil
}

// GenerateAudiencePersonasResult holds the result of audience persona generation.
type GenerateAudiencePersonasResult struct {
	Personas []entity.WizardAudiencePersona
}

// GenerateAudiencePersonas generates 3 audience personas.
func (s *WizardService) GenerateAudiencePersonas(ctx context.Context, kratosID uuid.UUID, title, description string, selectedSMEs []entity.WizardSMEPersona, teamDocIDs, globalDocIDs []string) (*GenerateAudiencePersonasResult, error) {
	_, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	apiKey, err := s.getAPIKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	payload := map[string]interface{}{
		"title":        title,
		"description":  description,
		"sme_personas": selectedSMEs,
	}
	result, err := s.executeStep(ctx, "generate_audience_personas", apiKey, payload, buildRAGFilters(teamDocIDs, globalDocIDs))
	if err != nil {
		return nil, err
	}

	personas := parseAudiencePersonas(result)
	return &GenerateAudiencePersonasResult{Personas: personas}, nil
}

// GenerateToneOptionsResult holds the result of tone option generation.
type GenerateToneOptionsResult struct {
	Options []entity.WizardToneOption
}

// GenerateToneOptions generates 3 tone/style options.
func (s *WizardService) GenerateToneOptions(ctx context.Context, kratosID uuid.UUID, title, description string, selectedAudiences []entity.WizardAudiencePersona, teamDocIDs, globalDocIDs []string) (*GenerateToneOptionsResult, error) {
	_, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	apiKey, err := s.getAPIKey(ctx, tenantID)
	if err != nil {
		return nil, err
	}

	payload := map[string]interface{}{
		"title":             title,
		"description":       description,
		"audience_personas": selectedAudiences,
	}
	result, err := s.executeStep(ctx, "generate_tone_options", apiKey, payload, buildRAGFilters(teamDocIDs, globalDocIDs))
	if err != nil {
		return nil, err
	}

	options := parseToneOptions(result)
	return &GenerateToneOptionsResult{Options: options}, nil
}

// ---------------------------------------------------------------------------
// State management
// ---------------------------------------------------------------------------

// SaveState persists wizard progress for later resume.
func (s *WizardService) SaveState(ctx context.Context, kratosID uuid.UUID, currentStep string, data *entity.WizardStepData) (*entity.WizardState, error) {
	user, tenantID, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	state := &entity.WizardState{
		ID:          uuid.New(),
		TenantID:    tenantID,
		UserID:      user.ID,
		CurrentStep: currentStep,
		Data:        data,
	}

	result, err := s.wizardRepo.Upsert(ctx, state)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return result, nil
}

// GetState retrieves saved wizard state for the current user.
func (s *WizardService) GetState(ctx context.Context, kratosID uuid.UUID) (*entity.WizardState, error) {
	user, _, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return nil, err
	}

	state, err := s.wizardRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}
	return state, nil // nil is valid (no saved state)
}

// DeleteState removes wizard state after completion or cancellation.
func (s *WizardService) DeleteState(ctx context.Context, kratosID uuid.UUID) error {
	user, _, err := s.resolveUser(ctx, kratosID)
	if err != nil {
		return err
	}

	if err := s.wizardRepo.Delete(ctx, user.ID); err != nil {
		return domainerrors.ErrInternal.WithCause(err)
	}
	return nil
}

// ---------------------------------------------------------------------------
// JSON parsing helpers
// ---------------------------------------------------------------------------

func stringFromMap(m map[string]interface{}, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func parseSMEPersonas(result map[string]interface{}) []entity.WizardSMEPersona {
	raw, ok := result["personas"]
	if !ok {
		return nil
	}

	// Re-marshal and unmarshal to leverage JSON tags
	b, err := json.Marshal(raw)
	if err != nil {
		return nil
	}

	var personas []entity.WizardSMEPersona
	if err := json.Unmarshal(b, &personas); err != nil {
		return nil
	}
	return personas
}

func parseAudiencePersonas(result map[string]interface{}) []entity.WizardAudiencePersona {
	raw, ok := result["personas"]
	if !ok {
		return nil
	}

	b, err := json.Marshal(raw)
	if err != nil {
		return nil
	}

	var personas []entity.WizardAudiencePersona
	if err := json.Unmarshal(b, &personas); err != nil {
		return nil
	}
	return personas
}

func parseToneOptions(result map[string]interface{}) []entity.WizardToneOption {
	raw, ok := result["options"]
	if !ok {
		return nil
	}

	b, err := json.Marshal(raw)
	if err != nil {
		return nil
	}

	var options []entity.WizardToneOption
	if err := json.Unmarshal(b, &options); err != nil {
		return nil
	}
	return options
}
