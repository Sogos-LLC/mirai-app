package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// CourseOutlineRepository implements repository.CourseOutlineRepository using sqlc-generated code.
type CourseOutlineRepository struct {
	db *sql.DB
}

// NewCourseOutlineRepository creates a new sqlc-based course outline repository.
func NewCourseOutlineRepository(db *sql.DB) repository.CourseOutlineRepository {
	return &CourseOutlineRepository{db: db}
}

// Create creates a new outline.
func (r *CourseOutlineRepository) Create(ctx context.Context, outline *entity.CourseOutline) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseOutline, error) {
		return q.CreateCourseOutline(ctx, gen.CreateCourseOutlineParams{
			TenantID:        outline.TenantID,
			CourseID:        outline.CourseID,
			Version:         outline.Version,
			ApprovalStatus:  toOutlineApprovalStatus(outline.ApprovalStatus.String()),
			RejectionReason: toNullString(outline.RejectionReason),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create outline: %w", err)
	}

	outline.ID = result.ID
	outline.GeneratedAt = result.GeneratedAt
	return nil
}

// GetByID retrieves an outline by its ID.
func (r *CourseOutlineRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.CourseOutline, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseOutline, error) {
		return q.GetCourseOutlineByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get outline: %w", err)
	}
	return toCourseOutlineEntity(&result), nil
}

// GetByCourseID retrieves the latest outline for a course.
func (r *CourseOutlineRepository) GetByCourseID(ctx context.Context, courseID uuid.UUID) (*entity.CourseOutline, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseOutline, error) {
		return q.GetLatestCourseOutlineByCourseID(ctx, courseID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get outline: %w", err)
	}
	return toCourseOutlineEntity(&result), nil
}

// GetByCourseIDAndVersion retrieves a specific version.
func (r *CourseOutlineRepository) GetByCourseIDAndVersion(ctx context.Context, courseID uuid.UUID, version int32) (*entity.CourseOutline, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseOutline, error) {
		return q.GetCourseOutlineByCourseIDAndVersion(ctx, gen.GetCourseOutlineByCourseIDAndVersionParams{
			CourseID: courseID,
			Version:  version,
		})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get outline: %w", err)
	}
	return toCourseOutlineEntity(&result), nil
}

// Update updates an outline.
func (r *CourseOutlineRepository) Update(ctx context.Context, outline *entity.CourseOutline) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateCourseOutline(ctx, gen.UpdateCourseOutlineParams{
			ApprovalStatus:   toOutlineApprovalStatus(outline.ApprovalStatus.String()),
			RejectionReason:  toNullString(outline.RejectionReason),
			ApprovedAt:       toDoublePointerTime(outline.ApprovedAt),
			ApprovedByUserID: toNullUUID(outline.ApprovedByUserID),
			ID:               outline.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update outline: %w", err)
	}
	return nil
}

// GetNextVersion returns the next version number for a course.
func (r *CourseOutlineRepository) GetNextVersion(ctx context.Context, courseID uuid.UUID) (int32, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.GetNextOutlineVersion(ctx, courseID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to get next version: %w", err)
	}
	return result, nil
}

