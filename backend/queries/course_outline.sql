-- Course Outline, Section, and Lesson CRUD operations
-- Schema: course_outlines, outline_sections, outline_lessons tables with RLS

-- ============================================================================
-- Course Outlines
-- ============================================================================

-- name: CreateCourseOutline :one
INSERT INTO course_outlines (tenant_id, course_id, version, approval_status, rejection_reason)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CreateCourseOutlineWithID :exec
INSERT INTO course_outlines (id, tenant_id, course_id, version, approval_status, rejection_reason, generated_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW());

-- name: GetCourseOutlineByID :one
SELECT * FROM course_outlines WHERE id = $1;

-- name: GetLatestCourseOutlineByCourseID :one
SELECT * FROM course_outlines
WHERE course_id = $1
ORDER BY version DESC
LIMIT 1;

-- name: GetCourseOutlineByCourseIDAndVersion :one
SELECT * FROM course_outlines
WHERE course_id = $1 AND version = $2;

-- name: UpdateCourseOutline :exec
UPDATE course_outlines
SET approval_status = $1, rejection_reason = $2, approved_at = $3, approved_by_user_id = $4
WHERE id = $5;

-- name: GetNextOutlineVersion :one
SELECT COALESCE(MAX(version), 0) + 1 as next_version
FROM course_outlines
WHERE course_id = $1;

-- ============================================================================
-- Outline Sections
-- ============================================================================

-- name: CreateOutlineSection :one
INSERT INTO outline_sections (tenant_id, outline_id, title, description, position)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CreateOutlineSectionWithID :exec
INSERT INTO outline_sections (id, tenant_id, outline_id, title, description, position, created_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW());

-- name: GetOutlineSectionByID :one
SELECT * FROM outline_sections WHERE id = $1;

-- name: ListOutlineSectionsByOutlineID :many
SELECT * FROM outline_sections
WHERE outline_id = $1
ORDER BY position ASC;

-- name: UpdateOutlineSection :exec
UPDATE outline_sections
SET title = $1, description = $2, position = $3
WHERE id = $4;

-- name: DeleteOutlineSection :exec
DELETE FROM outline_sections WHERE id = $1;

-- ============================================================================
-- Outline Lessons
-- ============================================================================

-- name: CreateOutlineLesson :one
INSERT INTO outline_lessons (tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: CreateOutlineLessonWithID :exec
INSERT INTO outline_lessons (id, tenant_id, section_id, title, description, position, estimated_duration_minutes, learning_objectives, is_last_in_section, is_last_in_course, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW());

-- name: GetOutlineLessonByID :one
SELECT * FROM outline_lessons WHERE id = $1;

-- name: ListOutlineLessonsBySectionID :many
SELECT * FROM outline_lessons
WHERE section_id = $1
ORDER BY position ASC;

-- name: UpdateOutlineLesson :exec
UPDATE outline_lessons
SET title = $1, description = $2, position = $3, estimated_duration_minutes = $4, learning_objectives = $5, is_last_in_section = $6, is_last_in_course = $7
WHERE id = $8;

-- name: DeleteOutlineLesson :exec
DELETE FROM outline_lessons WHERE id = $1;
