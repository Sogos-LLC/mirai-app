package postgres

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// GeneratedLessonRepository implements repository.GeneratedLessonRepository using PostgreSQL.
type GeneratedLessonRepository struct {
	db *sql.DB
}

// NewGeneratedLessonRepository creates a new PostgreSQL generated lesson repository.
func NewGeneratedLessonRepository(db *sql.DB) repository.GeneratedLessonRepository {
	return &GeneratedLessonRepository{db: db}
}

// Create creates a new generated lesson.
func (r *GeneratedLessonRepository) Create(ctx context.Context, lesson *entity.GeneratedLesson) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO generated_lessons (tenant_id, course_id, section_id, outline_lesson_id, title, segue_text)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, generated_at
		`
		return tx.QueryRowContext(ctx, query,
			lesson.TenantID,
			lesson.CourseID,
			lesson.SectionID,
			lesson.OutlineLessonID,
			lesson.Title,
			lesson.SegueText,
		).Scan(&lesson.ID, &lesson.GeneratedAt)
	})
}

// GetByID retrieves a lesson by its ID.
func (r *GeneratedLessonRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.GeneratedLesson, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.GeneratedLesson, error) {
		query := `
			SELECT id, tenant_id, course_id, section_id, outline_lesson_id, title, segue_text, generated_at
			FROM generated_lessons
			WHERE id = $1
		`
		lesson := &entity.GeneratedLesson{}
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&lesson.ID,
			&lesson.TenantID,
			&lesson.CourseID,
			&lesson.SectionID,
			&lesson.OutlineLessonID,
			&lesson.Title,
			&lesson.SegueText,
			&lesson.GeneratedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get lesson: %w", err)
		}
		return lesson, nil
	})
}

// GetByOutlineLessonID retrieves by outline lesson reference.
func (r *GeneratedLessonRepository) GetByOutlineLessonID(ctx context.Context, outlineLessonID uuid.UUID) (*entity.GeneratedLesson, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.GeneratedLesson, error) {
		query := `
			SELECT id, tenant_id, course_id, section_id, outline_lesson_id, title, segue_text, generated_at
			FROM generated_lessons
			WHERE outline_lesson_id = $1
		`
		lesson := &entity.GeneratedLesson{}
		err := tx.QueryRowContext(ctx, query, outlineLessonID).Scan(
			&lesson.ID,
			&lesson.TenantID,
			&lesson.CourseID,
			&lesson.SectionID,
			&lesson.OutlineLessonID,
			&lesson.Title,
			&lesson.SegueText,
			&lesson.GeneratedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get lesson: %w", err)
		}
		return lesson, nil
	})
}

// ListByCourseID retrieves all lessons for a course.
func (r *GeneratedLessonRepository) ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.GeneratedLesson, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.GeneratedLesson, error) {
		query := `
			SELECT id, tenant_id, course_id, section_id, outline_lesson_id, title, segue_text, generated_at
			FROM generated_lessons
			WHERE course_id = $1
			ORDER BY generated_at ASC
		`
		rows, err := tx.QueryContext(ctx, query, courseID)
		if err != nil {
			return nil, fmt.Errorf("failed to list lessons: %w", err)
		}
		defer rows.Close()

		var lessons []*entity.GeneratedLesson
		for rows.Next() {
			lesson := &entity.GeneratedLesson{}
			if err := rows.Scan(
				&lesson.ID,
				&lesson.TenantID,
				&lesson.CourseID,
				&lesson.SectionID,
				&lesson.OutlineLessonID,
				&lesson.Title,
				&lesson.SegueText,
				&lesson.GeneratedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan lesson: %w", err)
			}
			lessons = append(lessons, lesson)
		}
		return lessons, nil
	})
}

// Update updates a lesson.
func (r *GeneratedLessonRepository) Update(ctx context.Context, lesson *entity.GeneratedLesson) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE generated_lessons
			SET title = $1, segue_text = $2
			WHERE id = $3
		`
		_, err := tx.ExecContext(ctx, query,
			lesson.Title,
			lesson.SegueText,
			lesson.ID,
		)
		return err
	})
}

