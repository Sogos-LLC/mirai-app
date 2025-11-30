package cache

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// CacheEntry represents a cached value with metadata.
type CacheEntry struct {
	Data      json.RawMessage `json:"data"`
	ETag      string          `json:"etag"`
	Timestamp int64           `json:"timestamp"`
	Version   int             `json:"version"`
}

// Cache defines the interface for cache operations.
type Cache interface {
	Get(ctx context.Context, key string, v interface{}) (*CacheEntry, error)
	Set(ctx context.Context, key string, v interface{}, etag string, ttl time.Duration) (string, error)
	Delete(ctx context.Context, key string) error
	InvalidatePattern(ctx context.Context, pattern string) error
	AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, error)
	ReleaseLock(ctx context.Context, key string, lockID string) error
}

// RedisCache implements Cache using Redis.
type RedisCache struct {
	client     *redis.Client
	defaultTTL time.Duration
}

// RedisConfig holds Redis configuration.
type RedisConfig struct {
	URL        string
	DefaultTTL time.Duration
}

// NewRedisCache creates a new Redis cache.
func NewRedisCache(cfg RedisConfig) (*RedisCache, error) {
	opts, err := redis.ParseURL(cfg.URL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse redis URL: %w", err)
	}

	client := redis.NewClient(opts)

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	defaultTTL := cfg.DefaultTTL
	if defaultTTL == 0 {
		defaultTTL = 5 * time.Minute
	}

	return &RedisCache{
		client:     client,
		defaultTTL: defaultTTL,
	}, nil
}

// Get retrieves a cached value.
func (c *RedisCache) Get(ctx context.Context, key string, v interface{}) (*CacheEntry, error) {
	data, err := c.client.Get(ctx, key).Bytes()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return nil, nil // Cache miss
		}
		return nil, err
	}

	var entry CacheEntry
	if err := json.Unmarshal(data, &entry); err != nil {
		return nil, err
	}

	// Check if cache is stale (older than 24 hours)
	dayInMs := int64(24 * 60 * 60 * 1000)
	if time.Now().UnixMilli()-entry.Timestamp > dayInMs {
		_ = c.Delete(ctx, key)
		return nil, nil
	}

	// Unmarshal the actual data
	if err := json.Unmarshal(entry.Data, v); err != nil {
		return nil, err
	}

	return &entry, nil
}

// Set stores a value in cache with optimistic locking.
// Returns the new etag, or an error if the provided etag doesn't match.
func (c *RedisCache) Set(ctx context.Context, key string, v interface{}, etag string, ttl time.Duration) (string, error) {
	// Check current etag if provided
	if etag != "" {
		current, err := c.client.Get(ctx, key).Bytes()
		if err != nil && !errors.Is(err, redis.Nil) {
			return "", err
		}
		if current != nil {
			var currentEntry CacheEntry
			if err := json.Unmarshal(current, &currentEntry); err == nil {
				if currentEntry.ETag != etag {
					return currentEntry.ETag, fmt.Errorf("etag mismatch: expected %s, got %s", etag, currentEntry.ETag)
				}
			}
		}
	}

	// Marshal the data
	data, err := json.Marshal(v)
	if err != nil {
		return "", err
	}

	// Generate new etag
	newETag := generateETag(data)

	// Get next version
	version := 1
	if etag != "" {
		current, _ := c.client.Get(ctx, key).Bytes()
		if current != nil {
			var currentEntry CacheEntry
			if json.Unmarshal(current, &currentEntry) == nil {
				version = currentEntry.Version + 1
			}
		}
	}

	entry := CacheEntry{
		Data:      data,
		ETag:      newETag,
		Timestamp: time.Now().UnixMilli(),
		Version:   version,
	}

	entryData, err := json.Marshal(entry)
	if err != nil {
		return "", err
	}

	if ttl == 0 {
		ttl = c.defaultTTL
	}

	if err := c.client.Set(ctx, key, entryData, ttl).Err(); err != nil {
		return "", err
	}

	return newETag, nil
}

