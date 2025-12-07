package sqlc

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database/gen"
)

// =============================================================================
// UUID Conversion Helpers
// =============================================================================

// toNullUUID converts a *uuid.UUID to uuid.NullUUID.
func toNullUUID(u *uuid.UUID) uuid.NullUUID {
	if u == nil {
		return uuid.NullUUID{}
	}
	return uuid.NullUUID{UUID: *u, Valid: true}
}

// fromNullUUID extracts uuid.UUID from uuid.NullUUID, returns zero UUID if null.
func fromNullUUID(n uuid.NullUUID) uuid.UUID {
	if !n.Valid {
		return uuid.UUID{}
	}
	return n.UUID
}

// fromNullUUIDPtr extracts *uuid.UUID from uuid.NullUUID.
func fromNullUUIDPtr(n uuid.NullUUID) *uuid.UUID {
	if !n.Valid {
		return nil
	}
	return &n.UUID
}

// =============================================================================
// String Conversion Helpers
// =============================================================================

// toNullString converts a *string to sql.NullString.
func toNullString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}

// stringToNullString converts a string to sql.NullString.
// An empty string results in a null value.
func stringToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// fromNullStringPtr extracts *string from sql.NullString.
func fromNullStringPtr(n sql.NullString) *string {
	if !n.Valid {
		return nil
	}
	return &n.String
}

// fromNullString extracts string from sql.NullString, returns empty string if null.
func fromNullString(n sql.NullString) string {
	if !n.Valid {
		return ""
	}
	return n.String
}

// =============================================================================
// Int Conversion Helpers
// =============================================================================

// toNullInt32 converts an int to sql.NullInt32, treating 0 as null.
func toNullInt32(i int) sql.NullInt32 {
	if i == 0 {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(i), Valid: true}
}

// toNullInt32FromPtr converts a *int32 to sql.NullInt32.
func toNullInt32FromPtr(i *int32) sql.NullInt32 {
	if i == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: *i, Valid: true}
}

// toNullInt64 converts a *int64 to sql.NullInt64.
func toNullInt64(i *int64) sql.NullInt64 {
	if i == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *i, Valid: true}
}

// fromNullInt64Ptr extracts *int64 from sql.NullInt64.
func fromNullInt64Ptr(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	return &n.Int64
}

// fromNullInt32 extracts int32 from sql.NullInt32.
func fromNullInt32(n sql.NullInt32) int32 {
	if !n.Valid {
		return 0
	}
	return n.Int32
}

// fromNullInt32Ptr extracts *int32 from sql.NullInt32.
func fromNullInt32Ptr(n sql.NullInt32) *int32 {
	if !n.Valid {
		return nil
	}
	return &n.Int32
}

// =============================================================================
// Time Conversion Helpers
// =============================================================================

// toDoublePointerTime converts *time.Time to **time.Time (for sqlc double pointer fields).
func toDoublePointerTime(t *time.Time) **time.Time {
	if t == nil {
		return nil
	}
	return &t
}

// fromDoublePointerTime converts **time.Time to *time.Time.
func fromDoublePointerTime(t **time.Time) *time.Time {
	if t == nil || *t == nil {
		return nil
	}
	return *t
}

// =============================================================================
// Enum Conversion Helpers
// =============================================================================

// toAiProvider converts a string to gen.AiProvider.
func toAiProvider(s string) gen.AiProvider {
	return gen.AiProvider(s)
}

// toOutlineApprovalStatus converts a string to gen.OutlineApprovalStatus.
func toOutlineApprovalStatus(s string) gen.OutlineApprovalStatus {
	return gen.OutlineApprovalStatus(s)
}

// toNotificationType converts a string to gen.NotificationType.
func toNotificationType(s string) gen.NotificationType {
	return gen.NotificationType(s)
}

// toNotificationPriority converts a string to gen.NotificationPriority.
func toNotificationPriority(s string) gen.NotificationPriority {
	return gen.NotificationPriority(s)
}

// toExperienceLevel converts a string to gen.ExperienceLevel.
func toExperienceLevel(s string) gen.ExperienceLevel {
	return gen.ExperienceLevel(s)
}

// toTargetAudienceStatus converts a string to gen.TargetAudienceStatus.
func toTargetAudienceStatus(s string) gen.TargetAudienceStatus {
	return gen.TargetAudienceStatus(s)
}

// toSmeScope converts a string to gen.SmeScope.
func toSmeScope(s string) gen.SmeScope {
	return gen.SmeScope(s)
}

// toSmeStatus converts a string to gen.SmeStatus.
func toSmeStatus(s string) gen.SmeStatus {
	return gen.SmeStatus(s)
}

// toSmeTaskStatus converts a string to gen.SmeTaskStatus.
func toSmeTaskStatus(s string) gen.SmeTaskStatus {
	return gen.SmeTaskStatus(s)
}

// toSmeContentType converts a string to gen.SmeContentType.
func toSmeContentType(s string) gen.SmeContentType {
	return gen.SmeContentType(s)
}

// toNullSmeContentType converts a *string to gen.NullSmeContentType.
func toNullSmeContentType(s *string) gen.NullSmeContentType {
	if s == nil {
		return gen.NullSmeContentType{}
	}
	return gen.NullSmeContentType{SmeContentType: gen.SmeContentType(*s), Valid: true}
}

// toLessonComponentType converts a string to gen.LessonComponentType.
func toLessonComponentType(s string) gen.LessonComponentType {
	return gen.LessonComponentType(s)
}

// toGenerationJobType converts a string to gen.GenerationJobType.
func toGenerationJobType(s string) gen.GenerationJobType {
	return gen.GenerationJobType(s)
}

// toGenerationJobStatus converts a string to gen.GenerationJobStatus.
func toGenerationJobStatus(s string) gen.GenerationJobStatus {
	return gen.GenerationJobStatus(s)
}

// toNullGenerationJobType converts a *string to gen.NullGenerationJobType.
func toNullGenerationJobType(s *string) gen.NullGenerationJobType {
	if s == nil {
		return gen.NullGenerationJobType{}
	}
	return gen.NullGenerationJobType{GenerationJobType: gen.GenerationJobType(*s), Valid: true}
}

// toNullGenerationJobStatus converts a *string to gen.NullGenerationJobStatus.
func toNullGenerationJobStatus(s *string) gen.NullGenerationJobStatus {
	if s == nil {
		return gen.NullGenerationJobStatus{}
	}
	return gen.NullGenerationJobStatus{GenerationJobStatus: gen.GenerationJobStatus(*s), Valid: true}
}

// toNullSmeScope converts a *string to gen.NullSmeScope.
func toNullSmeScope(s *string) gen.NullSmeScope {
	if s == nil {
		return gen.NullSmeScope{}
	}
	return gen.NullSmeScope{SmeScope: gen.SmeScope(*s), Valid: true}
}

// toNullSmeStatus converts a *string to gen.NullSmeStatus.
func toNullSmeStatus(s *string) gen.NullSmeStatus {
	if s == nil {
		return gen.NullSmeStatus{}
	}
	return gen.NullSmeStatus{SmeStatus: gen.SmeStatus(*s), Valid: true}
}

// toNullSmeTaskStatus converts a *string to gen.NullSmeTaskStatus.
func toNullSmeTaskStatus(s *string) gen.NullSmeTaskStatus {
	if s == nil {
		return gen.NullSmeTaskStatus{}
	}
	return gen.NullSmeTaskStatus{SmeTaskStatus: gen.SmeTaskStatus(*s), Valid: true}
}