// LessonComponentRepository implements repository.LessonComponentRepository using PostgreSQL.
type LessonComponentRepository struct {
	db *sql.DB
}

// NewLessonComponentRepository creates a new PostgreSQL lesson component repository.
func NewLessonComponentRepository(db *sql.DB) repository.LessonComponentRepository {
	return &LessonComponentRepository{db: db}
}

// Create creates a new component.
func (r *LessonComponentRepository) Create(ctx context.Context, component *entity.LessonComponent) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO lesson_components (tenant_id, lesson_id, type, position, content_json, sme_chunk_ids, learning_objective_ids)
			VALUES ($1, $2, $3, $4, $5, $6, $7)
			RETURNING id, created_at, updated_at
		`
		return tx.QueryRowContext(ctx, query,
			component.TenantID,
			component.LessonID,
			component.Type.String(),
			component.Position,
			component.ContentJSON,
			pq.Array(component.SMEChunkIDs),
			pq.Array(component.LearningObjectiveIDs),
		).Scan(&component.ID, &component.CreatedAt, &component.UpdatedAt)
	})
}

// GetByID retrieves a component by its ID.
func (r *LessonComponentRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.LessonComponent, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.LessonComponent, error) {
		query := `
			SELECT id, tenant_id, lesson_id, type, position, content_json, sme_chunk_ids, learning_objective_ids, created_at, updated_at
			FROM lesson_components
			WHERE id = $1
		`
		component := &entity.LessonComponent{}
		var typeStr string
		var contentJSON []byte
		var chunkIDs pq.StringArray
		var objectiveIDs pq.StringArray
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&component.ID,
			&component.TenantID,
			&component.LessonID,
			&typeStr,
			&component.Position,
			&contentJSON,
			&chunkIDs,
			&objectiveIDs,
			&component.CreatedAt,
			&component.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get component: %w", err)
		}
		component.Type, _ = valueobject.ParseLessonComponentType(typeStr)
		component.ContentJSON = json.RawMessage(contentJSON)
		component.SMEChunkIDs = parseUUIDs(chunkIDs)
		component.LearningObjectiveIDs = []string(objectiveIDs)
		return component, nil
	})
}

// ListByLessonID retrieves all components for a lesson.
func (r *LessonComponentRepository) ListByLessonID(ctx context.Context, lessonID uuid.UUID) ([]*entity.LessonComponent, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.LessonComponent, error) {
		query := `
			SELECT id, tenant_id, lesson_id, type, position, content_json, sme_chunk_ids, learning_objective_ids, created_at, updated_at
			FROM lesson_components
			WHERE lesson_id = $1
			ORDER BY position ASC
		`
		rows, err := tx.QueryContext(ctx, query, lessonID)
		if err != nil {
			return nil, fmt.Errorf("failed to list components: %w", err)
		}
		defer rows.Close()

		var components []*entity.LessonComponent
		for rows.Next() {
			component := &entity.LessonComponent{}
			var typeStr string
			var contentJSON []byte
			var chunkIDs pq.StringArray
			var objectiveIDs pq.StringArray
			if err := rows.Scan(
				&component.ID,
				&component.TenantID,
				&component.LessonID,
				&typeStr,
				&component.Position,
				&contentJSON,
				&chunkIDs,
				&objectiveIDs,
				&component.CreatedAt,
				&component.UpdatedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan component: %w", err)
			}
			component.Type, _ = valueobject.ParseLessonComponentType(typeStr)
			component.ContentJSON = json.RawMessage(contentJSON)
			component.SMEChunkIDs = parseUUIDs(chunkIDs)
			component.LearningObjectiveIDs = []string(objectiveIDs)
			components = append(components, component)
		}
		return components, nil
	})
}

// Update updates a component.
func (r *LessonComponentRepository) Update(ctx context.Context, component *entity.LessonComponent) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE lesson_components
			SET type = $1, position = $2, content_json = $3, sme_chunk_ids = $4, learning_objective_ids = $5, updated_at = NOW()
			WHERE id = $6
			RETURNING updated_at
		`
		return tx.QueryRowContext(ctx, query,
			component.Type.String(),
			component.Position,
			component.ContentJSON,
			pq.Array(component.SMEChunkIDs),
			pq.Array(component.LearningObjectiveIDs),
			component.ID,
		).Scan(&component.UpdatedAt)
	})
}

