package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CourseOutlineRepository implements repository.CourseOutlineRepository using PostgreSQL.
type CourseOutlineRepository struct {
	db *sql.DB
}

// NewCourseOutlineRepository creates a new PostgreSQL course outline repository.
func NewCourseOutlineRepository(db *sql.DB) repository.CourseOutlineRepository {
	return &CourseOutlineRepository{db: db}
}

// Create creates a new outline.
func (r *CourseOutlineRepository) Create(ctx context.Context, outline *entity.CourseOutline) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO course_outlines (tenant_id, course_id, version, approval_status, rejection_reason)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, generated_at
		`
		return tx.QueryRowContext(ctx, query,
			outline.TenantID,
			outline.CourseID,
			outline.Version,
			outline.ApprovalStatus.String(),
			outline.RejectionReason,
		).Scan(&outline.ID, &outline.GeneratedAt)
	})
}

// GetByID retrieves an outline by its ID.
func (r *CourseOutlineRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseOutline, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.CourseOutline, error) {
		query := `
			SELECT id, tenant_id, course_id, version, approval_status, rejection_reason, generated_at, approved_at, approved_by_user_id
			FROM course_outlines
			WHERE id = $1
		`
		outline := &entity.CourseOutline{}
		var statusStr string
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&outline.ID,
			&outline.TenantID,
			&outline.CourseID,
			&outline.Version,
			&statusStr,
			&outline.RejectionReason,
			&outline.GeneratedAt,
			&outline.ApprovedAt,
			&outline.ApprovedByUserID,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get outline: %w", err)
		}
		outline.ApprovalStatus, _ = valueobject.ParseOutlineApprovalStatus(statusStr)
		return outline, nil
	})
}

// GetByCourseID retrieves the latest outline for a course.
func (r *CourseOutlineRepository) GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseOutline, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.CourseOutline, error) {
		query := `
			SELECT id, tenant_id, course_id, version, approval_status, rejection_reason, generated_at, approved_at, approved_by_user_id
			FROM course_outlines
			WHERE course_id = $1
			ORDER BY version DESC
			LIMIT 1
		`
		outline := &entity.CourseOutline{}
		var statusStr string
		err := tx.QueryRowContext(ctx, query, courseID).Scan(
			&outline.ID,
			&outline.TenantID,
			&outline.CourseID,
			&outline.Version,
			&statusStr,
			&outline.RejectionReason,
			&outline.GeneratedAt,
			&outline.ApprovedAt,
			&outline.ApprovedByUserID,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get outline: %w", err)
		}
		outline.ApprovalStatus, _ = valueobject.ParseOutlineApprovalStatus(statusStr)
		return outline, nil
	})
}

// GetByCourseIDAndVersion retrieves a specific version.
func (r *CourseOutlineRepository) GetByCourseIDAndVersion(ctx context.Context, courseID uuid.UUID, version int32) (*entity.CourseOutline, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.CourseOutline, error) {
		query := `
			SELECT id, tenant_id, course_id, version, approval_status, rejection_reason, generated_at, approved_at, approved_by_user_id
			FROM course_outlines
			WHERE course_id = $1 AND version = $2
		`
		outline := &entity.CourseOutline{}
		var statusStr string
		err := tx.QueryRowContext(ctx, query, courseID, version).Scan(
			&outline.ID,
			&outline.TenantID,
			&outline.CourseID,
			&outline.Version,
			&statusStr,
			&outline.RejectionReason,
			&outline.GeneratedAt,
			&outline.ApprovedAt,
			&outline.ApprovedByUserID,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get outline: %w", err)
		}
		outline.ApprovalStatus, _ = valueobject.ParseOutlineApprovalStatus(statusStr)
		return outline, nil
	})
}

// Update updates an outline.
func (r *CourseOutlineRepository) Update(ctx context.Context, outline *entity.CourseOutline) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE course_outlines
			SET approval_status = $1, rejection_reason = $2, approved_at = $3, approved_by_user_id = $4
			WHERE id = $5
		`
		_, err := tx.ExecContext(ctx, query,
			outline.ApprovalStatus.String(),
			outline.RejectionReason,
			outline.ApprovedAt,
			outline.ApprovedByUserID,
			outline.ID,
		)
		return err
	})
}

// GetNextVersion returns the next version number for a course (max existing + 1, or 1 if none).
func (r *CourseOutlineRepository) GetNextVersion(ctx context.Context, courseID uuid.UUID) (int32, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (int32, error) {
		query := `
			SELECT COALESCE(MAX(version), 0) + 1
			FROM course_outlines
			WHERE course_id = $1
		`
		var nextVersion int32
		err := tx.QueryRowContext(ctx, query, courseID).Scan(&nextVersion)
		if err != nil {
			return 0, fmt.Errorf("failed to get next version: %w", err)
		}
		return nextVersion, nil
	})
}

