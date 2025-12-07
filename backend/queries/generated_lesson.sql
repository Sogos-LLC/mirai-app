-- Generated Lesson, Lesson Component, and Course Generation Input CRUD operations
-- Schema: generated_lessons, lesson_components, course_generation_inputs tables

-- ============================================================================
-- Generated Lessons
-- ============================================================================

-- name: CreateGeneratedLesson :one
INSERT INTO generated_lessons (tenant_id, course_id, section_id, outline_lesson_id, title, segue_text)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetGeneratedLessonByID :one
SELECT * FROM generated_lessons WHERE id = $1;

-- name: GetGeneratedLessonByOutlineLessonID :one
SELECT * FROM generated_lessons WHERE outline_lesson_id = $1;

-- name: ListGeneratedLessonsByCourseID :many
SELECT * FROM generated_lessons
WHERE course_id = $1
ORDER BY generated_at ASC;

-- name: UpdateGeneratedLesson :exec
UPDATE generated_lessons
SET title = $1, segue_text = $2
WHERE id = $3;

-- ============================================================================
-- Lesson Components
-- ============================================================================

-- name: CreateLessonComponent :one
INSERT INTO lesson_components (tenant_id, lesson_id, type, position, content_json, sme_chunk_ids, learning_objective_ids)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: GetLessonComponentByID :one
SELECT * FROM lesson_components WHERE id = $1;

-- name: ListLessonComponentsByLessonID :many
SELECT * FROM lesson_components
WHERE lesson_id = $1
ORDER BY position ASC;

-- name: UpdateLessonComponent :one
UPDATE lesson_components
SET type = $1, position = $2, content_json = $3, sme_chunk_ids = $4, learning_objective_ids = $5, updated_at = NOW()
WHERE id = $6
RETURNING *;

-- name: DeleteLessonComponent :exec
DELETE FROM lesson_components WHERE id = $1;

-- ============================================================================
-- Course Generation Inputs
-- ============================================================================

-- name: CreateCourseGenerationInput :one
INSERT INTO course_generation_inputs (tenant_id, course_id, sme_ids, target_audience_ids, desired_outcome, additional_context)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: GetCourseGenerationInputByCourseID :one
SELECT * FROM course_generation_inputs WHERE course_id = $1;

-- name: UpdateCourseGenerationInput :one
UPDATE course_generation_inputs
SET sme_ids = $1, target_audience_ids = $2, desired_outcome = $3, additional_context = $4, updated_at = NOW()
WHERE id = $5
RETURNING *;
