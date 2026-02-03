package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TenantAISettingsRepository implements repository.TenantAISettingsRepository using sqlc-generated code.
type TenantAISettingsRepository struct {
	db *sql.DB
}

// NewTenantAISettingsRepository creates a new sqlc-based tenant AI settings repository.
func NewTenantAISettingsRepository(db *sql.DB) repository.TenantAISettingsRepository {
	return &TenantAISettingsRepository{db: db}
}

// Get retrieves AI settings for a tenant.
// Returns (nil, nil) if settings don't exist yet.
func (r *TenantAISettingsRepository) Get(ctx context.Context, tenantID uuid.UUID) (*entity.TenantAISettings, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantAiSetting, error) {
		return q.GetTenantAISettings(ctx, tenantID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get AI settings: %w", err)
	}
	return toTenantAISettingsEntity(&result), nil
}

// Create creates new AI settings for a tenant.
func (r *TenantAISettingsRepository) Create(ctx context.Context, settings *entity.TenantAISettings) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantAiSetting, error) {
		return q.CreateTenantAISettings(ctx, gen.CreateTenantAISettingsParams{
			TenantID:          settings.TenantID,
			Provider:          toAiProvider(settings.Provider.String()),
			EncryptedApiKey:   settings.EncryptedAPIKey,
			MonthlyTokenLimit: toNullInt64(settings.MonthlyTokenLimit),
			UpdatedByUserID:   toNullUUID(settings.UpdatedByUserID),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create AI settings: %w", err)
	}

	settings.ID = result.ID
	settings.TotalTokensUsed = result.TotalTokensUsed
	settings.UpdatedAt = result.UpdatedAt
	return nil
}

// Update updates AI settings.
func (r *TenantAISettingsRepository) Update(ctx context.Context, settings *entity.TenantAISettings) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantAiSetting, error) {
		return q.UpdateTenantAISettings(ctx, gen.UpdateTenantAISettingsParams{
			Provider:          toAiProvider(settings.Provider.String()),
			EncryptedApiKey:   settings.EncryptedAPIKey,
			MonthlyTokenLimit: toNullInt64(settings.MonthlyTokenLimit),
			UpdatedByUserID:   toNullUUID(settings.UpdatedByUserID),
			TenantID:          settings.TenantID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update AI settings: %w", err)
	}

	settings.UpdatedAt = result.UpdatedAt
	return nil
}

// IncrementTokenUsage increments the token usage counter.
func (r *TenantAISettingsRepository) IncrementTokenUsage(ctx context.Context, tenantID uuid.UUID, tokens int64) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.IncrementTenantAITokenUsage(ctx, gen.IncrementTenantAITokenUsageParams{
			TotalTokensUsed: tokens,
			TenantID:        tenantID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to increment token usage: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toTenantAISettingsEntity(s *gen.TenantAiSetting) *entity.TenantAISettings {
	provider, _ := valueobject.ParseAIProvider(string(s.Provider))
	return &entity.TenantAISettings{
		ID:                s.ID,
		TenantID:          s.TenantID,
		Provider:          provider,
		EncryptedAPIKey:   s.EncryptedApiKey,
		TotalTokensUsed:   s.TotalTokensUsed,
		MonthlyTokenLimit: fromNullInt64Ptr(s.MonthlyTokenLimit),
		UpdatedAt:         s.UpdatedAt,
		UpdatedByUserID:   fromNullUUIDPtr(s.UpdatedByUserID),
	}
}

// =============================================================================
// TenantKnowledgeSettingsRepository
// =============================================================================

// TenantKnowledgeSettingsRepository implements repository.TenantKnowledgeSettingsRepository using sqlc-generated code.
type TenantKnowledgeSettingsRepository struct {
	db *sql.DB
}

// NewTenantKnowledgeSettingsRepository creates a new sqlc-based tenant knowledge settings repository.
func NewTenantKnowledgeSettingsRepository(db *sql.DB) repository.TenantKnowledgeSettingsRepository {
	return &TenantKnowledgeSettingsRepository{db: db}
}

// Get retrieves knowledge settings for a tenant.
// Returns (nil, nil) if settings don't exist yet.
func (r *TenantKnowledgeSettingsRepository) Get(ctx context.Context, tenantID uuid.UUID) (*entity.TenantKnowledgeSettings, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantKnowledgeSetting, error) {
		return q.GetTenantKnowledgeSettings(ctx, tenantID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get knowledge settings: %w", err)
	}
	return toTenantKnowledgeSettingsEntity(&result), nil
}

// Create creates new knowledge settings for a tenant.
func (r *TenantKnowledgeSettingsRepository) Create(ctx context.Context, settings *entity.TenantKnowledgeSettings) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantKnowledgeSetting, error) {
		return q.CreateTenantKnowledgeSettings(ctx, gen.CreateTenantKnowledgeSettingsParams{
			TenantID:                  settings.TenantID,
			AllowGlobalKnowledge:      settings.AllowGlobalKnowledge,
			LowGroundingThreshold:     settings.LowGroundingThreshold,
			EnforceInternalOnly:       settings.EnforceInternalOnly,
			RequireCurriculumApproval: settings.RequireCurriculumApproval,
			UpdatedByUserID:           toNullUUID(settings.UpdatedByUserID),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create knowledge settings: %w", err)
	}

	settings.ID = result.ID
	settings.UpdatedAt = result.UpdatedAt
	return nil
}

// Update updates knowledge settings.
func (r *TenantKnowledgeSettingsRepository) Update(ctx context.Context, settings *entity.TenantKnowledgeSettings) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TenantKnowledgeSetting, error) {
		return q.UpdateTenantKnowledgeSettings(ctx, gen.UpdateTenantKnowledgeSettingsParams{
			AllowGlobalKnowledge:      settings.AllowGlobalKnowledge,
			LowGroundingThreshold:     settings.LowGroundingThreshold,
			EnforceInternalOnly:       settings.EnforceInternalOnly,
			RequireCurriculumApproval: settings.RequireCurriculumApproval,
			UpdatedByUserID:           toNullUUID(settings.UpdatedByUserID),
			TenantID:                  settings.TenantID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update knowledge settings: %w", err)
	}

	settings.UpdatedAt = result.UpdatedAt
	return nil
}

func toTenantKnowledgeSettingsEntity(s *gen.TenantKnowledgeSetting) *entity.TenantKnowledgeSettings {
	return &entity.TenantKnowledgeSettings{
		ID:                        s.ID,
		TenantID:                  s.TenantID,
		AllowGlobalKnowledge:      s.AllowGlobalKnowledge,
		LowGroundingThreshold:     s.LowGroundingThreshold,
		EnforceInternalOnly:       s.EnforceInternalOnly,
		RequireCurriculumApproval: s.RequireCurriculumApproval,
		UpdatedAt:                 s.UpdatedAt,
		UpdatedByUserID:           fromNullUUIDPtr(s.UpdatedByUserID),
	}
}
