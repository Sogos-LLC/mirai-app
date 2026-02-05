package service

import "context"

// ContentEnhancer abstracts AI content enhancement operations.
type ContentEnhancer interface {
	// SummarizeContent creates a concise summary of the provided content.
	SummarizeContent(ctx context.Context, content string) (string, error)

	// ImproveContent improves content by cleaning up, clarifying, and structuring.
	ImproveContent(ctx context.Context, content string) (string, error)
}

// FileStorage abstracts file storage operations for knowledge sources.
// This interface exposes only the file operations needed by domain services,
// keeping the domain layer decoupled from infrastructure storage details.
type FileStorage interface {
	// Delete removes a file from storage by its path.
	Delete(ctx context.Context, path string) error

	// Exists checks if a file exists at the given path.
	Exists(ctx context.Context, path string) (bool, error)

	// GetContent retrieves the raw content of a file.
	GetContent(ctx context.Context, path string) ([]byte, error)

	// PutContent stores content at the given path.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
}
