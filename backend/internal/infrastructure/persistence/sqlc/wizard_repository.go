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
)

// WizardStateRepository implements repository.WizardStateRepository using sqlc.
type WizardStateRepository struct {
	db *sql.DB
}

// NewWizardStateRepository creates a new sqlc-based wizard state repository.
func NewWizardStateRepository(db *sql.DB) repository.WizardStateRepository {
	return &WizardStateRepository{db: db}
}

// GetByUserID retrieves wizard state for a user. Returns (nil, nil) if none exists.
func (r *WizardStateRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.WizardState, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.WizardState, error) {
		return q.GetWizardStateByUserID(ctx, userID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get wizard state: %w", err)
	}
	return toWizardStateEntity(&result)
}

// Upsert creates or updates wizard state for a user.
func (r *WizardStateRepository) Upsert(ctx context.Context, state *entity.WizardState) (*entity.WizardState, error) {
	dataJSON, err := state.Data.ToJSON()
	if err != nil {
		return nil, fmt.Errorf("serialize wizard data: %w", err)
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
		return nil, fmt.Errorf("upsert wizard state: %w", err)
	}
	return toWizardStateEntity(&result)
}

// Delete removes wizard state for a user.
func (r *WizardStateRepository) Delete(ctx context.Context, userID uuid.UUID) error {
	return database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteWizardState(ctx, userID)
	})
}

// toWizardStateEntity converts a sqlc-generated WizardState to a domain entity.
func toWizardStateEntity(s *gen.WizardState) (*entity.WizardState, error) {
	stepData, err := entity.WizardStepDataFromJSON(s.Data)
	if err != nil {
		return nil, fmt.Errorf("parse wizard step data: %w", err)
	}
	return &entity.WizardState{
		ID:          s.ID,
		TenantID:    s.TenantID,
		UserID:      s.UserID,
		CurrentStep: s.CurrentStep,
		Data:        stepData,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}, nil
}