// CreateCompleteOutline atomically creates an outline with all its sections and lessons.
// If any part fails, the entire operation is rolled back.
func (r *CourseOutlineRepository) CreateCompleteOutline(ctx context.Context, outline *entity.CourseOutline, sections []entity.OutlineSection, lessons []entity.OutlineLesson) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		// 1. Insert outline
		outlineQuery := `
			INSERT INTO course_outlines (id, tenant_id, course_id, version, approval_status, rejection_reason, generated_at)
			VALUES ($1, $2, $3, $4, $5, $6, NOW())
		`
		_, err := tx.ExecContext(ctx, outlineQuery,
			outline.ID,
			outline.TenantID,
			outline.CourseID,
			outline.Version,
			outline.ApprovalStatus.String(),
			outline.RejectionReason,
		)
		if err != nil {
			return fmt.Errorf("failed to insert outline: %w", err)
		}

		// 2. Insert all sections
		sectionQuery := `
			INSERT INTO outline_sections (id, tenant_id, outline_id, title, description, position, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, NOW())
		`
		for _, section := range sections {
			_, err := tx.ExecContext(ctx, sectionQuery,
				section.ID,
				section.TenantID,
				section.OutlineID,
				section.Title,
				section.Description,
				section.Position,
			)
			if err != nil {
				return fmt.Errorf("failed to insert section %s: %w", section.Title, err)
			}
		}

		// 3. Insert all lessons
		lessonQuery := `
			INSERT INTO outline_lessons (id, tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course, created_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
		`
		for _, lesson := range lessons {
			_, err := tx.ExecContext(ctx, lessonQuery,
				lesson.ID,
				lesson.TenantID,
				lesson.SectionID,
				lesson.Title,
				lesson.Description,
				lesson.Position,
				lesson.EstimatedDurationMinutes,
				pq.Array(lesson.LearningObjectives),
				lesson.IsLastInSection,
				lesson.IsLastInCourse,
			)
			if err != nil {
				return fmt.Errorf("failed to insert lesson %s: %w", lesson.Title, err)
			}
		}

		return nil
	})
}

// OutlineSectionRepository implements repository.OutlineSectionRepository using PostgreSQL.
type OutlineSectionRepository struct {
	db *sql.DB
}

// NewOutlineSectionRepository creates a new PostgreSQL outline section repository.
func NewOutlineSectionRepository(db *sql.DB) repository.OutlineSectionRepository {
	return &OutlineSectionRepository{db: db}
}

// Create creates a new section.
func (r *OutlineSectionRepository) Create(ctx context.Context, section *entity.OutlineSection) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO outline_sections (tenant_id, outline_id, title, description, position)
			VALUES ($1, $2, $3, $4, $5)
			RETURNING id, created_at
		`
		return tx.QueryRowContext(ctx, query,
			section.TenantID,
			section.OutlineID,
			section.Title,
			section.Description,
			section.Position,
		).Scan(&section.ID, &section.CreatedAt)
	})
}

// GetByID retrieves a section by its ID.
func (r *OutlineSectionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineSection, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.OutlineSection, error) {
		query := `
			SELECT id, tenant_id, outline_id, title, description, position, created_at
			FROM outline_sections
			WHERE id = $1
		`
		section := &entity.OutlineSection{}
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&section.ID,
			&section.TenantID,
			&section.OutlineID,
			&section.Title,
			&section.Description,
			&section.Position,
			&section.CreatedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get section: %w", err)
		}
		return section, nil
	})
}

// ListByOutlineID retrieves all sections for an outline.
func (r *OutlineSectionRepository) ListByOutlineID(ctx context.Context, outlineID uuid.UUID) ([]*entity.OutlineSection, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.OutlineSection, error) {
		query := `
			SELECT id, tenant_id, outline_id, title, description, position, created_at
			FROM outline_sections
			WHERE outline_id = $1
			ORDER BY position ASC
		`
		rows, err := tx.QueryContext(ctx, query, outlineID)
		if err != nil {
			return nil, fmt.Errorf("failed to list sections: %w", err)
		}
		defer rows.Close()

		var sections []*entity.OutlineSection
		for rows.Next() {
			section := &entity.OutlineSection{}
			if err := rows.Scan(
				&section.ID,
				&section.TenantID,
				&section.OutlineID,
				&section.Title,
				&section.Description,
				&section.Position,
				&section.CreatedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan section: %w", err)
			}
			sections = append(sections, section)
		}
		return sections, nil
	})
}

// Update updates a section.
func (r *OutlineSectionRepository) Update(ctx context.Context, section *entity.OutlineSection) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE outline_sections
			SET title = $1, description = $2, position = $3
			WHERE id = $4
		`
		_, err := tx.ExecContext(ctx, query,
			section.Title,
			section.Description,
			section.Position,
			section.ID,
		)
		return err
	})
}

