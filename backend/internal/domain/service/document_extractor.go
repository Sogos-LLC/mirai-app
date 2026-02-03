package service

import "context"

// DocumentExtractor extracts text content from various file formats.
// Implementations exist for PDF, DOCX, PPTX, XLSX, HTML, EPUB, and plain text.
type DocumentExtractor interface {
	// Extract returns the text content and metadata from a document.
	// The filename is used for format detection and title inference.
	Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error)

	// SupportedTypes returns the MIME types this extractor handles.
	SupportedTypes() []string
}

// ExtractedDocument contains the extracted content and metadata from a document.
type ExtractedDocument struct {
	// Text is the full extracted text content.
	Text string

	// Title is the document title (extracted from metadata or inferred).
	Title string

	// Sections are structural units (pages, slides, chapters, sheets).
	Sections []DocumentSection

	// PageCount is the number of pages/slides/sheets in the document.
	PageCount int

	// Metadata contains document metadata (author, created date, etc.).
	Metadata map[string]string
}

// DocumentSection represents a structural unit within a document.
// For PDFs this is a page, for PPTX a slide, for XLSX a sheet, etc.
type DocumentSection struct {
	// Title is the section title (e.g., "Page 1", "Slide 2", sheet name).
	Title string

	// Content is the text content of this section.
	Content string

	// Index is the 0-based section index.
	Index int
}

// ExtractorRegistry manages format-specific document extractors.
// It dispatches extraction requests to the appropriate extractor based on MIME type.
type ExtractorRegistry interface {
	// Register adds an extractor for its supported MIME types.
	Register(extractor DocumentExtractor)

	// Extract extracts content using the appropriate extractor for the MIME type.
	Extract(ctx context.Context, content []byte, filename string, mimeType string) (*ExtractedDocument, error)

	// ExtractFile extracts content, inferring MIME type from filename extension.
	ExtractFile(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error)

	// SupportedExtensions returns all registered file extensions.
	SupportedExtensions() []string
}