// CreateCompleteOutline atomically creates an outline with all its sections and lessons.
func (r *CourseOutlineRepository) CreateCompleteOutline(ctx context.Context, outline *entity.CourseOutline, sections []entity.OutlineSection, lessons []entity.OutlineLesson) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		// 1. Insert outline
		err := q.CreateCourseOutlineWithID(ctx, gen.CreateCourseOutlineWithIDParams{
			ID:              outline.ID,
			TenantID:        outline.TenantID,
			CourseID:        outline.CourseID,
			Version:         outline.Version,
			ApprovalStatus:  toOutlineApprovalStatus(outline.ApprovalStatus.String()),
			RejectionReason: toNullString(outline.RejectionReason),
		})
		if err != nil {
			return fmt.Errorf("failed to insert outline: %w", err)
		}

		// 2. Insert all sections
		for _, section := range sections {
			err := q.CreateOutlineSectionWithID(ctx, gen.CreateOutlineSectionWithIDParams{
				ID:          section.ID,
				TenantID:    section.TenantID,
				OutlineID:   section.OutlineID,
				Title:       section.Title,
				Description: stringToNullString(section.Description),
				Position:    section.Position,
			})
			if err != nil {
				return fmt.Errorf("failed to insert section %s: %w", section.Title, err)
			}
		}

		// 3. Insert all lessons
		for _, lesson := range lessons {
			err := q.CreateOutlineLessonWithID(ctx, gen.CreateOutlineLessonWithIDParams{
				ID:                       lesson.ID,
				TenantID:                 lesson.TenantID,
				SectionID:               lesson.SectionID,
				Title:                    lesson.Title,
				Description:             stringToNullString(lesson.Description),
				Position:                 lesson.Position,
				EstimatedDurationMinutes: toNullInt32FromPtr(lesson.EstimatedDurationMinutes),
				LearningObjectives:       pq.StringArray(lesson.LearningObjectives),
				IsLastInSection:          lesson.IsLastInSection,
				IsLastInCourse:           lesson.IsLastInCourse,
			})
			if err != nil {
				return fmt.Errorf("failed to insert lesson %s: %w", lesson.Title, err)
			}
		}

		return nil
	})
	if err != nil {
		return err
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toCourseOutlineEntity(o *gen.CourseOutline) *entity.CourseOutline {
	status, _ := valueobject.ParseOutlineApprovalStatus(string(o.ApprovalStatus))
	return &entity.CourseOutline{
		ID:               o.ID,
		TenantID:         o.TenantID,
		CourseID:         o.CourseID,
		Version:          o.Version,
		ApprovalStatus:   status,
		RejectionReason:  fromNullStringPtr(o.RejectionReason),
		GeneratedAt:      o.GeneratedAt,
		ApprovedAt:       fromDoublePointerTime(o.ApprovedAt),
		ApprovedByUserID: fromNullUUIDPtr(o.ApprovedByUserID),
	}
}

// =============================================================================
// Outline Section Repository
// =============================================================================

// OutlineSectionRepository implements repository.OutlineSectionRepository using sqlc-generated code.
type OutlineSectionRepository struct {
	db *sql.DB
}

// NewOutlineSectionRepository creates a new sqlc-based outline section repository.
func NewOutlineSectionRepository(db *sql.DB) repository.OutlineSectionRepository {
	return &OutlineSectionRepository{db: db}
}

// Create creates a new section.
func (r *OutlineSectionRepository) Create(ctx context.Context, section *entity.OutlineSection) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.OutlineSection, error) {
		return q.CreateOutlineSection(ctx, gen.CreateOutlineSectionParams{
			TenantID:    section.TenantID,
			OutlineID:   section.OutlineID,
			Title:       section.Title,
			Description: stringToNullString(section.Description),
			Position:    section.Position,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create section: %w", err)
	}

	section.ID = result.ID
	section.CreatedAt = result.CreatedAt
	return nil
}

// GetByID retrieves a section by its ID.
func (r *OutlineSectionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineSection, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.OutlineSection, error) {
		return q.GetOutlineSectionByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get section: %w", err)
	}
	return toOutlineSectionEntity(&result), nil
}

// ListByOutlineID retrieves all sections for an outline.
func (r *OutlineSectionRepository) ListByOutlineID(ctx context.Context, outlineID uuid.UUID) ([]*entity.OutlineSection, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.OutlineSection, error) {
		return q.ListOutlineSectionsByOutlineID(ctx, outlineID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list sections: %w", err)
	}

	sections := make([]*entity.OutlineSection, len(results))
	for i := range results {
		sections[i] = toOutlineSectionEntity(&results[i])
	}
	return sections, nil
}

// Update updates a section.
func (r *OutlineSectionRepository) Update(ctx context.Context, section *entity.OutlineSection) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateOutlineSection(ctx, gen.UpdateOutlineSectionParams{
			Title:       section.Title,
			Description: stringToNullString(section.Description),
			Position:    section.Position,
			ID:          section.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update section: %w", err)
	}
	return nil
}

// Delete deletes a section.
func (r *OutlineSectionRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteOutlineSection(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete section: %w", err)
	}
	return nil
}

