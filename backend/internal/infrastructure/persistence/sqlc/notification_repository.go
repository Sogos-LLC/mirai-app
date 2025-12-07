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
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// NotificationRepository implements repository.NotificationRepository using sqlc-generated code.
type NotificationRepository struct {
	db *sql.DB
}

// NewNotificationRepository creates a new sqlc-based notification repository.
func NewNotificationRepository(db *sql.DB) repository.NotificationRepository {
	return &NotificationRepository{db: db}
}

// Create creates a new notification.
func (r *NotificationRepository) Create(ctx context.Context, notification *entity.Notification) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Notification, error) {
		return q.CreateNotification(ctx, gen.CreateNotificationParams{
			TenantID:  notification.TenantID,
			UserID:    notification.UserID,
			Type:      toNotificationType(notification.Type.String()),
			Priority:  toNotificationPriority(notification.Priority.String()),
			Title:     notification.Title,
			Message:   notification.Message,
			CourseID:  toNullUUID(notification.CourseID),
			JobID:     toNullUUID(notification.JobID),
			TaskID:    toNullUUID(notification.TaskID),
			SmeID:     toNullUUID(notification.SMEID),
			ActionUrl: toNullString(notification.ActionURL),
			Read:      notification.Read,
			EmailSent: notification.EmailSent,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create notification: %w", err)
	}

	notification.ID = result.ID
	notification.CreatedAt = result.CreatedAt
	return nil
}

// GetByID retrieves a notification by its ID.
func (r *NotificationRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Notification, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Notification, error) {
		return q.GetNotificationByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get notification: %w", err)
	}
	return toNotificationEntity(&result), nil
}

// List retrieves notifications for a user with optional filtering.
func (r *NotificationRepository) List(ctx context.Context, userID uuid.UUID, opts entity.NotificationListOptions) ([]*entity.Notification, int, error) {
	// Get count first
	var totalCount int32
	var err error

	if opts.UnreadOnly {
		totalCount, err = database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
			return q.CountUnreadNotificationsByUserID(ctx, userID)
		})
	} else {
		totalCount, err = database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
			return q.CountNotificationsByUserID(ctx, userID)
		})
	}
	if err != nil {
		return nil, 0, fmt.Errorf("failed to count notifications: %w", err)
	}

	// Get notifications
	limit := opts.Limit
	if limit <= 0 {
		limit = 50
	}

	var results []gen.Notification
	if opts.UnreadOnly {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Notification, error) {
			return q.ListUnreadNotificationsByUserID(ctx, gen.ListUnreadNotificationsByUserIDParams{
				UserID: userID,
				Limit:  sql.NullInt32{Int32: int32(limit), Valid: true},
			})
		})
	} else {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Notification, error) {
			return q.ListNotificationsByUserID(ctx, gen.ListNotificationsByUserIDParams{
				UserID: userID,
				Limit:  sql.NullInt32{Int32: int32(limit), Valid: true},
			})
		})
	}
	if err != nil {
		return nil, 0, fmt.Errorf("failed to list notifications: %w", err)
	}

	notifications := make([]*entity.Notification, len(results))
	for i := range results {
		notifications[i] = toNotificationEntity(&results[i])
	}
	return notifications, int(totalCount), nil
}

// GetUnreadCount returns the count of unread notifications.
func (r *NotificationRepository) GetUnreadCount(ctx context.Context, userID uuid.UUID) (int, error) {
	count, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (int32, error) {
		return q.CountUnreadNotificationsByUserID(ctx, userID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to get unread count: %w", err)
	}
	return int(count), nil
}

// MarkAsRead marks notifications as read.
func (r *NotificationRepository) MarkAsRead(ctx context.Context, userID uuid.UUID, notificationIDs []uuid.UUID) (int, error) {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.MarkNotificationsAsRead(ctx, gen.MarkNotificationsAsReadParams{
			UserID:          userID,
			NotificationIds: notificationIDs,
		})
	})
	if err != nil {
		return 0, fmt.Errorf("failed to mark as read: %w", err)
	}
	return len(notificationIDs), nil
}

// MarkAllAsRead marks all notifications as read for a user.
func (r *NotificationRepository) MarkAllAsRead(ctx context.Context, userID uuid.UUID) (int, error) {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.MarkAllNotificationsAsRead(ctx, userID)
	})
	if err != nil {
		return 0, fmt.Errorf("failed to mark all as read: %w", err)
	}
	return 0, nil // Count not available from exec
}

// Delete deletes a notification.
func (r *NotificationRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteNotification(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete notification: %w", err)
	}
	return nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toNotificationEntity(n *gen.Notification) *entity.Notification {
	notifType, _ := valueobject.ParseNotificationType(string(n.Type))
	priority, _ := valueobject.ParseNotificationPriority(string(n.Priority))

	return &entity.Notification{
		ID:        n.ID,
		TenantID:  n.TenantID,
		UserID:    n.UserID,
		Type:      notifType,
		Priority:  priority,
		Title:     n.Title,
		Message:   n.Message,
		CourseID:  fromNullUUIDPtr(n.CourseID),
		JobID:     fromNullUUIDPtr(n.JobID),
		TaskID:    fromNullUUIDPtr(n.TaskID),
		SMEID:     fromNullUUIDPtr(n.SmeID),
		ActionURL: fromNullStringPtr(n.ActionUrl),
		Read:      n.Read,
		EmailSent: n.EmailSent,
		CreatedAt: n.CreatedAt,
		ReadAt:    fromDoublePointerTime(n.ReadAt),
	}
}
