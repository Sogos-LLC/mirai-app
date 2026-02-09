-- Course Sharing CRUD operations
-- Schema: course_share_links, share_verification_codes, share_review_comments

-- name: CreateShareLink :one
INSERT INTO course_share_links (tenant_id, course_id, created_by, token, allowed_emails)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetShareLinkByToken :one
SELECT * FROM course_share_links WHERE token = $1;

-- name: GetShareLinkByID :one
SELECT * FROM course_share_links WHERE id = $1;

-- name: ListShareLinksByCourseID :many
SELECT * FROM course_share_links
WHERE course_id = $1
ORDER BY created_at DESC;

-- name: UpdateShareLinkEmails :one
UPDATE course_share_links
SET allowed_emails = $1, updated_at = now()
WHERE id = $2
RETURNING *;

-- name: DeactivateShareLink :exec
UPDATE course_share_links
SET is_active = false, updated_at = now()
WHERE id = $1;

-- name: CreateVerificationCode :one
INSERT INTO share_verification_codes (share_link_id, email, code, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetVerificationCode :one
SELECT * FROM share_verification_codes
WHERE share_link_id = $1
  AND email = $2
  AND code = $3
  AND expires_at > now()
  AND verified_at IS NULL
ORDER BY created_at DESC
LIMIT 1;

-- name: MarkVerificationCodeUsed :exec
UPDATE share_verification_codes
SET verified_at = now()
WHERE id = $1;

-- name: CreateReviewComment :one
INSERT INTO share_review_comments (share_link_id, course_id, lesson_id, reviewer_email, comment)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListReviewCommentsByLesson :many
SELECT * FROM share_review_comments
WHERE course_id = $1 AND lesson_id = $2
ORDER BY created_at ASC;

-- name: ListReviewCommentsByCourse :many
SELECT * FROM share_review_comments
WHERE course_id = $1
ORDER BY created_at ASC;