// Delete deletes a section.
func (r *OutlineSectionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `DELETE FROM outline_sections WHERE id = $1`
		_, err := tx.ExecContext(ctx, query, id)
		return err
	})
}

// OutlineLessonRepository implements repository.OutlineLessonRepository using PostgreSQL.
type OutlineLessonRepository struct {
	db *sql.DB
}

// NewOutlineLessonRepository creates a new PostgreSQL outline lesson repository.
func NewOutlineLessonRepository(db *sql.DB) repository.OutlineLessonRepository {
	return &OutlineLessonRepository{db: db}
}

// Create creates a new lesson.
func (r *OutlineLessonRepository) Create(ctx context.Context, lesson *entity.OutlineLesson) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			INSERT INTO outline_lessons (tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id, created_at
		`
		return tx.QueryRowContext(ctx, query,
			lesson.TenantID,
			lesson.SectionID,
			lesson.Title,
			lesson.Description,
			lesson.Position,
			lesson.EstimatedDurationMinutes,
			pq.Array(lesson.LearningObjectives),
			lesson.IsLastInSection,
			lesson.IsLastInCourse,
		).Scan(&lesson.ID, &lesson.CreatedAt)
	})
}

// GetByID retrieves a lesson by its ID.
func (r *OutlineLessonRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineLesson, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) (*entity.OutlineLesson, error) {
		query := `
			SELECT id, tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course, created_at
			FROM outline_lessons
			WHERE id = $1
		`
		lesson := &entity.OutlineLesson{}
		var objectives pq.StringArray
		err := tx.QueryRowContext(ctx, query, id).Scan(
			&lesson.ID,
			&lesson.TenantID,
			&lesson.SectionID,
			&lesson.Title,
			&lesson.Description,
			&lesson.Position,
			&lesson.EstimatedDurationMinutes,
			&objectives,
			&lesson.IsLastInSection,
			&lesson.IsLastInCourse,
			&lesson.CreatedAt,
		)
		if err == sql.ErrNoRows {
			return nil, nil
		}
		if err != nil {
			return nil, fmt.Errorf("failed to get lesson: %w", err)
		}
		lesson.LearningObjectives = []string(objectives)
		return lesson, nil
	})
}

// ListBySectionID retrieves all lessons for a section.
func (r *OutlineLessonRepository) ListBySectionID(ctx context.Context, sectionID uuid.UUID) ([]*entity.OutlineLesson, error) {
	return RLSQuery(ctx, r.db, func(tx *sql.Tx) ([]*entity.OutlineLesson, error) {
		query := `
			SELECT id, tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course, created_at
			FROM outline_lessons
			WHERE section_id = $1
			ORDER BY position ASC
		`
		rows, err := tx.QueryContext(ctx, query, sectionID)
		if err != nil {
			return nil, fmt.Errorf("failed to list lessons: %w", err)
		}
		defer rows.Close()

		var lessons []*entity.OutlineLesson
		for rows.Next() {
			lesson := &entity.OutlineLesson{}
			var objectives pq.StringArray
			if err := rows.Scan(
				&lesson.ID,
				&lesson.TenantID,
				&lesson.SectionID,
				&lesson.Title,
				&lesson.Description,
				&lesson.Position,
				&lesson.EstimatedDurationMinutes,
				&objectives,
				&lesson.IsLastInSection,
				&lesson.IsLastInCourse,
				&lesson.CreatedAt,
			); err != nil {
				return nil, fmt.Errorf("failed to scan lesson: %w", err)
			}
			lesson.LearningObjectives = []string(objectives)
			lessons = append(lessons, lesson)
		}
		return lessons, nil
	})
}

// Update updates a lesson.
func (r *OutlineLessonRepository) Update(ctx context.Context, lesson *entity.OutlineLesson) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `
			UPDATE outline_lessons
			SET title = $1, description = $2, position = $3, estimated_duration_minutes = $4, learning_objectives = $5, is_last_in_section = $6, is_last_in_course = $7
			WHERE id = $8
		`
		_, err := tx.ExecContext(ctx, query,
			lesson.Title,
			lesson.Description,
			lesson.Position,
			lesson.EstimatedDurationMinutes,
			pq.Array(lesson.LearningObjectives),
			lesson.IsLastInSection,
			lesson.IsLastInCourse,
			lesson.ID,
		)
		return err
	})
}

// Delete deletes a lesson.
func (r *OutlineLessonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	return RLSExec(ctx, r.db, func(tx *sql.Tx) error {
		query := `DELETE FROM outline_lessons WHERE id = $1`
		_, err := tx.ExecContext(ctx, query, id)
		return err
	})
}
