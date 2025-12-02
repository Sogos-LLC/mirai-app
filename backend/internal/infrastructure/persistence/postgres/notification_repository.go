package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// NotificationRepository implements repository.NotificationRepository using PostgreSQL.
type NotificationRepository struct {
	db *sql.DB
}

// NewNotificationRepository creates a new PostgreSQL notification repository.
func NewNotificationRepository(db *sql.DB) repository.NotificationRepository {
	return &NotificationRepository{db: db}
}

// Create creates a new notification.
func (r *NotificationRepository) Create(ctx context.Context, notification *entity.Notification) error {
	query := `
		INSERT INTO notifications (tenant_id, user_id, type, priority, title, message, course_id, job_id, task_id, sme_id, action_url, read, email_sent)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query,
		notification.TenantID,
		notification.UserID,
		notification.Type.String(),
		notification.Priority.String(),
		notification.Title,
		notification.Message,
		notification.CourseID,
		notification.JobID,
		notification.TaskID,
		notification.SMEID,
		notification.ActionURL,
		notification.Read,
		notification.EmailSent,
	).Scan(&notification.ID, &notification.CreatedAt)
}

// GetByID retrieves a notification by its ID.
func (r *NotificationRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Notification, error) {
	query := `
		SELECT id, tenant_id, user_id, type, priority, title, message, course_id, job_id, task_id, sme_id, action_url, read, email_sent, created_at, read_at
		FROM notifications
		WHERE id = $1
	`
	n := &entity.Notification{}
	var typeStr, priorityStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&n.ID,
		&n.TenantID,
		&n.UserID,
		&typeStr,
		&priorityStr,
		&n.Title,
		&n.Message,
		&n.CourseID,
		&n.JobID,
		&n.TaskID,
		&n.SMEID,
		&n.ActionURL,
		&n.Read,
		&n.EmailSent,
		&n.CreatedAt,
		&n.ReadAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}
	n.Type, _ = valueobject.ParseNotificationType(typeStr)
	n.Priority, _ = valueobject.ParseNotificationPriority(priorityStr)
	return n, nil
}

// List retrieves notifications for a user with optional filtering.
func (r *NotificationRepository) List(ctx context.Context, userID uuid.UUID, opts entity.NotificationListOptions) ([]*entity.Notification, int, error) {
	// Count total
	countQuery := `SELECT COUNT(*) FROM notifications WHERE user_id = $1`
	countArgs := []interface{}{userID}
	if opts.UnreadOnly {
		countQuery += " AND read = false"
	}
	if opts.Type != nil {
		countQuery += fmt.Sprintf(" AND type = $%d", len(countArgs)+1)
		countArgs = append(countArgs, opts.Type.String())
	}

	var totalCount int
	if err := r.db.QueryRowContext(ctx, countQuery, countArgs...).Scan(&totalCount); err != nil {
		return nil, 0, fmt.Errorf("failed to count notifications: %w", err)
	}

	// List query
	query := `
		SELECT id, tenant_id, user_id, type, priority, title, message, course_id, job_id, task_id, sme_id, action_url, read, email_sent, created_at, read_at
		FROM notifications
		WHERE user_id = $1
	`
	args := []interface{}{userID}
	argIndex := 2

	if opts.UnreadOnly {
		query += " AND read = false"
	}

	if opts.Type != nil {
		query += fmt.Sprintf(" AND type = $%d", argIndex)
		args = append(args, opts.Type.String())
		argIndex++
	}

	// Cursor-based pagination using "timestamp|id" format
	if opts.Cursor != nil {
		parts := strings.SplitN(*opts.Cursor, "|", 2)
		if len(parts) == 2 {
			cursorTime, timeErr := time.Parse(time.RFC3339Nano, parts[0])
			cursorID, idErr := uuid.Parse(parts[1])
			if timeErr == nil && idErr == nil {
				// Use composite comparison for stable pagination
				query += fmt.Sprintf(" AND (created_at, id) < ($%d, $%d)", argIndex, argIndex+1)
				args = append(args, cursorTime, cursorID)
				argIndex += 2
			}
		}
	}

	query += " ORDER BY created_at DESC, id DESC"

	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}
	query += fmt.Sprintf(" LIMIT $%d", argIndex)
	args = append(args, limit)

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list notifications: %w", err)
	}
	defer rows.Close()

	var notifications []*entity.Notification
	for rows.Next() {
		n := &entity.Notification{}
		var typeStr, priorityStr string
		if err := rows.Scan(
			&n.ID,
			&n.TenantID,
			&n.UserID,
			&typeStr,
			&priorityStr,
			&n.Title,
			&n.Message,
			&n.CourseID,
			&n.JobID,
			&n.TaskID,
			&n.SMEID,
			&n.ActionURL,
			&n.Read,
			&n.EmailSent,
			&n.CreatedAt,
			&n.ReadAt,
		); err != nil {
			return nil, 0, fmt.Errorf("failed to scan notification: %w", err)
		}
		n.Type, _ = valueobject.ParseNotificationType(typeStr)
		n.Priority, _ = valueobject.ParseNotificationPriority(priorityStr)
		notifications = append(notifications, n)
	}
	return notifications, totalCount, nil
}

// GetUnreadCount returns the count of unread notifications.
func (r *NotificationRepository) GetUnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = false`
	var count int
	err := r.db.QueryRowContext(ctx, query, userID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}
	return count, nil
}

// MarkAsRead marks notifications as read.
func (r *NotificationRepository) MarkAsRead(ctx context.Context, userID uuid.UUID, notificationIDs []uuid.UUID) (int, error) {
	query := `
		UPDATE notifications
		SET read = true, read_at = NOW()
		WHERE user_id = $1 AND id = ANY($2) AND read = false
	`
	result, err := r.db.ExecContext(ctx, query, userID, pq.Array(notificationIDs))
	if err != nil {
		return 0, fmt.Errorf("failed to mark as read: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get affected rows: %w", err)
	}
	return int(rows), nil
}

// MarkAllAsRead marks all notifications as read for a user.
func (r *NotificationRepository) MarkAllAsRead(ctx context.Context, userID uuid.UUID) (int, error) {
	query := `
		UPDATE notifications
		SET read = true, read_at = NOW()
		WHERE user_id = $1 AND read = false
	`
	result, err := r.db.ExecContext(ctx, query, userID)
	if err != nil {
		return 0, fmt.Errorf("failed to mark all as read: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get affected rows: %w", err)
	}
	return int(rows), nil
}

// Delete deletes a notification.
func (r *NotificationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM notifications WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete notification: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("notification not found")
	}
	return nil
}
