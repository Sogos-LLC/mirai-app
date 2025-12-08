package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// Notification represents a user notification.
type Notification struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	UserID   uuid.UUID

	Type     valueobject.NotificationType
	Priority valueobject.NotificationPriority

	Title   string
	Message string

	// Optional references for navigation
	CourseID *uuid.UUID
	JobID    *uuid.UUID
	TaskID   *uuid.UUID
	SMEID    *uuid.UUID
	ExportID *uuid.UUID

	// Action URL for frontend navigation
	ActionURL *string

	Read      bool
	EmailSent bool

	CreatedAt time.Time
	ReadAt    *time.Time
}

// NotificationListOptions provides filtering options for listing notifications.
type NotificationListOptions struct {
	UnreadOnly bool
	Type       *valueobject.NotificationType
	Limit      int
	Cursor     *string // For pagination
}