// Delete deletes a component.
func (r *LessonComponentRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `DELETE FROM lesson_components WHERE id = $1`
		_, err := tx.ExecContext(ctx, query, id)
		return err
	})
}

// CourseGenerationInputRepository implements repository.CourseGenerationInputRepository using PostgreSQL.
type CourseGenerationInputRepository struct {
	db *sql.DB
}

// NewCourseGenerationInputRepository creates a new PostgreSQL course generation input repository.
func NewCourseGenerationInputRepository(db *sql.DB) repository.CourseGenerationInputRepository {
	return &CourseGenerationInputRepository{db: db}
}

// Create creates or updates generation inputs for a course.
func (r *CourseGenerationInputRepository) Create(ctx context.Context, input *entity.CourseGenerationInput) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO course_generation_inputs (tenant_id, course_id, sme_ids, target_audience_ids, desired_outcome, additional_context)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id, created_at, updated_at
		`
		return tx.QueryRowContext(ctx, query,
			input.TenantID,
			input.CourseID,
			pq.Array(input.SMEIDs),
			pq.Array(input.TargetAudienceIDs),
			input.DesiredOutcome,
			input.AdditionalContext,
		).Scan(&input.ID, &input.CreatedAt, &input.UpdatedAt)
	})
}

// GetByCourseID retrieves generation inputs for a course.
func (r *CourseGenerationInputRepository) GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseGenerationInput, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.CourseGenerationInput, error) {
		query := `
			SELECT id, tenant_id, course_id, sme_ids, target_audience_ids, desired_outcome, additional_context, created_at, updated_at
			FROM course_generation_inputs
			WHERE course_id = $1
		`
		input := &entity.CourseGenerationInput{}
		var smeIDs pq.StringArray
		var audienceIDs pq.StringArray
		err := tx.QueryRowContext(ctx, query, courseID).Scan(
			&input.ID,
			&input.TenantID,
			&input.CourseID,
			&smeIDs,
			&audienceIDs,
			&input.DesiredOutcome,
			&input.AdditionalContext,
			&input.CreatedAt,
			&input.UpdatedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get generation input: %w", err)
		}
		input.SMEIDs = parseUUIDs(smeIDs)
		input.TargetAudienceIDs = parseUUIDs(audienceIDs)
		return input, nil
	})
}

// Update updates generation inputs.
func (r *CourseGenerationInputRepository) Update(ctx context.Context, input *entity.CourseGenerationInput) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE course_generation_inputs
			SET sme_ids = $1, target_audience_ids = $2, desired_outcome = $3, additional_context = $4, updated_at = NOW()
			WHERE id = $5
			RETURNING updated_at
		`
		return tx.QueryRowContext(ctx, query,
			pq.Array(input.SMEIDs),
			pq.Array(input.TargetAudienceIDs),
			input.DesiredOutcome,
			input.AdditionalContext,
			input.ID,
		).Scan(&input.UpdatedAt)
	})
}

// parseUUIDs converts a pq.StringArray to []uuid.UUID
func parseUUIDs(strs pq.StringArray) []uuid.UUID {
	uuids := make([]uuid.UUID, 0, len(strs))
	for _, s := range strs {
		if id, err := uuid.Parse(s); err == nil {
			uuids = append(uuids, id)
		}
	}
	return uuids
}