func toOutlineSectionEntity(s *gen.OutlineSection) *entity.OutlineSection {
	return &entity.OutlineSection{
		ID:          s.ID,
		TenantID:    s.TenantID,
		OutlineID:   s.OutlineID,
		Title:       s.Title,
		Description: fromNullString(s.Description),
		Position:    s.Position,
		CreatedAt:   s.CreatedAt,
	}
}

// =============================================================================
// Outline Lesson Repository
// =============================================================================

// OutlineLessonRepository implements repository.OutlineLessonRepository using sqlc-generated code.
type OutlineLessonRepository struct {
	db *sql.DB
}

// NewOutlineLessonRepository creates a new sqlc-based outline lesson repository.
func NewOutlineLessonRepository(db *sql.DB) repository.OutlineLessonRepository {
	return &OutlineLessonRepository{db: db}
}

// Create creates a new lesson.
func (r *OutlineLessonRepository) Create(ctx context.Context, lesson *entity.OutlineLesson) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.OutlineLesson, error) {
		return q.CreateOutlineLesson(ctx, gen.CreateOutlineLessonParams{
			TenantID:                 lesson.TenantID,
			SectionID:               lesson.SectionID,
			Title:                    lesson.Title,
			Description:             stringToNullString(lesson.Description),
			Position:                 lesson.Position,
			EstimatedDurationMinutes: toNullInt32FromPtr(lesson.EstimatedDurationMinutes),
			LearningObjectives:       pq.StringArray(lesson.LearningObjectives),
			IsLastInSection:          lesson.IsLastInSection,
			IsLastInCourse:           lesson.IsLastInCourse,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create lesson: %w", err)
	}

	lesson.ID = result.ID
	lesson.CreatedAt = result.CreatedAt
	return nil
}

// GetByID retrieves a lesson by its ID.
func (r *OutlineLessonRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.OutlineLesson, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.OutlineLesson, error) {
		return q.GetOutlineLessonByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get lesson: %w", err)
	}
	return toOutlineLessonEntity(&result), nil
}

// ListBySectionID retrieves all lessons for a section.
func (r *OutlineLessonRepository) ListBySectionID(ctx context.Context, sectionID uuid.UUID) ([]*entity.OutlineLesson, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.OutlineLesson, error) {
		return q.ListOutlineLessonsBySectionID(ctx, sectionID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list lessons: %w", err)
	}

	lessons := make([]*entity.OutlineLesson, len(results))
	for i := range results {
		lessons[i] = toOutlineLessonEntity(&results[i])
	}
	return lessons, nil
}

// Update updates a lesson.
func (r *OutlineLessonRepository) Update(ctx context.Context, lesson *entity.OutlineLesson) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateOutlineLesson(ctx, gen.UpdateOutlineLessonParams{
			Title:                    lesson.Title,
			Description:             stringToNullString(lesson.Description),
			Position:                 lesson.Position,
			EstimatedDurationMinutes: toNullInt32FromPtr(lesson.EstimatedDurationMinutes),
			LearningObjectives:       pq.StringArray(lesson.LearningObjectives),
			IsLastInSection:          lesson.IsLastInSection,
			IsLastInCourse:           lesson.IsLastInCourse,
			ID:                       lesson.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update lesson: %w", err)
	}
	return nil
}

// Delete deletes a lesson.
func (r *OutlineLessonRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteOutlineLesson(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete lesson: %w", err)
	}
	return nil
}

func toOutlineLessonEntity(l *gen.OutlineLesson) *entity.OutlineLesson {
	return &entity.OutlineLesson{
		ID:                       l.ID,
		TenantID:                 l.TenantID,
		SectionID:               l.SectionID,
		Title:                    l.Title,
		Description:             fromNullString(l.Description),
		Position:                 l.Position,
		EstimatedDurationMinutes: fromNullInt32Ptr(l.EstimatedDurationMinutes),
		LearningObjectives:       []string(l.LearningObjectives),
		IsLastInSection:          l.IsLastInSection,
		IsLastInCourse:           l.IsLastInCourse,
		CreatedAt:                l.CreatedAt,
	}
}
