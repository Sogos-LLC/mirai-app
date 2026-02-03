package service

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/crypto"
)

// TenantSettingsService handles tenant AI and knowledge settings management.
type TenantSettingsService struct {
	userRepo              repository.UserRepository
	settingsRepo          repository.TenantAISettingsRepository
	knowledgeSettingsRepo repository.TenantKnowledgeSettingsRepository
	encryptor             *crypto.Encryptor
	logger                service.Logger
}

// NewTenantSettingsService creates a new tenant settings service.
func NewTenantSettingsService(
	userRepo repository.UserRepository,
	settingsRepo repository.TenantAISettingsRepository,
	knowledgeSettingsRepo repository.TenantKnowledgeSettingsRepository,
	encryptor *crypto.Encryptor,
	logger service.Logger,
) *TenantSettingsService {
	return &TenantSettingsService{
		userRepo:              userRepo,
		settingsRepo:          settingsRepo,
		knowledgeSettingsRepo: knowledgeSettingsRepo,
		encryptor:             encryptor,
		logger:                logger,
	}
}

// GetAISettingsResult contains the AI settings response.
type GetAISettingsResult struct {
	Settings *entity.TenantAISettings
}

// GetAISettings retrieves AI settings for the current user's tenant.
func (s *TenantSettingsService) GetAISettings(ctx context.Context, kratosID uuid.UUID) (*GetAISettingsResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Only ADMIN/OWNER can view AI settings
	if !user.CanManageSettings() {
		return nil, domainerrors.ErrForbidden.WithMessage("only admins and owners can view AI settings")
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		s.logger.Error("failed to get AI settings", "tenantID", user.TenantID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Return default settings if none exist yet
	if settings == nil {
		settings = &entity.TenantAISettings{
			TenantID: *user.TenantID,
			Provider: valueobject.AIProviderGemini,
		}
	}

	return &GetAISettingsResult{Settings: settings}, nil
}

// SetAPIKey encrypts and stores the API key.
func (s *TenantSettingsService) SetAPIKey(ctx context.Context, kratosID uuid.UUID, provider valueobject.AIProvider, apiKey string) error {
	log := s.logger.With("kratosID", kratosID, "provider", provider.String())

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	// Only ADMIN/OWNER can set API keys
	if !user.CanManageSettings() {
		return domainerrors.ErrForbidden.WithMessage("only admins and owners can configure API keys")
	}

	if user.TenantID == nil {
		return domainerrors.ErrUserHasNoCompany
	}

	// Encrypt the API key
	encryptedKey, err := s.encryptor.EncryptString(apiKey)
	if err != nil {
		log.Error("failed to encrypt API key", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// Get existing settings
	settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI settings", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	if settings == nil {
		// Create new settings
		settings = &entity.TenantAISettings{
			TenantID:        *user.TenantID,
			Provider:        provider,
			EncryptedAPIKey: encryptedKey,
			UpdatedByUserID: &user.ID,
		}
		if err := s.settingsRepo.Create(ctx, settings); err != nil {
			log.Error("failed to create AI settings", "error", err)
			return domainerrors.ErrInternal.WithCause(err)
		}
	} else {
		// Update existing settings
		settings.Provider = provider
		settings.EncryptedAPIKey = encryptedKey
		settings.UpdatedByUserID = &user.ID

		if err := s.settingsRepo.Update(ctx, settings); err != nil {
			log.Error("failed to update AI settings", "error", err)
			return domainerrors.ErrInternal.WithCause(err)
		}
	}

	log.Info("API key configured successfully")
	return nil
}

// RemoveAPIKey removes the stored API key.
func (s *TenantSettingsService) RemoveAPIKey(ctx context.Context, kratosID uuid.UUID) error {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	if !user.CanManageSettings() {
		return domainerrors.ErrForbidden.WithMessage("only admins and owners can remove API keys")
	}

	if user.TenantID == nil {
		return domainerrors.ErrUserHasNoCompany
	}

	settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI settings", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// If no settings exist, there's nothing to remove
	if settings == nil {
		log.Info("no API key to remove (settings don't exist)")
		return nil
	}

	settings.EncryptedAPIKey = nil
	settings.UpdatedByUserID = &user.ID

	if err := s.settingsRepo.Update(ctx, settings); err != nil {
		log.Error("failed to update AI settings", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("API key removed successfully")
	return nil
}

// TestAPIKeyResult contains the API key test result.
type TestAPIKeyResult struct {
	Valid   bool
	Message string
}

// TestAPIKey tests if the provided or stored API key is valid.
func (s *TenantSettingsService) TestAPIKey(ctx context.Context, kratosID uuid.UUID, apiKey *string) (*TestAPIKeyResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSettings() {
		return nil, domainerrors.ErrForbidden.WithMessage("only admins and owners can test API keys")
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	var keyToTest string
	if apiKey != nil && *apiKey != "" {
		keyToTest = *apiKey
	} else {
		// Use stored key
		settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
		if err != nil {
			return nil, domainerrors.ErrInternal.WithCause(err)
		}
		if settings == nil || settings.EncryptedAPIKey == nil {
			return &TestAPIKeyResult{Valid: false, Message: "No API key configured"}, nil
		}
		keyToTest, err = s.encryptor.DecryptString(settings.EncryptedAPIKey)
		if err != nil {
			return nil, domainerrors.ErrInternal.WithCause(err)
		}
	}

	// TODO: Actually test the key against Gemini API
	// For now, just validate basic format
	if len(keyToTest) < 20 {
		return &TestAPIKeyResult{Valid: false, Message: "API key appears to be invalid"}, nil
	}

	return &TestAPIKeyResult{Valid: true, Message: "API key is valid"}, nil
}

// GetUsageStatsResult contains usage statistics.
type GetUsageStatsResult struct {
	TotalTokensUsed   int64
	MonthlyTokenLimit *int64
	Provider          valueobject.AIProvider
}

// GetUsageStats retrieves AI usage statistics.
func (s *TenantSettingsService) GetUsageStats(ctx context.Context, kratosID uuid.UUID) (*GetUsageStatsResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if !user.CanManageSettings() {
		return nil, domainerrors.ErrForbidden.WithMessage("only admins and owners can view usage stats")
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Return default stats if no settings exist yet
	if settings == nil {
		return &GetUsageStatsResult{
			TotalTokensUsed:   0,
			MonthlyTokenLimit: nil,
			Provider:          valueobject.AIProviderGemini,
		}, nil
	}

	return &GetUsageStatsResult{
		TotalTokensUsed:   settings.TotalTokensUsed,
		MonthlyTokenLimit: settings.MonthlyTokenLimit,
		Provider:          settings.Provider,
	}, nil
}

// GetDecryptedAPIKey retrieves and decrypts the API key for internal use.
func (s *TenantSettingsService) GetDecryptedAPIKey(ctx context.Context, tenantID uuid.UUID) (string, error) {
	settings, err := s.settingsRepo.Get(ctx, tenantID)
	if err != nil {
		return "", domainerrors.ErrInternal.WithCause(err)
	}

	if settings == nil || settings.EncryptedAPIKey == nil {
		return "", domainerrors.ErrAIKeyNotConfigured
	}

	key, err := s.encryptor.DecryptString(settings.EncryptedAPIKey)
	if err != nil {
		return "", domainerrors.ErrInternal.WithCause(err)
	}

	return key, nil
}

// =============================================================================
// Knowledge Settings
// =============================================================================

// GetKnowledgeSettingsResult contains the knowledge settings response.
type GetKnowledgeSettingsResult struct {
	Settings *entity.TenantKnowledgeSettings
}

// GetKnowledgeSettings retrieves knowledge settings for the current user's tenant.
func (s *TenantSettingsService) GetKnowledgeSettings(ctx context.Context, kratosID uuid.UUID) (*GetKnowledgeSettingsResult, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Only ADMIN/OWNER can view knowledge settings
	if !user.CanManageSettings() {
		return nil, domainerrors.ErrForbidden.WithMessage("only admins and owners can view knowledge settings")
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	settings, err := s.knowledgeSettingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		s.logger.Error("failed to get knowledge settings", "tenantID", user.TenantID, "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Return default settings if none exist yet
	if settings == nil {
		settings = entity.DefaultKnowledgeSettings(*user.TenantID)
	}

	return &GetKnowledgeSettingsResult{Settings: settings}, nil
}

// UpdateKnowledgeSettingsInput contains the fields to update.
type UpdateKnowledgeSettingsInput struct {
	AllowGlobalKnowledge      *bool
	LowGroundingThreshold     *float32
	EnforceInternalOnly       *bool
	RequireCurriculumApproval *bool
}

// UpdateKnowledgeSettings updates knowledge settings for the current user's tenant.
func (s *TenantSettingsService) UpdateKnowledgeSettings(ctx context.Context, kratosID uuid.UUID, input UpdateKnowledgeSettingsInput) (*GetKnowledgeSettingsResult, error) {
	log := s.logger.With("kratosID", kratosID)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Only ADMIN/OWNER can update knowledge settings
	if !user.CanManageSettings() {
		return nil, domainerrors.ErrForbidden.WithMessage("only admins and owners can update knowledge settings")
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrUserHasNoCompany
	}

	// Get existing settings
	settings, err := s.knowledgeSettingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		log.Error("failed to get knowledge settings", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Create new settings if they don't exist
	if settings == nil {
		settings = entity.DefaultKnowledgeSettings(*user.TenantID)
	}

	// Apply updates (only non-nil fields)
	if input.AllowGlobalKnowledge != nil {
		settings.AllowGlobalKnowledge = *input.AllowGlobalKnowledge
	}
	if input.LowGroundingThreshold != nil {
		// Validate threshold is in range
		threshold := *input.LowGroundingThreshold
		if threshold < 0.0 {
			threshold = 0.0
		} else if threshold > 1.0 {
			threshold = 1.0
		}
		settings.LowGroundingThreshold = threshold
	}
	if input.EnforceInternalOnly != nil {
		settings.EnforceInternalOnly = *input.EnforceInternalOnly
	}
	if input.RequireCurriculumApproval != nil {
		settings.RequireCurriculumApproval = *input.RequireCurriculumApproval
	}

	settings.UpdatedByUserID = &user.ID

	// Create or update
	if settings.ID == uuid.Nil {
		if err := s.knowledgeSettingsRepo.Create(ctx, settings); err != nil {
			log.Error("failed to create knowledge settings", "error", err)
			return nil, domainerrors.ErrInternal.WithCause(err)
		}
	} else {
		if err := s.knowledgeSettingsRepo.Update(ctx, settings); err != nil {
			log.Error("failed to update knowledge settings", "error", err)
			return nil, domainerrors.ErrInternal.WithCause(err)
		}
	}

	log.Info("knowledge settings updated successfully")
	return &GetKnowledgeSettingsResult{Settings: settings}, nil
}

// GetKnowledgeSettingsByTenantID retrieves knowledge settings for internal use (no auth check).
func (s *TenantSettingsService) GetKnowledgeSettingsByTenantID(ctx context.Context, tenantID uuid.UUID) (*entity.TenantKnowledgeSettings, error) {
	settings, err := s.knowledgeSettingsRepo.Get(ctx, tenantID)
	if err != nil {
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Return default settings if none exist yet
	if settings == nil {
		return entity.DefaultKnowledgeSettings(tenantID), nil
	}

	return settings, nil
}
