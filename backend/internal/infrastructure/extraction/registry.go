package extraction

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// Registry implements service.ExtractorRegistry, managing document extractors by MIME type.
type Registry struct {
	extractors map[string]service.DocumentExtractor
	extensions map[string]string // extension -> MIME type mapping
}

// NewRegistry creates a new extractor registry with all supported extension mappings.
func NewRegistry() *Registry {
	return &Registry{
		extractors: make(map[string]service.DocumentExtractor),
		extensions: map[string]string{
			// Plain text
			".txt": "text/plain",
			".md":  "text/markdown",

			// PDF
			".pdf": "application/pdf",

			// Microsoft Office (OpenXML)
			".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",

			// Legacy Microsoft Office
			".doc": "application/msword",
			".xls": "application/vnd.ms-excel",
			".ppt": "application/vnd.ms-powerpoint",

			// HTML
			".html":  "text/html",
			".htm":   "text/html",
			".xhtml": "text/html",

			// E-books
			".epub": "application/epub+zip",
		},
	}
}

// Register adds an extractor for its supported MIME types.
func (r *Registry) Register(extractor service.DocumentExtractor) {
	for _, mimeType := range extractor.SupportedTypes() {
		r.extractors[mimeType] = extractor
	}
}

// Extract extracts content using the appropriate extractor based on MIME type.
func (r *Registry) Extract(ctx context.Context, content []byte, filename string, mimeType string) (*service.ExtractedDocument, error) {
	extractor, ok := r.extractors[mimeType]
	if !ok {
		return nil, fmt.Errorf("no extractor registered for MIME type: %s", mimeType)
	}
	return extractor.Extract(ctx, content, filename)
}

// ExtractFile extracts content, inferring MIME type from filename extension.
func (r *Registry) ExtractFile(ctx context.Context, content []byte, filename string) (*service.ExtractedDocument, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeType, ok := r.extensions[ext]
	if !ok {
		return nil, fmt.Errorf("unknown file extension: %s", ext)
	}

	extractor, ok := r.extractors[mimeType]
	if !ok {
		return nil, fmt.Errorf("no extractor registered for extension %s (MIME type: %s)", ext, mimeType)
	}

	return extractor.Extract(ctx, content, filename)
}

// SupportedExtensions returns all registered file extensions that have active extractors.
func (r *Registry) SupportedExtensions() []string {
	var exts []string
	for ext, mimeType := range r.extensions {
		if _, ok := r.extractors[mimeType]; ok {
			exts = append(exts, ext)
		}
	}
	return exts
}

// Compile-time interface check
var _ service.ExtractorRegistry = (*Registry)(nil)
