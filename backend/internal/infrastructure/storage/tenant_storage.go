package storage

import (
	"context"
	"path"
	"time"

	"github.com/google/uuid"
)

// TenantAwareStorage wraps a StorageAdapter with tenant-prefixed paths.
// It ensures storage isolation between tenants by prefixing all paths
// with the tenant ID: tenants/{tenant_id}/...
type TenantAwareStorage struct {
	inner StorageAdapter
}

// NewTenantAwareStorage creates a new TenantAwareStorage wrapping the given adapter.
func NewTenantAwareStorage(inner StorageAdapter) *TenantAwareStorage {
	return &TenantAwareStorage{inner: inner}
}

// BuildPath creates a tenant-prefixed path.
// Example: BuildPath(tenantID, "courses/123/content.json") -> "tenants/{tenant_id}/courses/123/content.json"
func (s *TenantAwareStorage) BuildPath(tenantID uuid.UUID, subpath string) string {
	return path.Join("tenants", tenantID.String(), subpath)
}

// CoursePath returns the path for course content.
// Path format: tenants/{tenant_id}/courses/{course_id}/content.json
func (s *TenantAwareStorage) CoursePath(tenantID, courseID uuid.UUID) string {
	return s.BuildPath(tenantID, path.Join("courses", courseID.String(), "content.json"))
}

// ExportPath returns the path for an export file.
// Path format: tenants/{tenant_id}/exports/{export_id}/{filename}
func (s *TenantAwareStorage) ExportPath(tenantID, exportID uuid.UUID, filename string) string {
	return s.BuildPath(tenantID, path.Join("exports", exportID.String(), filename))
}

// ReadCourseContent reads course content JSON from S3.
func (s *TenantAwareStorage) ReadCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, v interface{}) error {
	return s.inner.ReadJSON(ctx, s.CoursePath(tenantID, courseID), v)
}

// WriteCourseContent writes course content JSON to S3.
func (s *TenantAwareStorage) WriteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, v interface{}) error {
	return s.inner.WriteJSON(ctx, s.CoursePath(tenantID, courseID), v)
}

// DeleteCourseContent deletes course content from S3.
func (s *TenantAwareStorage) DeleteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) error {
	return s.inner.Delete(ctx, s.CoursePath(tenantID, courseID))
}

// CourseContentExists checks if course content exists in S3.
func (s *TenantAwareStorage) CourseContentExists(ctx context.Context, tenantID, courseID uuid.UUID) (bool, error) {
	return s.inner.Exists(ctx, s.CoursePath(tenantID, courseID))
}

// ReadExport reads an export file from S3.
func (s *TenantAwareStorage) ReadExport(ctx context.Context, tenantID, exportID uuid.UUID, filename string, v interface{}) error {
	return s.inner.ReadJSON(ctx, s.ExportPath(tenantID, exportID, filename), v)
}

// WriteExport writes an export file to S3.
func (s *TenantAwareStorage) WriteExport(ctx context.Context, tenantID, exportID uuid.UUID, filename string, v interface{}) error {
	return s.inner.WriteJSON(ctx, s.ExportPath(tenantID, exportID, filename), v)
}

// DeleteExport deletes an export file from S3.
func (s *TenantAwareStorage) DeleteExport(ctx context.Context, tenantID, exportID uuid.UUID, filename string) error {
	return s.inner.Delete(ctx, s.ExportPath(tenantID, exportID, filename))
}

// Inner returns the underlying StorageAdapter for cases where
// direct access is needed (e.g., binary file uploads).
func (s *TenantAwareStorage) Inner() StorageAdapter {
	return s.inner
}

// GenerateUploadURL generates a presigned URL for tenant-scoped uploads.
func (s *TenantAwareStorage) GenerateUploadURL(ctx context.Context, tenantID uuid.UUID, subpath string, expiry time.Duration) (string, error) {
	fullPath := s.BuildPath(tenantID, subpath)
	return s.inner.GenerateUploadURL(ctx, fullPath, expiry)
}

// GenerateDownloadURL generates a presigned URL for tenant-scoped downloads.
func (s *TenantAwareStorage) GenerateDownloadURL(ctx context.Context, tenantID uuid.UUID, subpath string, expiry time.Duration) (string, error) {
	fullPath := s.BuildPath(tenantID, subpath)
	return s.inner.GenerateDownloadURL(ctx, fullPath, expiry)
}
