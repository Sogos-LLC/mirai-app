-- Notification CRUD operations
-- Schema: notifications table with RLS isolation by tenant_id

-- name: CreateNotification :one
INSERT INTO notifications (tenant_id, user_id, type, priority, title, message, course_id, job_id, action_url, read, email_sent)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
RETURNING *;

-- name: GetNotificationByID :one
SELECT * FROM notifications WHERE id = $1;

-- name: ListNotificationsByUserID :many
SELECT * FROM notifications
WHERE user_id = $1
ORDER BY created_at DESC, id DESC
LIMIT COALESCE(sqlc.narg('limit')::int, 50);

-- name: ListUnreadNotificationsByUserID :many
SELECT * FROM notifications
WHERE user_id = $1 AND read = false
ORDER BY created_at DESC, id DESC
LIMIT COALESCE(sqlc.narg('limit')::int, 50);

-- name: CountNotificationsByUserID :one
SELECT COUNT(*)::int as count FROM notifications
WHERE user_id = $1;

-- name: CountUnreadNotificationsByUserID :one
SELECT COUNT(*)::int as count FROM notifications
WHERE user_id = $1 AND read = false;

-- name: MarkNotificationsAsRead :exec
UPDATE notifications
SET read = true, read_at = NOW()
WHERE user_id = $1 AND id = ANY(@notification_ids::uuid[]) AND read = false;

-- name: MarkAllNotificationsAsRead :exec
UPDATE notifications
SET read = true, read_at = NOW()
WHERE user_id = $1 AND read = false;

-- name: DeleteNotification :exec
DELETE FROM notifications WHERE id = $1;
