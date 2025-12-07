package sqlc

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// GeneratedLessonRepository implements repository.GeneratedLessonRepository using sqlc-generated code.
type GeneratedLessonRepository struct {
	db *sql.DB
}

// NewGeneratedLessonRepository creates a new sqlc-based generated lesson repository.
func NewGeneratedLessonRepository(db *sql.DB) repository.GeneratedLessonRepository {
	return &GeneratedLessonRepository{db: db}
}

// Create creates a new generated lesson.
func (r *GeneratedLessonRepository) Create(ctx context.Context, lesson *entity.GeneratedLesson) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GeneratedLesson, error) {
		return q.CreateGeneratedLesson(ctx, gen.CreateGeneratedLessonParams{
			TenantID:        lesson.TenantID,
			CourseID:        lesson.CourseID,
			SectionID:       lesson.SectionID,
			OutlineLessonID: lesson.OutlineLessonID,
			Title:           lesson.Title,
			SegueText:       toNullString(lesson.SegueText),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create generated lesson: %w", err)
	}

	lesson.ID = result.ID
	lesson.GeneratedAt = result.GeneratedAt
	return nil
}

// GetByID retrieves a lesson by its ID.
func (r *GeneratedLessonRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.GeneratedLesson, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GeneratedLesson, error) {
		return q.GetGeneratedLessonByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get lesson: %w", err)
	}
	return toGeneratedLessonEntity(&result), nil
}

// GetByOutlineLessonID retrieves by outline lesson reference.
func (r *GeneratedLessonRepository) GetByOutlineLessonID(ctx context.Context, outlineLessonID uuid.UUID) (*entity.GeneratedLesson, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.GeneratedLesson, error) {
		return q.GetGeneratedLessonByOutlineLessonID(ctx, outlineLessonID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get lesson: %w", err)
	}
	return toGeneratedLessonEntity(&result), nil
}

// ListByCourseID retrieves all lessons for a course.
func (r *GeneratedLessonRepository) ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.GeneratedLesson, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.GeneratedLesson, error) {
		return q.ListGeneratedLessonsByCourseID(ctx, courseID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list lessons: %w", err)
	}

	lessons := make([]*entity.GeneratedLesson, len(results))
	for i := range results {
		lessons[i] = toGeneratedLessonEntity(&results[i])
	}
	return lessons, nil
}

// Update updates a lesson.
func (r *GeneratedLessonRepository) Update(ctx context.Context, lesson *entity.GeneratedLesson) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateGeneratedLesson(ctx, gen.UpdateGeneratedLessonParams{
			Title:     lesson.Title,
			SegueText: toNullString(lesson.SegueText),
			ID:        lesson.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update lesson: %w", err)
	}
	return nil
}

func toGeneratedLessonEntity(l *gen.GeneratedLesson) *entity.GeneratedLesson {
	return &entity.GeneratedLesson{
		ID:              l.ID,
		TenantID:        l.TenantID,
		CourseID:        l.CourseID,
		SectionID:       l.SectionID,
		OutlineLessonID: l.OutlineLessonID,
		Title:           l.Title,
		SegueText:       fromNullStringPtr(l.SegueText),
		GeneratedAt:     l.GeneratedAt,
	}
}

// =============================================================================
// Lesson Component Repository
// =============================================================================

// LessonComponentRepository implements repository.LessonComponentRepository using sqlc-generated code.
type LessonComponentRepository struct {
	db *sql.DB
}

// NewLessonComponentRepository creates a new sqlc-based lesson component repository.
func NewLessonComponentRepository(db *sql.DB) repository.LessonComponentRepository {
	return &LessonComponentRepository{db: db}
}

