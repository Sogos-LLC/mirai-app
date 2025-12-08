package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
)

// CourseWizardService handles the course creation wizard workflow.
// This provides a "spoon-fed" experience for creating courses with AI-generated
// personas, audience profiles, and tone options.
type CourseWizardService struct {
	userRepo          repository.UserRepository
	wizardRepo        repository.WizardStateRepository
	aiProviderFactory AIProviderFactory
	aiSettingsRepo    repository.TenantAISettingsRepository
	logger            service.Logger
}

// NewCourseWizardService creates a new course wizard service.
func NewCourseWizardService(
	userRepo repository.UserRepository,
	wizardRepo repository.WizardStateRepository,
	aiProviderFactory AIProviderFactory,
	aiSettingsRepo repository.TenantAISettingsRepository,
	logger service.Logger,
) *CourseWizardService {
	return &CourseWizardService{
		userRepo:          userRepo,
		wizardRepo:        wizardRepo,
		aiProviderFactory: aiProviderFactory,
		aiSettingsRepo:    aiSettingsRepo,
		logger:            logger,
	}
}

// =============================================================================
// AI Generation Methods (Synchronous, fast operations)
// =============================================================================

// GenerateTitleResult contains the improved title and description.
type GenerateTitleResult struct {
	ImprovedTitle string
	Description   string
	TokensUsed    int64
}

