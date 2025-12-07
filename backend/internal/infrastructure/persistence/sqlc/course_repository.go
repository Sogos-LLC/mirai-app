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

// CourseRepository implements repository.CourseRepository using sqlc-generated code.
type CourseRepository struct {
	db *sql.DB
}

// NewCourseRepository creates a new sqlc-based course repository.
func NewCourseRepository(db *sql.DB) repository.CourseRepository {
	return &CourseRepository{db: db}
}

// Create creates a new course.
func (r *CourseRepository) Create(ctx context.Context, course *entity.Course) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Course, error) {
		return q.CreateCourse(ctx, gen.CreateCourseParams{
			TenantID:        course.TenantID,
			CompanyID:       course.CompanyID,
			CreatedByUserID: toNullUUID(&course.CreatedByUserID),
			TeamID:          toNullUUID(course.TeamID),
			Title:           course.Title,
			Description:     sql.NullString{}, // Not in entity, keep null
			Status:          course.Status.String(),
			Version:         course.Version,
			FolderID:        toNullUUID(course.FolderID),
			CategoryTags:    course.CategoryTags,
			ThumbnailPath:   toNullString(course.ThumbnailPath),
			ContentPath:     course.ContentPath,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create course: %w", err)
	}

	// Update entity with generated values
	course.ID = result.ID
	course.CreatedAt = result.CreatedAt
	course.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a course by its ID.
func (r *CourseRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Course, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Course, error) {
		return q.GetCourseByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get course: %w", err)
	}
	return toCourseEntity(&result), nil
}

// Update updates a course.
func (r *CourseRepository) Update(ctx context.Context, course *entity.Course) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Course, error) {
		return q.UpdateCourse(ctx, gen.UpdateCourseParams{
			ID:            course.ID,
			Title:         course.Title,
			Description:   sql.NullString{}, // Not in entity
			Status:        course.Status.String(),
			Version:       course.Version,
			FolderID:      toNullUUID(course.FolderID),
			CategoryTags:  course.CategoryTags,
			ThumbnailPath: toNullString(course.ThumbnailPath),
			TeamID:        toNullUUID(course.TeamID),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update course: %w", err)
	}

	// Update entity with new timestamp
	course.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a course.
func (r *CourseRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteCourse(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete course: %w", err)
	}
	return nil
}

// List retrieves courses with optional filtering.
func (r *CourseRepository) List(ctx context.Context, opts entity.CourseListOptions) ([]*entity.Course, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Course, error) {
		return q.ListCourses(ctx, gen.ListCoursesParams{
			Status:   statusToNullString(opts.Status),
			FolderID: toNullUUID(opts.FolderID),
			Tags:     tagsOrNil(opts.Tags),
			Limit:    toNullInt32(opts.Limit),
			Offset:   toNullInt32(opts.Offset),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list courses: %w", err)
	}

	courses := make([]*entity.Course, len(results))
	for i := range results {
		courses[i] = toCourseEntity(&results[i])
	}
	return courses, nil
}

// Count returns the total count of courses matching the filter options.
func (r *CourseRepository) Count(ctx context.Context, opts entity.CourseListOptions) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountCourses(ctx, gen.CountCoursesParams{
			Status:   statusToNullString(opts.Status),
			FolderID: toNullUUID(opts.FolderID),
			Tags:     tagsOrNil(opts.Tags),
		})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count courses: %w", err)
	}
	return int(count), nil
}

// CountByFolder counts courses in a folder.
func (r *CourseRepository) CountByFolder(ctx context.Context, folderID uuid.UUID) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountCoursesByFolderID(ctx, uuid.NullUUID{UUID: folderID, Valid: true})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to count courses by folder: %w", err)
	}
	return int(count), nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

// toCourseEntity converts a sqlc-generated Course to a domain entity.
func toCourseEntity(c *gen.Course) *entity.Course {
	return &entity.Course{
		ID:              c.ID,
		TenantID:        c.TenantID,
		CompanyID:       c.CompanyID,
		CreatedByUserID: fromNullUUID(c.CreatedByUserID),
		TeamID:          fromNullUUIDPtr(c.TeamID),
		Title:           c.Title,
		Status:          entity.ParseCourseStatus(c.Status),
		Version:         c.Version,
		FolderID:        fromNullUUIDPtr(c.FolderID),
		CategoryTags:    c.CategoryTags,
		ThumbnailPath:   fromNullStringPtr(c.ThumbnailPath),
		ContentPath:     c.ContentPath,
		CreatedAt:       c.CreatedAt,
		UpdatedAt:       c.UpdatedAt,
	}
}

// statusToNullString converts *entity.CourseStatus to sql.NullString.
func statusToNullString(s *entity.CourseStatus) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: s.String(), Valid: true}
}

// tagsOrNil returns nil if tags slice is empty, otherwise returns the slice.
// This allows the nullable filter pattern to work correctly.
func tagsOrNil(tags []string) []string {
	if len(tags) == 0 {
		return nil
	}
	return tags
}
