package storage

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

// LocalStorage implements StorageAdapter using the local filesystem.
type LocalStorage struct {
	basePath string
}

// NewLocalStorage creates a new local filesystem storage adapter.
func NewLocalStorage(basePath string) *LocalStorage {
	return &LocalStorage{basePath: basePath}
}

// ReadJSON reads and unmarshals a JSON file.
func (s *LocalStorage) ReadJSON(ctx context.Context, path string, v interface{}) error {
	fullPath := filepath.Join(s.basePath, path)
	data, err := os.ReadFile(fullPath)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, v)
}

// WriteJSON marshals and writes data as JSON.
func (s *LocalStorage) WriteJSON(ctx context.Context, path string, v interface{}) error {
	fullPath := filepath.Join(s.basePath, path)

	// Ensure parent directory exists
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(fullPath, data, 0644)
}

// ListFiles lists all JSON files in a directory.
func (s *LocalStorage) ListFiles(ctx context.Context, directory string) ([]string, error) {
	fullPath := filepath.Join(s.basePath, directory)

	entries, err := os.ReadDir(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	var files []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			files = append(files, entry.Name())
		}
	}

	return files, nil
}

// Delete removes a file.
func (s *LocalStorage) Delete(ctx context.Context, path string) error {
	fullPath := filepath.Join(s.basePath, path)
	return os.Remove(fullPath)
}

// Exists checks if a file exists.
func (s *LocalStorage) Exists(ctx context.Context, path string) (bool, error) {
	fullPath := filepath.Join(s.basePath, path)
	_, err := os.Stat(fullPath)
	if err == nil {
		return true, nil
	}
	if os.IsNotExist(err) {
		return false, nil
	}
	return false, err
}
