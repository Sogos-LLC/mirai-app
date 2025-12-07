-- Course CRUD operations
-- Schema: courses table with RLS isolation by tenant_id

-- name: CreateCourse :one
INSERT INTO courses (
    tenant_id,
    company_id,
    created_by_user_id,
    team_id,
    title,
    description,
    status,
    version,
    folder_id,
    category_tags,
    thumbnail_path,
    content_path
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
)
RETURNING *;

-- name: GetCourseByID :one
SELECT * FROM courses WHERE id = $1;

-- name: UpdateCourse :one
UPDATE courses SET
    title = $1,
    description = $2,
    status = $3,
    version = $4,
    folder_id = $5,
    category_tags = $6,
    thumbnail_path = $7,
    team_id = $8,
    updated_at = NOW()
WHERE id = $9
RETURNING *;

-- name: DeleteCourse :exec
DELETE FROM courses WHERE id = $1;

-- name: ListCourses :many
-- Dynamic filtering using nullable parameters
-- NULL param = skip filter, non-NULL = apply filter
SELECT * FROM courses
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('folder_id')::uuid IS NULL OR folder_id = sqlc.narg('folder_id'))
  AND (sqlc.narg('tags')::text[] IS NULL OR category_tags && sqlc.narg('tags'))
ORDER BY updated_at DESC
LIMIT COALESCE(sqlc.narg('limit')::int, 100)
OFFSET COALESCE(sqlc.narg('offset')::int, 0);

-- name: CountCourses :one
-- Count with same filters as ListCourses
SELECT COUNT(*)::int as count FROM courses
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status'))
  AND (sqlc.narg('folder_id')::uuid IS NULL OR folder_id = sqlc.narg('folder_id'))
  AND (sqlc.narg('tags')::text[] IS NULL OR category_tags && sqlc.narg('tags'));

-- name: CountCoursesByFolderID :one
SELECT COUNT(*)::int as count FROM courses WHERE folder_id = $1;

-- name: ListCoursesByCompanyID :many
SELECT * FROM courses
WHERE company_id = $1
ORDER BY updated_at DESC;

-- name: ListCoursesByTeamID :many
SELECT * FROM courses
WHERE team_id = $1
ORDER BY updated_at DESC;
