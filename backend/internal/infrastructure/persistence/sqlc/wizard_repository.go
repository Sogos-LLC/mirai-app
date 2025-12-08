package sqlc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
)

// WizardStateRepository implements repository.WizardStateRepository using sqlc-generated code.
type WizardStateRepository struct {
	db *sql.DB
}

// NewWizardStateRepository creates a new sqlc-based wizard state repository.
func NewWizardStateRepository(db *sql.DB) repository.WizardStateRepository {
	return &WizardStateRepository{db: db}
}

// GetByUserID retrieves the wizard state for a specific user.
func (r *WizardStateRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.WizardState, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.WizardState, error) {
		return q.GetWizardStateByUserID(ctx, userID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get wizard state: %w", err)
	}
	return toWizardStateEntity(&result), nil
}

// Upsert creates or updates wizard state for a user.
func (r *WizardStateRepository) Upsert(ctx context.Context, state *entity.WizardState) error {
	dataJSON, err := state.Data.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to marshal wizard data: %w", err)
	}

	// Generate new ID if not set
	if state.ID == uuid.Nil {
		state.ID = uuid.New()
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.WizardState, error) {
		return q.UpsertWizardState(ctx, gen.UpsertWizardStateParams{
			ID:          state.ID,
			TenantID:    state.TenantID,
			UserID:      state.UserID,
			CurrentStep: state.CurrentStep,
			Data:        dataJSON,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to upsert wizard state: %w", err)
	}

	state.ID = result.ID
	state.CreatedAt = result.CreatedAt
	state.UpdatedAt = result.UpdatedAt
	return nil
}

// Update updates an existing wizard state.
func (r *WizardStateRepository) Update(ctx context.Context, state *entity.WizardState) error {
	dataJSON, err := state.Data.ToJSON()
	if err != nil {
		return fmt.Errorf("failed to marshal wizard data: %w", err)
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.WizardState, error) {
		return q.UpdateWizardState(ctx, gen.UpdateWizardStateParams{
			UserID:      state.UserID,
			CurrentStep: state.CurrentStep,
			Data:        dataJSON,
		})
	})
	if err == sql.ErrNoRows {
		return fmt.Errorf("wizard state not found")
	}
	if err != nil {
		return fmt.Errorf("failed to update wizard state: %w", err)
	}

	state.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete removes wizard state for a user.
func (r *WizardStateRepository) Delete(ctx context.Context, userID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteWizardState(ctx, userID)
	})
	if err != nil {
		return fmt.Errorf("failed to delete wizard state: %w", err)
	}
	return nil
}

// DeleteByID removes wizard state by ID.
func (r *WizardStateRepository) DeleteByID(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteWizardStateByID(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete wizard state: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toWizardStateEntity(ws *gen.WizardState) *entity.WizardState {
	var stepData *entity.WizardStepData
	if ws.Data != nil {
		stepData, _ = entity.WizardStepDataFromJSON(json.RawMessage(ws.Data))
	}

	return &entity.WizardState{
		ID:          ws.ID,
		TenantID:    ws.TenantID,
		UserID:      ws.UserID,
		CurrentStep: ws.CurrentStep,
		Data:        stepData,
		CreatedAt:   ws.CreatedAt,
		UpdatedAt:   ws.UpdatedAt,
	}
}
