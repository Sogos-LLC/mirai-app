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

// TargetAudienceRepository implements repository.TargetAudienceRepository using sqlc-generated code.
type TargetAudienceRepository struct {
	db *sql.DB
}

// NewTargetAudienceRepository creates a new sqlc-based target audience repository.
func NewTargetAudienceRepository(db *sql.DB) repository.TargetAudienceRepository {
	return &TargetAudienceRepository{db: db}
}

// Create creates a new template.
func (r *TargetAudienceRepository) Create(ctx context.Context, template *entity.TargetAudienceTemplate) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TargetAudienceTemplate, error) {
		return q.CreateTargetAudienceTemplate(ctx, gen.CreateTargetAudienceTemplateParams{
			TenantID:          template.TenantID,
			CompanyID:         template.CompanyID,
			Name:              template.Name,
			Description:       stringToNullString(template.Description),
			Role:              stringToNullString(template.Role),
			ExperienceLevel:   toExperienceLevel(template.ExperienceLevel.String()),
			LearningGoals:     template.LearningGoals,
			Prerequisites:     template.Prerequisites,
			Challenges:        template.Challenges,
			Motivations:       template.Motivations,
			IndustryContext:   toNullString(template.IndustryContext),
			TypicalBackground: toNullString(template.TypicalBackground),
			Status:            toTargetAudienceStatus(template.Status.String()),
			CreatedByUserID:   template.CreatedByUserID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create template: %w", err)
	}

	template.ID = result.ID
	template.CreatedAt = result.CreatedAt
	template.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a template by its ID.
func (r *TargetAudienceRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.TargetAudienceTemplate, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TargetAudienceTemplate, error) {
		return q.GetTargetAudienceTemplateByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get template: %w", err)
	}
	return toTargetAudienceTemplateEntity(&result), nil
}

// List retrieves all templates for the current tenant.
func (r *TargetAudienceRepository) List(ctx context.Context) ([]*entity.TargetAudienceTemplate, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.TargetAudienceTemplate, error) {
		return q.ListTargetAudienceTemplates(ctx)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}

	templates := make([]*entity.TargetAudienceTemplate, len(results))
	for i := range results {
		templates[i] = toTargetAudienceTemplateEntity(&results[i])
	}
	return templates, nil
}

// Update updates a template.
func (r *TargetAudienceRepository) Update(ctx context.Context, template *entity.TargetAudienceTemplate) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TargetAudienceTemplate, error) {
		return q.UpdateTargetAudienceTemplate(ctx, gen.UpdateTargetAudienceTemplateParams{
			Name:              template.Name,
			Description:       stringToNullString(template.Description),
			Role:              stringToNullString(template.Role),
			ExperienceLevel:   toExperienceLevel(template.ExperienceLevel.String()),
			LearningGoals:     template.LearningGoals,
			Prerequisites:     template.Prerequisites,
			Challenges:        template.Challenges,
			Motivations:       template.Motivations,
			IndustryContext:   toNullString(template.IndustryContext),
			TypicalBackground: toNullString(template.TypicalBackground),
			Status:            toTargetAudienceStatus(template.Status.String()),
			ID:                template.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update template: %w", err)
	}

	template.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a template.
func (r *TargetAudienceRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteTargetAudienceTemplate(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete template: %w", err)
	}
	return nil
}

func toTargetAudienceTemplateEntity(t *gen.TargetAudienceTemplate) *entity.TargetAudienceTemplate {
	expLevel, _ := valueobject.ParseExperienceLevel(string(t.ExperienceLevel))
	status, _ := valueobject.ParseTargetAudienceStatus(string(t.Status))
	return &entity.TargetAudienceTemplate{
		ID:                t.ID,
		TenantID:          t.TenantID,
		CompanyID:         t.CompanyID,
		Name:              t.Name,
		Description:       fromNullString(t.Description),
		Role:              fromNullString(t.Role),
		ExperienceLevel:   expLevel,
		LearningGoals:     t.LearningGoals,
		Prerequisites:     t.Prerequisites,
		Challenges:        t.Challenges,
		Motivations:       t.Motivations,
		IndustryContext:   fromNullStringPtr(t.IndustryContext),
		TypicalBackground: fromNullStringPtr(t.TypicalBackground),
		Status:            status,
		CreatedByUserID:   t.CreatedByUserID,
		CreatedAt:         t.CreatedAt,
		UpdatedAt:         t.UpdatedAt,
	}
}