// Delete removes a cached value.
func (c *RedisCache) Delete(ctx context.Context, key string) error {
	return c.client.Del(ctx, key).Err()
}

// InvalidatePattern removes all keys matching a pattern.
func (c *RedisCache) InvalidatePattern(ctx context.Context, pattern string) error {
	iter := c.client.Scan(ctx, 0, pattern, 0).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return err
	}

	if len(keys) > 0 {
		return c.client.Del(ctx, keys...).Err()
	}
	return nil
}

// AcquireLock acquires a distributed lock.
// Returns the lock ID if successful, or an error if the lock is held.
func (c *RedisCache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, error) {
	lockID := fmt.Sprintf("%d-%s", time.Now().UnixNano(), randomString(9))
	lockKey := "lock:" + key

	ok, err := c.client.SetNX(ctx, lockKey, lockID, ttl).Result()
	if err != nil {
		return "", err
	}
	if !ok {
		return "", fmt.Errorf("lock already held")
	}

	return lockID, nil
}

// ReleaseLock releases a distributed lock.
func (c *RedisCache) ReleaseLock(ctx context.Context, key string, lockID string) error {
	lockKey := "lock:" + key

	// Lua script to ensure we only delete our own lock
	script := `
		if redis.call("get", KEYS[1]) == ARGV[1] then
			return redis.call("del", KEYS[1])
		else
			return 0
		end
	`

	result, err := c.client.Eval(ctx, script, []string{lockKey}, lockID).Int()
	if err != nil {
		return err
	}
	if result != 1 {
		return fmt.Errorf("lock not held by this process")
	}
	return nil
}

// Close closes the Redis connection.
func (c *RedisCache) Close() error {
	return c.client.Close()
}

// generateETag generates an ETag from data.
func generateETag(data []byte) string {
	h := fnv.New32a()
	h.Write(data)
	return fmt.Sprintf("W/\"%x-%x\"", h.Sum32(), time.Now().UnixMilli())
}

// randomString generates a random string of given length.
func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
	}
	return string(b)
}

// CacheKeys provides standardized cache key generators.
var CacheKeys = struct {
	Library        func() string
	Folders        func() string
	Course         func(id string) string
	FolderCourses  func(folderID string) string
	AllCourses     func() string
	CoursesByStatus func(status string) string
	CoursesByTag   func(tag string) string
}{
	Library:        func() string { return "library:index" },
	Folders:        func() string { return "folders:hierarchy" },
	Course:         func(id string) string { return "course:" + id },
	FolderCourses:  func(folderID string) string { return "folder:" + folderID + ":courses" },
	AllCourses:     func() string { return "courses:all" },
	CoursesByStatus: func(status string) string { return "courses:status:" + status },
	CoursesByTag:   func(tag string) string { return "courses:tag:" + tag },
}

// NoOpCache is a no-op implementation for when caching is disabled.
type NoOpCache struct{}

// NewNoOpCache creates a new no-op cache.
func NewNoOpCache() *NoOpCache {
	return &NoOpCache{}
}

func (c *NoOpCache) Get(ctx context.Context, key string, v interface{}) (*CacheEntry, error) {
	return nil, nil
}

func (c *NoOpCache) Set(ctx context.Context, key string, v interface{}, etag string, ttl time.Duration) (string, error) {
	return "", nil
}

func (c *NoOpCache) Delete(ctx context.Context, key string) error {
	return nil
}

func (c *NoOpCache) InvalidatePattern(ctx context.Context, pattern string) error {
	return nil
}

func (c *NoOpCache) AcquireLock(ctx context.Context, key string, ttl time.Duration) (string, error) {
	return "no-op", nil
}

func (c *NoOpCache) ReleaseLock(ctx context.Context, key string, lockID string) error {
	return nil
}

// Helper to convert int to string for version key lookups
func itoa(i int) string {
	return strconv.Itoa(i)
}
