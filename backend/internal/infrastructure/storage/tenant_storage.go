package storage

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"path"
	"time"

	"github.com/google/uuid"
	"golang.org/x/sync/singleflight"

	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
)

const courseContentCacheTTL = 60 * time.Second

// TenantAwareStorage wraps a StorageAdapter with tenant-prefixed paths.
// It ensures storage isolation between tenants by prefixing all paths
// with the tenant ID: tenants/{tenant_id}/...
type TenantAwareStorage struct {
	inner StorageAdapter
	cache cache.Cache // optional — nil means no caching
	sf    singleflight.Group
}

// NewTenantAwareStorage creates a new TenantAwareStorage wrapping the given adapter.
// cache may be nil to disable caching.
func NewTenantAwareStorage(inner StorageAdapter, c cache.Cache) *TenantAwareStorage {
	return &TenantAwareStorage{inner: inner, cache: c}
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
// Uses a Redis cache (60s TTL) and singleflight to collapse concurrent reads
// of the same file into a single S3 call.
func (s *TenantAwareStorage) ReadCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, v interface{}) error {
	coursePath := s.CoursePath(tenantID, courseID)

	// 1. Try Redis cache
	if s.cache != nil {
		cacheKey := fmt.Sprintf("s3:%s", coursePath)
		var raw json.RawMessage
		entry, err := s.cache.Get(ctx, cacheKey, &raw)
		if err == nil && entry != nil {
			return json.Unmarshal(raw, v)
		}
	}

	// 2. Singleflight: collapse concurrent S3 reads for the same path
	result, err, _ := s.sf.Do(coursePath, func() (interface{}, error) {
		raw, readErr := s.inner.GetContent(ctx, coursePath)
		if readErr != nil {
			return nil, readErr
		}

		// Store in Redis cache
		if s.cache != nil {
			cacheKey := fmt.Sprintf("s3:%s", coursePath)
			if _, setErr := s.cache.Set(ctx, cacheKey, json.RawMessage(raw), "", courseContentCacheTTL); setErr != nil {
				slog.Warn("failed to cache course content", "path", coursePath, "error", setErr)
			}
		}

		return raw, nil
	})
	if err != nil {
		return err
	}

	// Each caller gets shared bytes, deserializes into their own struct
	raw := result.([]byte)
	return json.Unmarshal(raw, v)
}

// WriteCourseContent writes course content JSON to S3 and invalidates the cache.
func (s *TenantAwareStorage) WriteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID, v interface{}) error {
	if err := s.inner.WriteJSON(ctx, s.CoursePath(tenantID, courseID), v); err != nil {
		return err
	}
	s.invalidateCourseCache(ctx, tenantID, courseID)
	return nil
}

// DeleteCourseContent deletes course content from S3 and invalidates the cache.
func (s *TenantAwareStorage) DeleteCourseContent(ctx context.Context, tenantID, courseID uuid.UUID) error {
	if err := s.inner.Delete(ctx, s.CoursePath(tenantID, courseID)); err != nil {
		return err
	}
	s.invalidateCourseCache(ctx, tenantID, courseID)
	return nil
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

// GetContent retrieves raw file content from storage.
// Implements ContentStorage interface for SMEIngestionService.
func (s *TenantAwareStorage) GetContent(ctx context.Context, path string) ([]byte, error) {
	return s.inner.GetContent(ctx, path)
}

// PutContent stores raw content to storage.
// Implements ContentStorage interface for SMEIngestionService.
func (s *TenantAwareStorage) PutContent(ctx context.Context, path string, content []byte, contentType string) error {
	return s.inner.PutContent(ctx, path, content, contentType)
}

// Default configuration for atomic updates.
const (
	defaultMaxRetries = 5
	defaultBaseDelay  = 50 * time.Millisecond
)

// UpdateCourseContentAtomic atomically updates course content using optimistic concurrency.
// The updateFn receives the current content and should modify it in place.
// If concurrent modification is detected, the operation is retried up to maxRetries times.
//
// This prevents race conditions when multiple jobs update the same course content.json.
func (s *TenantAwareStorage) UpdateCourseContentAtomic(
	ctx context.Context,
	tenantID, courseID uuid.UUID,
	content interface{},
	updateFn func() error,
) error {
	return s.UpdateCourseContentAtomicWithRetries(ctx, tenantID, courseID, content, updateFn, defaultMaxRetries)
}

// UpdateCourseContentAtomicWithRetries is like UpdateCourseContentAtomic but allows custom retry count.
func (s *TenantAwareStorage) UpdateCourseContentAtomicWithRetries(
	ctx context.Context,
	tenantID, courseID uuid.UUID,
	content interface{},
	updateFn func() error,
	maxRetries int,
) error {
	// Verify we have an atomic storage adapter
	atomicStorage, ok := s.inner.(AtomicStorageAdapter)
	if !ok {
		// Fall back to non-atomic write (for tests or simple implementations)
		if err := s.ReadCourseContent(ctx, tenantID, courseID, content); err != nil {
			return err
		}
		if err := updateFn(); err != nil {
			return err
		}
		return s.WriteCourseContent(ctx, tenantID, courseID, content)
	}

	coursePath := s.CoursePath(tenantID, courseID)

	for attempt := 0; attempt < maxRetries; attempt++ {
		// 1. Read current content with ETag
		result, err := atomicStorage.ReadJSONWithETag(ctx, coursePath, content)
		if err != nil {
			return err
		}

		// 2. Apply the update function
		if err := updateFn(); err != nil {
			return err
		}

		// 3. Write back with ETag condition
		err = atomicStorage.WriteJSONWithETag(ctx, coursePath, content, result.ETag)
		if err == nil {
			// Success — invalidate cache after write
			s.invalidateCourseCache(ctx, tenantID, courseID)
			return nil
		}

		if errors.Is(err, ErrPreconditionFailed) {
			// Concurrent modification detected, retry
			slog.Warn("concurrent modification detected, retrying",
				"attempt", attempt+1,
				"maxRetries", maxRetries,
				"courseID", courseID,
				"tenantID", tenantID)

			// Add jitter to reduce contention
			jitter := time.Duration(attempt+1) * defaultBaseDelay
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(jitter):
				continue
			}
		}

		// Other error, return immediately
		return err
	}

	return ErrMaxRetriesExceeded
}

// invalidateCourseCache removes the cached course content from Redis.
func (s *TenantAwareStorage) invalidateCourseCache(ctx context.Context, tenantID, courseID uuid.UUID) {
	if s.cache == nil {
		return
	}
	cacheKey := fmt.Sprintf("s3:%s", s.CoursePath(tenantID, courseID))
	if err := s.cache.Delete(ctx, cacheKey); err != nil {
		slog.Warn("failed to invalidate course content cache", "key", cacheKey, "error", err)
	}
}
