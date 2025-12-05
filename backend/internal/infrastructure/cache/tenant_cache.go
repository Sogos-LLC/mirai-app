package cache

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
)

// TenantCache wraps a Cache with tenant-prefixed keys.
// It ensures cache isolation between tenants by prefixing all keys
// with the tenant ID: tenant:{tenant_id}:...
//
// This wrapper enforces that:
// 1. All cache operations require a valid tenant context
// 2. Keys are automatically prefixed with tenant:{id}:
// 3. Developers cannot accidentally create cross-tenant cache pollution
//
// Example:
//
//	Input key:  "courses:all"
//	Output key: "tenant:40010dd3-3332-4fbd-b217-3bd5d28968f6:courses:all"
type TenantCache struct {
	inner Cache
}

// NewTenantCache creates a new tenant-aware cache wrapper.
func NewTenantCache(inner Cache) *TenantCache {
	return &TenantCache{inner: inner}
}

// keyWithTenant prefixes the key with the tenant ID from context.
// PANICS if tenant context is missing - this is intentional to fail fast
// and force developers to fix missing context immediately.
func (c *TenantCache) keyWithTenant(ctx context.Context, key string) string {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok || tenantID == uuid.Nil {
		panic(fmt.Sprintf("CRITICAL: Cache access attempted without tenant context for key: %s", key))
	}
	return fmt.Sprintf("tenant:%s:%s", tenantID.String(), key)
}

// patternWithTenant prefixes a pattern with the tenant ID from context.
// Used for InvalidatePattern operations.
func (c *TenantCache) patternWithTenant(ctx context.Context, pattern string) string {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok || tenantID == uuid.Nil {
		panic(fmt.Sprintf("CRITICAL: Cache pattern access attempted without tenant context for pattern: %s", pattern))
	}
	return fmt.Sprintf("tenant:%s:%s", tenantID.String(), pattern)
}

// Get retrieves a cached value with tenant isolation.
func (c *TenantCache) Get(ctx context.Context, key string, v interface{}) (*CacheEntry, error) {
	secureKey := c.keyWithTenant(ctx, key)
	return c.inner.Get(ctx, secureKey, v)
}

// Set stores a value in cache with tenant isolation.
func (c *TenantCache) Set(ctx context.Context, key string, v interface{}, etag string, ttl time.Duration) (string, error) {
	secureKey := c.keyWithTenant(ctx, key)
	return c.inner.Set(ctx, secureKey, v, etag, ttl)
}

// Delete removes a cached value with tenant isolation.
func (c *TenantCache) Delete(ctx context.Context, key string) error {
	secureKey := c.keyWithTenant(ctx, key)
	return c.inner.Delete(ctx, secureKey)
}

// InvalidatePattern removes all keys matching a pattern within the tenant's namespace.
// Example: InvalidatePattern(ctx, "courses:*") invalidates tenant:{id}:courses:*
func (c *TenantCache) InvalidatePattern(ctx context.Context, pattern string) error {
	securePattern := c.patternWithTenant(ctx, pattern)
	return c.inner.InvalidatePattern(ctx, securePattern)
}

// AcquireLock acquires a distributed lock with tenant isolation.
func (c *TenantCache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, error) {
	secureKey := c.keyWithTenant(ctx, key)
	return c.inner.AcquireLock(ctx, secureKey, ttl)
}

// ReleaseLock releases a distributed lock with tenant isolation.
func (c *TenantCache) ReleaseLock(ctx context.Context, key string, lockID string) error {
	secureKey := c.keyWithTenant(ctx, key)
	return c.inner.ReleaseLock(ctx, secureKey, lockID)
}

// TenantCacheKeys provides standardized cache key generators.
// These keys are designed to be used with TenantCache, which will
// automatically prefix them with tenant:{id}:.
//
// Usage:
//
//	key := TenantCacheKeys.AllCourses()  // Returns "courses:all"
//	cache.Get(ctx, key, &courses)        // Actually queries "tenant:{id}:courses:all"
var TenantCacheKeys = struct {
	Library         func() string
	Folders         func() string
	Course          func(id string) string
	FolderCourses   func(folderID string) string
	AllCourses      func() string
	CoursesByStatus func(status string) string
	CoursesByTag    func(tag string) string
}{
	Library:         func() string { return "library:index" },
	Folders:         func() string { return "folders:hierarchy" },
	Course:          func(id string) string { return "course:" + id },
	FolderCourses:   func(folderID string) string { return "folder:" + folderID + ":courses" },
	AllCourses:      func() string { return "courses:all" },
	CoursesByStatus: func(status string) string { return "courses:status:" + status },
	CoursesByTag:    func(tag string) string { return "courses:tag:" + tag },
}

// GlobalCache provides access to cache operations that are NOT tenant-scoped.
// Use this ONLY for system-level operations like user->tenant mapping.
//
// WARNING: Do NOT use GlobalCache for any tenant-specific data.
// All tenant data must go through TenantCache.
type GlobalCache struct {
	inner Cache
}

// NewGlobalCache creates a cache for non-tenant-scoped operations.
func NewGlobalCache(inner Cache) *GlobalCache {
	return &GlobalCache{inner: inner}
}

// Get retrieves a cached value (no tenant prefix).
func (c *GlobalCache) Get(ctx context.Context, key string, v interface{}) (*CacheEntry, error) {
	return c.inner.Get(ctx, key, v)
}

// Set stores a value in cache (no tenant prefix).
func (c *GlobalCache) Set(ctx context.Context, key string, v interface{}, etag string, ttl time.Duration) (string, error) {
	return c.inner.Set(ctx, key, v, etag, ttl)
}

// Delete removes a cached value (no tenant prefix).
func (c *GlobalCache) Delete(ctx context.Context, key string) error {
	return c.inner.Delete(ctx, key)
}

// InvalidatePattern removes all keys matching a pattern (no tenant prefix).
func (c *GlobalCache) InvalidatePattern(ctx context.Context, pattern string) error {
	return c.inner.InvalidatePattern(ctx, pattern)
}

// AcquireLock acquires a distributed lock (no tenant prefix).
func (c *GlobalCache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, error) {
	return c.inner.AcquireLock(ctx, key, ttl)
}

// ReleaseLock releases a distributed lock (no tenant prefix).
func (c *GlobalCache) ReleaseLock(ctx context.Context, key string, lockID string) error {
	return c.inner.ReleaseLock(ctx, key, lockID)
}

// GlobalCacheKeys provides standardized cache key generators for system-level data.
// These keys are NOT tenant-scoped and should only be used for cross-tenant mappings.
var GlobalCacheKeys = struct {
	UserTenantMapping func(kratosID string) string
}{
	UserTenantMapping: func(kratosID string) string { return "user:tenant:" + kratosID },
}
