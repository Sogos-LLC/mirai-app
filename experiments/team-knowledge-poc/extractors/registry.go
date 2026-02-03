package extractors

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"
)

// ExtractorRegistry manages document extractors by mime type
type ExtractorRegistry struct {
	extractors map[string]DocumentExtractor
	extensions map[string]string // extension -> mime type mapping
}

// NewRegistry creates a new extractor registry
func NewRegistry() *ExtractorRegistry {
	return &ExtractorRegistry{
		extractors: make(map[string]DocumentExtractor),
		extensions: map[string]string{
			".txt":   "text/plain",
			".md":    "text/markdown",
			".pdf":   "application/pdf",
			".xlsx":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			".xls":   "application/vnd.ms-excel",
			".docx":  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			".doc":   "application/msword",
			".pptx":  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			".ppt":   "application/vnd.ms-powerpoint",
			".html":  "text/html",
			".htm":   "text/html",
			".xhtml": "text/html",
			".epub":  "application/epub+zip",
		},
	}
}

// Register adds an extractor for the given mime types
func (r *ExtractorRegistry) Register(extractor DocumentExtractor) {
	for _, mimeType := range extractor.SupportedTypes() {
		r.extractors[mimeType] = extractor
	}
}

// Extract extracts content using the appropriate extractor based on mime type
func (r *ExtractorRegistry) Extract(ctx context.Context, content []byte, filename string, mimeType string) (*ExtractedDocument, error) {
	extractor, ok := r.extractors[mimeType]
	if !ok {
		return nil, fmt.Errorf("no extractor registered for mime type: %s", mimeType)
	}
	return extractor.Extract(ctx, content, filename)
}

// GetExtractorForFile returns the appropriate extractor based on filename extension
func (r *ExtractorRegistry) GetExtractorForFile(filename string) (DocumentExtractor, error) {
	ext := strings.ToLower(filepath.Ext(filename))
	mimeType, ok := r.extensions[ext]
	if !ok {
		return nil, fmt.Errorf("unknown file extension: %s", ext)
	}

	extractor, ok := r.extractors[mimeType]
	if !ok {
		return nil, fmt.Errorf("no extractor registered for extension %s (mime type: %s)", ext, mimeType)
	}

	return extractor, nil
}

// ExtractFile extracts content from a file, determining the type from the filename
func (r *ExtractorRegistry) ExtractFile(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
	extractor, err := r.GetExtractorForFile(filename)
	if err != nil {
		return nil, err
	}
	return extractor.Extract(ctx, content, filename)
}

// SupportedExtensions returns all supported file extensions
func (r *ExtractorRegistry) SupportedExtensions() []string {
	var exts []string
	for ext := range r.extensions {
		if _, ok := r.extractors[r.extensions[ext]]; ok {
			exts = append(exts, ext)
		}
	}
	return exts
}
