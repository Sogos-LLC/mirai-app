package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
)

// CourseRepository implements repository.CourseRepository using PostgreSQL.
type CourseRepository struct {
	db *sql.DB
}

// NewCourseRepository creates a new PostgreSQL course repository.
func NewCourseRepository(db *sql.DB) repository.CourseRepository {
	return &CourseRepository{db: db}
}

// Create creates a new course.
func (r *CourseRepository) Create(ctx context.Context, course *entity.Course) error {
	query := `
		INSERT INTO courses (tenant_id, company_id, created_by_user_id, team_id, title, status, version, folder_id, category_tags, thumbnail_path, content_path)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		course.TenantID,
		course.CompanyID,
		course.CreatedByUserID,
		course.TeamID,
		course.Title,
		course.Status.String(),
		course.Version,
		course.FolderID,
		pq.Array(course.CategoryTags),
		course.ThumbnailPath,
		course.ContentPath,
	).Scan(&course.ID, &course.CreatedAt, &course.UpdatedAt)
}

// GetByID retrieves a course by its ID.
func (r *CourseRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Course, error) {
	query := `
		SELECT id, tenant_id, company_id, created_by_user_id, team_id, title, status, version, folder_id, category_tags, thumbnail_path, content_path, created_at, updated_at
		FROM courses
		WHERE id = $1
	`
	course := &entity.Course{}
	var statusStr string
	var tags pq.StringArray
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&course.ID,
		&course.TenantID,
		&course.CompanyID,
		&course.CreatedByUserID,
		&course.TeamID,
		&course.Title,
		&statusStr,
		&course.Version,
		&course.FolderID,
		&tags,
		&course.ThumbnailPath,
		&course.ContentPath,
		&course.CreatedAt,
		&course.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get course: %w", err)
	}
	course.Status = entity.ParseCourseStatus(statusStr)
	course.CategoryTags = []string(tags)
	return course, nil
}

// Update updates a course.
func (r *CourseRepository) Update(ctx context.Context, course *entity.Course) error {
	query := `
		UPDATE courses
		SET title = $1, status = $2, version = $3, folder_id = $4, category_tags = $5, thumbnail_path = $6, team_id = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		course.Title,
		course.Status.String(),
		course.Version,
		course.FolderID,
		pq.Array(course.CategoryTags),
		course.ThumbnailPath,
		course.TeamID,
		course.ID,
	).Scan(&course.UpdatedAt)
}

// Delete deletes a course.
func (r *CourseRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM courses WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete course: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("course not found")
	}
	return nil
}

// List retrieves courses with optional filtering.
func (r *CourseRepository) List(ctx context.Context, opts entity.CourseListOptions) ([]*entity.Course, error) {
	query := `
		SELECT id, tenant_id, company_id, created_by_user_id, team_id, title, status, version, folder_id, category_tags, thumbnail_path, content_path, created_at, updated_at
		FROM courses
		WHERE 1=1
	`
	args := []interface{}{}
	argIndex := 1

	if opts.Status != nil {
		query += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, opts.Status.String())
		argIndex++
	}

	if opts.FolderID != nil {
		query += fmt.Sprintf(" AND folder_id = $%d", argIndex)
		args = append(args, *opts.FolderID)
		argIndex++
	}

	if len(opts.Tags) > 0 {
		query += fmt.Sprintf(" AND category_tags && $%d", argIndex)
		args = append(args, pq.Array(opts.Tags))
		argIndex++
	}

	query += " ORDER BY updated_at DESC"

	if opts.Limit > 0 {
		query += fmt.Sprintf(" LIMIT $%d", argIndex)
		args = append(args, opts.Limit)
		argIndex++
	}

	if opts.Offset > 0 {
		query += fmt.Sprintf(" OFFSET $%d", argIndex)
		args = append(args, opts.Offset)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list courses: %w", err)
	}
	defer rows.Close()

	var courses []*entity.Course
	for rows.Next() {
		course := &entity.Course{}
		var statusStr string
		var tags pq.StringArray
		if err := rows.Scan(
			&course.ID,
			&course.TenantID,
			&course.CompanyID,
			&course.CreatedByUserID,
			&course.TeamID,
			&course.Title,
			&statusStr,
			&course.Version,
			&course.FolderID,
			&tags,
			&course.ThumbnailPath,
			&course.ContentPath,
			&course.CreatedAt,
			&course.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan course: %w", err)
		}
		course.Status = entity.ParseCourseStatus(statusStr)
		course.CategoryTags = []string(tags)
		courses = append(courses, course)
	}
	return courses, nil
}

// CountByFolder counts courses in a folder.
func (r *CourseRepository) CountByFolder(ctx context.Context, folderID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM courses WHERE folder_id = $1`
	var count int
	err := r.db.QueryRowContext(ctx, query, folderID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count courses: %w", err)
	}
	return count, nil
}
