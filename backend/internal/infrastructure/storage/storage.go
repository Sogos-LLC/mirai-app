package storage

import (
	"context"
)

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
}
