package extraction

import (
	"bufio"
	"context"
	"path/filepath"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// TextExtractor handles plain text and markdown files.
type TextExtractor struct{}

// NewTextExtractor creates a new text extractor.
func NewTextExtractor() *TextExtractor {
	return &TextExtractor{}
}

// SupportedTypes returns the MIME types this extractor handles.
func (e *TextExtractor) SupportedTypes() []string {
	return []string{"text/plain", "text/markdown"}
}

// Extract extracts text content from plain text or markdown files.
func (e *TextExtractor) Extract(ctx context.Context, content []byte, filename string) (*service.ExtractedDocument, error) {
	text := string(content)
	ext := strings.ToLower(filepath.Ext(filename))

	doc := &service.ExtractedDocument{
		Text:      text,
		Title:     strings.TrimSuffix(filepath.Base(filename), ext),
		PageCount: 1,
		Metadata:  make(map[string]string),
	}

	if ext == ".md" {
		doc.Sections = e.extractMarkdownSections(text)
		// Use first heading as title if available
		if len(doc.Sections) > 0 && doc.Sections[0].Title != "" {
			doc.Title = doc.Sections[0].Title
		}
	} else {
		// For plain text, treat the whole content as one section
		doc.Sections = []service.DocumentSection{
			{
				Title:   doc.Title,
				Content: text,
				Index:   0,
			},
		}
	}

	return doc, nil
}

// extractMarkdownSections parses markdown content and extracts sections based on headings.
func (e *TextExtractor) extractMarkdownSections(text string) []service.DocumentSection {
	var sections []service.DocumentSection
	var currentSection *service.DocumentSection
	var contentBuilder strings.Builder

	scanner := bufio.NewScanner(strings.NewReader(text))

	for scanner.Scan() {
		line := scanner.Text()

		// Check for markdown headings (# or ##)
		if strings.HasPrefix(line, "#") {
			// Save previous section if exists
			if currentSection != nil {
				currentSection.Content = strings.TrimSpace(contentBuilder.String())
				sections = append(sections, *currentSection)
				contentBuilder.Reset()
			}

			// Extract heading title (strip # characters)
			title := strings.TrimLeft(line, "#")
			title = strings.TrimSpace(title)

			currentSection = &service.DocumentSection{
				Title: title,
				Index: len(sections),
			}
		} else if currentSection != nil {
			contentBuilder.WriteString(line)
			contentBuilder.WriteString("\n")
		} else {
			// Content before first heading - create implicit section
			currentSection = &service.DocumentSection{
				Title: "",
				Index: 0,
			}
			contentBuilder.WriteString(line)
			contentBuilder.WriteString("\n")
		}
	}

	// Add final section
	if currentSection != nil {
		currentSection.Content = strings.TrimSpace(contentBuilder.String())
		sections = append(sections, *currentSection)
	}

	return sections
}

// Compile-time interface check
var _ service.DocumentExtractor = (*TextExtractor)(nil)
