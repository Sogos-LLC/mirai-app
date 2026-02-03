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
	userRepo               repository.UserRepository
	wizardRepo             repository.WizardStateRepository
	aiProviderFactory      AIProviderFactory
	aiSettingsRepo         repository.TenantAISettingsRepository
	knowledgeSourceService *KnowledgeSourceService
	logger                 service.Logger
}

// NewCourseWizardService creates a new course wizard service.
func NewCourseWizardService(
	userRepo repository.UserRepository,
	wizardRepo repository.WizardStateRepository,
	aiProviderFactory AIProviderFactory,
	aiSettingsRepo repository.TenantAISettingsRepository,
	knowledgeSourceService *KnowledgeSourceService,
	logger service.Logger,
) *CourseWizardService {
	return &CourseWizardService{
		userRepo:               userRepo,
		wizardRepo:             wizardRepo,
		aiProviderFactory:      aiProviderFactory,
		aiSettingsRepo:         aiSettingsRepo,
		knowledgeSourceService: knowledgeSourceService,
		logger:                 logger,
	}
}

// =============================================================================
// AI Generation Methods (Synchronous, fast operations)
// =============================================================================

// GenerateTitleInput contains inputs for title generation.
type GenerateTitleInput struct {
	CourseName           string
	SelectedTeamDocIDs   []string // Selected team knowledge source IDs
	SelectedGlobalDocIDs []string // Selected global knowledge source IDs
}

// GenerateTitleResult contains the improved title and description.
type GenerateTitleResult struct {
	ImprovedTitle string
	Description   string
	TokensUsed    int64
}

