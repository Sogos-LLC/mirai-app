package generation

import (
	"context"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// TenantStorageAdapter adapts TenantAwareStorage to the ContentStorage interface.
type TenantStorageAdapter struct {
	storage *storage.TenantAwareStorage
}

// NewTenantStorageAdapter creates a new adapter.
func NewTenantStorageAdapter(s *storage.TenantAwareStorage) *TenantStorageAdapter {
	return &TenantStorageAdapter{storage: s}
}

// ReadCourseContent reads course content from storage.
func (a *TenantStorageAdapter) ReadCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}) error {
	return a.storage.ReadCourseContent(ctx, tenantID, courseID, content)
}

// WriteCourseContent writes course content to storage.
func (a *TenantStorageAdapter) WriteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}) error {
	return a.storage.WriteCourseContent(ctx, tenantID, courseID, content)
}

// UpdateCourseContentAtomic atomically updates course content.
func (a *TenantStorageAdapter) UpdateCourseContentAtomic(ctx context.Context, tenantID, courseID uuid.UUID, content interface{}, updateFn func() error) error {
	return a.storage.UpdateCourseContentAtomic(ctx, tenantID, courseID, content, updateFn)
}
