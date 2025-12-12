package storage

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

// ErrPreconditionFailed indicates the object was modified since it was read.
var ErrPreconditionFailed = errors.New("precondition failed: object was modified")

// ErrMaxRetriesExceeded indicates too many concurrent modification retries.
var ErrMaxRetriesExceeded = errors.New("max retries exceeded for atomic update")

// ReadJSONResult contains the result of a ReadJSONWithETag operation.
type ReadJSONResult struct {
	ETag string
}

// StorageAdapter defines the interface for storage operations.
type StorageAdapter interface {
	// ReadJSON reads and unmarshals a JSON file.
	ReadJSON(ctx context.Context, path string, v interface{}) error

	// WriteJSON marshals and writes data as JSON.
	WriteJSON(ctx context.Context, path string, v interface{}) error

	// ListFiles lists all JSON files in a directory.
	ListFiles(ctx context.Context, directory string) ([]string, error)

	// Delete removes a file.
	Delete(ctx context.Context, path string) error

	// Exists checks if a file exists.
	Exists(ctx context.Context, path string) (bool, error)

	// GenerateUploadURL generates a presigned URL for uploads.
	GenerateUploadURL(ctx context.Context, path string, expiry time.Duration) (string, error)

	// GenerateDownloadURL generates a presigned URL for downloads.
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)

	// GetContent retrieves raw file content from storage.
	GetContent(ctx context.Context, path string) ([]byte, error)

	// PutContent stores raw content to storage.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
}

// TenantStorage provides tenant-aware storage operations.
type TenantStorage interface {
	// GenerateUploadURL generates a presigned URL for tenant-scoped uploads.
	GenerateUploadURL(ctx context.Context, tenantID uuid.UUID, subpath string, expiry time.Duration) (string, error)
}

// AtomicStorageAdapter extends StorageAdapter with conditional write operations
// for optimistic concurrency control using ETags.
type AtomicStorageAdapter interface {
	StorageAdapter

	// ReadJSONWithETag reads and unmarshals a JSON file, returning the ETag for conditional writes.
	ReadJSONWithETag(ctx context.Context, path string, v interface{}) (*ReadJSONResult, error)

	// WriteJSONWithETag marshals and writes data as JSON only if the ETag matches.
	// Returns ErrPreconditionFailed if the object was modified since it was read.
	WriteJSONWithETag(ctx context.Context, path string, v interface{}, etag string) error
}
