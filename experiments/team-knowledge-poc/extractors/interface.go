package extractors

import "context"

// DocumentExtractor extracts text content from various file formats
type DocumentExtractor interface {
	Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error)
	SupportedTypes() []string
}

// ExtractedDocument contains the extracted content and metadata
type ExtractedDocument struct {
	Text      string
	Title     string
	Sections  []DocumentSection
	PageCount int
	Metadata  map[string]string
}

// DocumentSection represents a structural unit (page, slide, chapter)
type DocumentSection struct {
	Title   string
	Content string
	Index   int
}