// GenerateTitle improves the course name and generates a description.
func (s *CourseWizardService) GenerateTitle(ctx context.Context, kratosID uuid.UUID, input GenerateTitleInput) (*GenerateTitleResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseName", input.CourseName)

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

	// Build RAG context from selected knowledge sources
	var ragContext []service.RAGChunk
	if s.knowledgeSourceService != nil && (len(input.SelectedTeamDocIDs) > 0 || len(input.SelectedGlobalDocIDs) > 0) {
		allSourceIDs := append(input.SelectedTeamDocIDs, input.SelectedGlobalDocIDs...)
		chunks, err := s.knowledgeSourceService.SearchKnowledgeBySourceIDs(tenantCtx, allSourceIDs, input.CourseName, 10)
		if err != nil {
			log.Warn("failed to search knowledge by source IDs", "error", err)
			// Continue without RAG context
		} else if len(chunks) > 0 {
			ragContext = make([]service.RAGChunk, len(chunks))
			for i, chunk := range chunks {
				ragContext[i] = service.RAGChunk{
					SourceID:       chunk.SourceID.String(),
					SourceName:     chunk.SourceName,
					Content:        chunk.Content,
					RelevanceScore: chunk.SimilarityScore,
				}
			}
			log.Info("added RAG context from selected knowledge sources", "chunkCount", len(ragContext))
		}
	}

	// Generate improved title (TODO: pass RAG context to AI provider)
	_ = ragContext // RAG context available for future enhancement
	result, err := aiProvider.GenerateImprovedTitle(tenantCtx, input.CourseName)
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

// GenerateOutcomesInput contains inputs for course outcome generation.
type GenerateOutcomesInput struct {
	CourseName           string
	SessionID            string   // Optional - for RAG context from uploaded knowledge sources
	SelectedTeamDocIDs   []string // Selected team knowledge source IDs
	SelectedGlobalDocIDs []string // Selected global knowledge source IDs
}

// GenerateOutcomesResult contains AI-generated course outcomes.
type GenerateOutcomesResult struct {
	Outcomes   string
	Citations  []KnowledgeCitation
	TokensUsed int64
}

// KnowledgeCitation represents a reference to a knowledge source used in generation.
type KnowledgeCitation struct {
	SourceID       string
	SourceName     string
	Excerpt        string
	RelevanceScore float32
}

// GenerateOutcomes generates desired course outcomes from a course name.
// Used by the "magic wand" button in wizard step 1.
// If sessionID is provided, knowledge sources from that session will be used for RAG.
func (s *CourseWizardService) GenerateOutcomes(ctx context.Context, kratosID uuid.UUID, input GenerateOutcomesInput) (*GenerateOutcomesResult, error) {
	log := s.logger.With("kratosID", kratosID, "courseName", input.CourseName, "sessionID", input.SessionID)

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

	// Build RAG context from selected knowledge sources AND session uploads
	var ragContext []service.RAGChunk
	if s.knowledgeSourceService != nil {
		// First, search by selected source IDs (team + global knowledge)
		if len(input.SelectedTeamDocIDs) > 0 || len(input.SelectedGlobalDocIDs) > 0 {
			allSourceIDs := append(input.SelectedTeamDocIDs, input.SelectedGlobalDocIDs...)
			chunks, err := s.knowledgeSourceService.SearchKnowledgeBySourceIDs(tenantCtx, allSourceIDs, input.CourseName, 10)
			if err != nil {
				log.Warn("failed to search knowledge by source IDs", "error", err)
			} else if len(chunks) > 0 {
				for _, chunk := range chunks {
					ragContext = append(ragContext, service.RAGChunk{
						SourceID:       chunk.SourceID.String(),
						SourceName:     chunk.SourceName,
						Content:        chunk.Content,
						RelevanceScore: chunk.SimilarityScore,
					})
				}
				log.Info("added RAG context from selected knowledge sources", "chunkCount", len(chunks))
			}
		}

		// Then, search by session ID (newly uploaded files during wizard)
		if input.SessionID != "" {
			chunks, err := s.knowledgeSourceService.SearchKnowledgeBySession(tenantCtx, input.SessionID, input.CourseName, 5)
			if err != nil {
				log.Warn("failed to search knowledge by session", "error", err)
			} else if len(chunks) > 0 {
				for _, chunk := range chunks {
					ragContext = append(ragContext, service.RAGChunk{
						SourceID:       chunk.SourceID.String(),
						SourceName:     chunk.SourceName,
						Content:        chunk.Content,
						RelevanceScore: chunk.SimilarityScore,
					})
				}
				log.Info("added RAG context from session uploads", "chunkCount", len(chunks))
			}
		}
	}

	// Generate course outcomes with optional RAG context
	result, err := aiProvider.GenerateCourseOutcomes(tenantCtx, service.GenerateOutcomesRequest{
		CourseName: input.CourseName,
		RAGContext: ragContext,
	})
	if err != nil {
		log.Error("failed to generate course outcomes", "error", err)
		return nil, domainerrors.ErrInternal.WithMessage("AI generation failed")
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(tenantCtx, *user.TenantID, result.TokensUsed)

	log.Info("generated course outcomes", "tokensUsed", result.TokensUsed, "citationCount", len(result.Citations))

	// Convert citations
	citations := make([]KnowledgeCitation, len(result.Citations))
	for i, c := range result.Citations {
		citations[i] = KnowledgeCitation{
			SourceID:       c.SourceID,
			SourceName:     c.SourceName,
			Excerpt:        c.Excerpt,
			RelevanceScore: c.RelevanceScore,
		}
	}

	return &GenerateOutcomesResult{
		Outcomes:   result.Outcomes,
		Citations:  citations,
		TokensUsed: result.TokensUsed,
	}, nil
}

// GenerateSMEPersonasInput contains inputs for SME persona generation.
type GenerateSMEPersonasInput struct {
	Title                string
	Description          string
	SelectedTeamDocIDs   []string
	SelectedGlobalDocIDs []string
}

// GenerateSMEPersonasResult contains generated SME personas.
type GenerateSMEPersonasResult struct {
	Personas   []entity.WizardSMEPersona
	TokensUsed int64
}

// GenerateSMEPersonas generates 3 diverse SME personas based on course topic.
func (s *CourseWizardService) GenerateSMEPersonas(ctx context.Context, kratosID uuid.UUID, input GenerateSMEPersonasInput) (*GenerateSMEPersonasResult, error) {
	log := s.logger.With("kratosID", kratosID, "title", input.Title)

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

	// Build RAG context from selected knowledge sources
	// TODO: Pass RAG context to AI provider for knowledge-grounded personas
	if s.knowledgeSourceService != nil && (len(input.SelectedTeamDocIDs) > 0 || len(input.SelectedGlobalDocIDs) > 0) {
		allSourceIDs := append(input.SelectedTeamDocIDs, input.SelectedGlobalDocIDs...)
		chunks, err := s.knowledgeSourceService.SearchKnowledgeBySourceIDs(tenantCtx, allSourceIDs, input.Title+" "+input.Description, 10)
		if err != nil {
			log.Warn("failed to search knowledge by source IDs for SME generation", "error", err)
		} else if len(chunks) > 0 {
			log.Info("found RAG context for SME generation", "chunkCount", len(chunks))
			// RAG context available for future AI provider enhancement
		}
	}

	// Generate SME personas
	result, err := aiProvider.GenerateSMEPersonas(tenantCtx, input.Title, input.Description)
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
	Title                string
	Description          string
	SMEPersonas          []entity.WizardSMEPersona
	SelectedTeamDocIDs   []string
	SelectedGlobalDocIDs []string
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
	Title                string
	Description          string
	AudiencePersonas     []entity.WizardAudiencePersona
	SelectedTeamDocIDs   []string
	SelectedGlobalDocIDs []string
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
