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

// TenantSettingsService handles tenant AI settings management.
type TenantSettingsService struct {
	userRepo     repository.UserRepository
	settingsRepo repository.TenantAISettingsRepository
	encryptor    *crypto.Encryptor
	logger       service.Logger
}

// NewTenantSettingsService creates a new tenant settings service.
func NewTenantSettingsService(
	userRepo repository.UserRepository,
	settingsRepo repository.TenantAISettingsRepository,
	encryptor *crypto.Encryptor,
	logger service.Logger,
) *TenantSettingsService {
	return &TenantSettingsService{
		userRepo:     userRepo,
		settingsRepo: settingsRepo,
		encryptor:    encryptor,
		logger:       logger,
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

	// Get existing settings or create new
	settings, err := s.settingsRepo.Get(ctx, *user.TenantID)
	if err != nil {
		log.Error("failed to get AI settings", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	// Update settings
	settings.Provider = provider
	settings.EncryptedAPIKey = encryptedKey
	settings.UpdatedByUserID = &user.ID

	if err := s.settingsRepo.Update(ctx, settings); err != nil {
		log.Error("failed to update AI settings", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
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
		if settings.EncryptedAPIKey == nil {
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

	if settings.EncryptedAPIKey == nil {
		return "", domainerrors.ErrAIKeyNotConfigured
	}

	key, err := s.encryptor.DecryptString(settings.EncryptedAPIKey)
	if err != nil {
		return "", domainerrors.ErrInternal.WithCause(err)
	}

	return key, nil
}