// Create creates a new component.
func (r *LessonComponentRepository) Create(ctx context.Context, component *entity.LessonComponent) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.LessonComponent, error) {
		return q.CreateLessonComponent(ctx, gen.CreateLessonComponentParams{
			TenantID:             component.TenantID,
			LessonID:             component.LessonID,
			Type:                 toLessonComponentType(component.Type.String()),
			Position:             component.Position,
			ContentJson:          component.ContentJSON,
			SmeChunkIds:          component.SMEChunkIDs,
			LearningObjectiveIds: pq.StringArray(component.LearningObjectiveIDs),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create component: %w", err)
	}

	component.ID = result.ID
	component.CreatedAt = result.CreatedAt
	component.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a component by its ID.
func (r *LessonComponentRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.LessonComponent, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.LessonComponent, error) {
		return q.GetLessonComponentByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get component: %w", err)
	}
	return toLessonComponentEntity(&result), nil
}

// ListByLessonID retrieves all components for a lesson.
func (r *LessonComponentRepository) ListByLessonID(ctx context.Context, lessonID uuid.UUID) ([]*entity.LessonComponent, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.LessonComponent, error) {
		return q.ListLessonComponentsByLessonID(ctx, lessonID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list components: %w", err)
	}

	components := make([]*entity.LessonComponent, len(results))
	for i := range results {
		components[i] = toLessonComponentEntity(&results[i])
	}
	return components, nil
}

// Update updates a component.
func (r *LessonComponentRepository) Update(ctx context.Context, component *entity.LessonComponent) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.LessonComponent, error) {
		return q.UpdateLessonComponent(ctx, gen.UpdateLessonComponentParams{
			Type:                 toLessonComponentType(component.Type.String()),
			Position:             component.Position,
			ContentJson:          component.ContentJSON,
			SmeChunkIds:          component.SMEChunkIDs,
			LearningObjectiveIds: pq.StringArray(component.LearningObjectiveIDs),
			ID:                   component.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update component: %w", err)
	}

	component.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a component.
func (r *LessonComponentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteLessonComponent(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete component: %w", err)
	}
	return nil
}

func toLessonComponentEntity(c *gen.LessonComponent) *entity.LessonComponent {
	compType, _ := valueobject.ParseLessonComponentType(string(c.Type))
	return &entity.LessonComponent{
		ID:                   c.ID,
		TenantID:             c.TenantID,
		LessonID:             c.LessonID,
		Type:                 compType,
		Position:             c.Position,
		ContentJSON:          json.RawMessage(c.ContentJson),
		SMEChunkIDs:          c.SmeChunkIds,
		LearningObjectiveIDs: []string(c.LearningObjectiveIds),
		CreatedAt:            c.CreatedAt,
		UpdatedAt:            c.UpdatedAt,
	}
}

// =============================================================================
// Course Generation Input Repository
// =============================================================================

// CourseGenerationInputRepository implements repository.CourseGenerationInputRepository using sqlc-generated code.
type CourseGenerationInputRepository struct {
	db *sql.DB
}

// NewCourseGenerationInputRepository creates a new sqlc-based course generation input repository.
func NewCourseGenerationInputRepository(db *sql.DB) repository.CourseGenerationInputRepository {
	return &CourseGenerationInputRepository{db: db}
}

// Create creates or updates generation inputs for a course.
func (r *CourseGenerationInputRepository) Create(ctx context.Context, input *entity.CourseGenerationInput) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseGenerationInput, error) {
		return q.CreateCourseGenerationInput(ctx, gen.CreateCourseGenerationInputParams{
			TenantID:          input.TenantID,
			CourseID:          input.CourseID,
			SmeIds:            input.SMEIDs,
			TargetAudienceIds: input.TargetAudienceIDs,
			DesiredOutcome:    input.DesiredOutcome,
			AdditionalContext: toNullString(input.AdditionalContext),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create generation input: %w", err)
	}

	input.ID = result.ID
	input.CreatedAt = result.CreatedAt
	input.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByCourseID retrieves generation inputs for a course.
func (r *CourseGenerationInputRepository) GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseGenerationInput, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseGenerationInput, error) {
		return q.GetCourseGenerationInputByCourseID(ctx, courseID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get generation input: %w", err)
	}
	return toCourseGenerationInputEntity(&result), nil
}

// Update updates generation inputs.
func (r *CourseGenerationInputRepository) Update(ctx context.Context, input *entity.CourseGenerationInput) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseGenerationInput, error) {
		return q.UpdateCourseGenerationInput(ctx, gen.UpdateCourseGenerationInputParams{
			SmeIds:            input.SMEIDs,
			TargetAudienceIds: input.TargetAudienceIDs,
			DesiredOutcome:    input.DesiredOutcome,
			AdditionalContext: toNullString(input.AdditionalContext),
			ID:                input.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update generation input: %w", err)
	}

	input.UpdatedAt = result.UpdatedAt
	return nil
}

func toCourseGenerationInputEntity(i *gen.CourseGenerationInput) *entity.CourseGenerationInput {
	return &entity.CourseGenerationInput{
		ID:                i.ID,
		TenantID:          i.TenantID,
		CourseID:          i.CourseID,
		SMEIDs:            i.SmeIds,
		TargetAudienceIDs: i.TargetAudienceIds,
		DesiredOutcome:    i.DesiredOutcome,
		AdditionalContext: fromNullStringPtr(i.AdditionalContext),
		CreatedAt:         i.CreatedAt,
		UpdatedAt:         i.UpdatedAt,
	}
}