// GenerateTitle improves the course name and generates a description.
func (s *CourseWizardService) GenerateTitle(ctx context.Context, kratosID uuid.UUID, courseName string) (*GenerateTitleResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseName", courseName)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Set tenant context for RLS
	tenantCtx := tenant.WithTenantID(ctx, *user.TenantID)

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(tenantCtx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return nil, err
	}

	// Generate improved title
	result, err := aiProvider.GenerateImprovedTitle(tenantCtx, courseName)
	if err != nil {
		log.Error("failed to generate improved title", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("AI generation failed")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(tenantCtx, *user.TenantID, result.TokensUsed)

	log.Info("generated improved title", "tokensUsed", result.TokensUsed)

	return &GenerateTitleResult{
		ImprovedTitle: result.ImprovedTitle,
		Description:   result.Description,
		TokensUsed:    result.TokensUsed,
	}, nil
}

// GenerateSMEPersonasResult contains generated SME personas.
type GenerateSMEPersonasResult struct {
	Personas   []entity.WizardSMEPersona
	TokensUsed int64
}

// GenerateSMEPersonas generates 3 diverse SME personas based on course topic.
func (s *CourseWizardService) GenerateSMEPersonas(ctx context.Context, kratosID uuid.UUID, title, description string) (*GenerateSMEPersonasResult, error) {
	log := s.logger.With("kratosID", kratosID, "title", title)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Set tenant context for RLS
	tenantCtx := tenant.WithTenantID(ctx, *user.TenantID)

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(tenantCtx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return nil, err
	}

	// Generate SME personas
	result, err := aiProvider.GenerateSMEPersonas(tenantCtx, title, description)
	if err != nil {
		log.Error("failed to generate SME personas", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("AI generation failed")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(tenantCtx, *user.TenantID, result.TokensUsed)

	// Convert to entity types
	personas := make([]entity.WizardSMEPersona, len(result.Personas))
	for i, p := range result.Personas {
		personas[i] = entity.WizardSMEPersona{
			ID:          p.ID,
			JobTitle:    p.JobTitle,
			Description: p.Description,
			Skills:      p.Skills,
			Voice:       p.Voice,
		}
	}

	log.Info("generated SME personas", "count", len(personas), "tokensUsed", result.TokensUsed)

	return &GenerateSMEPersonasResult{
		Personas:   personas,
		TokensUsed: result.TokensUsed,
	}, nil
}

// GenerateAudiencePersonasRequest contains inputs for audience persona generation.
type GenerateAudiencePersonasRequest struct {
	Title       string
	Description string
	SMEPersonas []entity.WizardSMEPersona
}

// GenerateAudiencePersonasResult contains generated audience personas.
type GenerateAudiencePersonasResult struct {
	Personas   []entity.WizardAudiencePersona
	TokensUsed int64
}

// GenerateAudiencePersonas generates 3 diverse audience personas.
func (s *CourseWizardService) GenerateAudiencePersonas(ctx context.Context, kratosID uuid.UUID, req GenerateAudiencePersonasRequest) (*GenerateAudiencePersonasResult, error) {
	log := s.logger.With("kratosID", kratosID, "title", req.Title)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Set tenant context for RLS
	tenantCtx := tenant.WithTenantID(ctx, *user.TenantID)

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(tenantCtx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return nil, err
	}

	// Convert entity types to service types
	smePersonas := make([]service.WizardSMEPersona, len(req.SMEPersonas))
	for i, p := range req.SMEPersonas {
		smePersonas[i] = service.WizardSMEPersona{
			ID:          p.ID,
			JobTitle:    p.JobTitle,
			Description: p.Description,
			Skills:      p.Skills,
			Voice:       p.Voice,
		}
	}

	// Generate audience personas
	result, err := aiProvider.GenerateAudiencePersonas(tenantCtx, service.GenerateAudiencePersonasRequest{
		Title:       req.Title,
		Description: req.Description,
		SMEPersonas: smePersonas,
	})
	if err != nil {
		log.Error("failed to generate audience personas", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("AI generation failed")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(tenantCtx, *user.TenantID, result.TokensUsed)

	// Convert to entity types
	personas := make([]entity.WizardAudiencePersona, len(result.Personas))
	for i, p := range result.Personas {
		personas[i] = entity.WizardAudiencePersona{
			ID:          p.ID,
			Name:        p.Name,
			Role:        p.Role,
			Description: p.Description,
			Goals:       p.Goals,
		}
	}

	log.Info("generated audience personas", "count", len(personas), "tokensUsed", result.TokensUsed)

	return &GenerateAudiencePersonasResult{
		Personas:   personas,
		TokensUsed: result.TokensUsed,
	}, nil
}

// GenerateToneOptionsRequest contains inputs for tone option generation.
type GenerateToneOptionsRequest struct {
	Title            string
	Description      string
	AudiencePersonas []entity.WizardAudiencePersona
}

// GenerateToneOptionsResult contains generated tone options.
type GenerateToneOptionsResult struct {
	Options    []entity.WizardToneOption
	TokensUsed int64
}

// GenerateToneOptions generates 3 tone/style options for the course.
func (s *CourseWizardService) GenerateToneOptions(ctx context.Context, kratosID uuid.UUID, req GenerateToneOptionsRequest) (*GenerateToneOptionsResult, error) {
	log := s.logger.With("kratosID", kratosID, "title", req.Title)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Set tenant context for RLS
	tenantCtx := tenant.WithTenantID(ctx, *user.TenantID)

	// Get tenant-specific AI provider
	aiProvider, err := s.aiProviderFactory.GetProvider(tenantCtx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI provider", "error", err)
		return nil, err
	}

	// Convert entity types to service types
	audiencePersonas := make([]service.WizardAudiencePersona, len(req.AudiencePersonas))
	for i, p := range req.AudiencePersonas {
		audiencePersonas[i] = service.WizardAudiencePersona{
			ID:          p.ID,
			Name:        p.Name,
			Role:        p.Role,
			Description: p.Description,
			Goals:       p.Goals,
		}
	}

	// Generate tone options
	result, err := aiProvider.GenerateToneOptions(tenantCtx, service.GenerateToneOptionsRequest{
		Title:            req.Title,
		Description:      req.Description,
		AudiencePersonas: audiencePersonas,
	})
	if err != nil {
		log.Error("failed to generate tone options", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("AI generation failed")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(tenantCtx, *user.TenantID, result.TokensUsed)

	// Convert to entity types
	options := make([]entity.WizardToneOption, len(result.Options))
	for i, o := range result.Options {
		options[i] = entity.WizardToneOption{
			ID:            o.ID,
			Name:          o.Name,
			Description:   o.Description,
			LevelOfDetail: entity.ParseToneDetailLevel(o.LevelOfDetail),
		}
	}

	log.Info("generated tone options", "count", len(options), "tokensUsed", result.TokensUsed)

	return &GenerateToneOptionsResult{
		Options:    options,
		TokensUsed: result.TokensUsed,
	}, nil
}

// =============================================================================
// Wizard State Management
// =============================================================================

// GetWizardState retrieves the wizard state for the current user.
// Returns nil if no state exists.
func (s *CourseWizardService) GetWizardState(ctx context.Context, kratosID uuid.UUID) (*entity.WizardState, error) {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	state, err := s.wizardRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		log.Error("failed to get wizard state", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	return state, nil
}

// SaveWizardStateRequest contains data for saving wizard state.
type SaveWizardStateRequest struct {
	CurrentStep string
	Data        *entity.WizardStepData
}

// SaveWizardState saves or updates the wizard state for the current user.
func (s *CourseWizardService) SaveWizardState(ctx context.Context, kratosID uuid.UUID, req SaveWizardStateRequest) (*entity.WizardState, error) {
	log := s.logger.With("kratosID", kratosID, "step", req.CurrentStep)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Get existing state or create new
	state, err := s.wizardRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		log.Error("failed to get existing wizard state", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	if state == nil {
		// Create new state
		state = &entity.WizardState{
			ID:          uuid.New(),
			TenantID:    *user.TenantID,
			UserID:      user.ID,
			CurrentStep: req.CurrentStep,
			Data:        req.Data,
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
		}
	} else {
		// Update existing state
		state.CurrentStep = req.CurrentStep
		state.Data = req.Data
	}

	// Upsert the state
	if err := s.wizardRepo.Upsert(ctx, state); err != nil {
		log.Error("failed to save wizard state", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("wizard state saved")
	return state, nil
}

// DeleteWizardState removes the wizard state for the current user.
// Called after course creation or cancellation.
func (s *CourseWizardService) DeleteWizardState(ctx context.Context, kratosID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	if err := s.wizardRepo.Delete(ctx, user.ID); err != nil {
		log.Error("failed to delete wizard state", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("wizard state deleted")
	return nil
}
