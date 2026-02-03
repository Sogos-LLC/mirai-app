package extractors

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
)

// PDFExtractor handles PDF document extraction
type PDFExtractor struct{}

// NewPDFExtractor creates a new PDF extractor
func NewPDFExtractor() *PDFExtractor {
	return &PDFExtractor{}
}

// SupportedTypes returns the mime types this extractor handles
func (e *PDFExtractor) SupportedTypes() []string {
	return []string{"application/pdf"}
}

// Extract extracts text content from PDF files
func (e *PDFExtractor) Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
	// Check context cancellation
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	// Create a reader from the byte content
	reader := bytes.NewReader(content)
	pdfReader, err := pdf.NewReader(reader, int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("failed to open PDF: %w", err)
	}

	pageCount := pdfReader.NumPage()
	if pageCount == 0 {
		return nil, errors.New("PDF contains no pages")
	}

	doc := &ExtractedDocument{
		PageCount: pageCount,
		Metadata:  make(map[string]string),
		Sections:  make([]DocumentSection, 0, pageCount),
	}

	// Extract text from each page
	var allText strings.Builder
	for pageNum := 1; pageNum <= pageCount; pageNum++ {
		// Check context cancellation between pages
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}

		page := pdfReader.Page(pageNum)
		if page.V.IsNull() {
			continue
		}

		pageText, err := page.GetPlainText(nil)
		if err != nil {
			// Log warning but continue - some pages may have issues
			pageText = fmt.Sprintf("[Error extracting page %d: %v]", pageNum, err)
		}

		pageText = strings.TrimSpace(pageText)

		// Add to sections (Index is 0-based, pageNum is 1-based)
		section := DocumentSection{
			Title:   fmt.Sprintf("Page %d", pageNum),
			Content: pageText,
			Index:   pageNum - 1,
		}
		doc.Sections = append(doc.Sections, section)

		// Accumulate all text
		if allText.Len() > 0 && pageText != "" {
			allText.WriteString("\n\n")
		}
		allText.WriteString(pageText)
	}

	doc.Text = allText.String()

	// Try to extract title from PDF metadata or first page content
	doc.Title = e.extractTitle(pdfReader, doc.Sections, filename)

	// Store PDF metadata
	e.extractMetadata(pdfReader, doc)

	return doc, nil
}

// extractTitle attempts to extract a meaningful title from the PDF
func (e *PDFExtractor) extractTitle(reader *pdf.Reader, sections []DocumentSection, filename string) string {
	// First, try to get title from PDF metadata
	// Note: The ledongthuc/pdf library has limited metadata support,
	// but we can try to access trailer info
	trailer := reader.Trailer()
	if !trailer.IsNull() {
		info := trailer.Key("Info")
		if !info.IsNull() {
			title := info.Key("Title")
			if !title.IsNull() {
				titleStr := title.Text()
				if titleStr != "" {
					return titleStr
				}
			}
		}
	}

	// Second, try to extract title from first page content
	// Look for the first non-empty line as potential title
	if len(sections) > 0 && sections[0].Content != "" {
		lines := strings.Split(sections[0].Content, "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			// Use first substantial line as title (at least 3 chars, max 100)
			if len(line) >= 3 && len(line) <= 100 {
				return line
			}
		}
	}

	// Fallback to filename without extension
	title := filename
	if idx := strings.LastIndex(title, "."); idx > 0 {
		title = title[:idx]
	}
	return title
}

// extractMetadata extracts available metadata from the PDF
func (e *PDFExtractor) extractMetadata(reader *pdf.Reader, doc *ExtractedDocument) {
	trailer := reader.Trailer()
	if trailer.IsNull() {
		return
	}

	info := trailer.Key("Info")
	if info.IsNull() {
		return
	}

	// Try to extract common metadata fields
	metadataKeys := []string{"Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate"}
	for _, key := range metadataKeys {
		value := info.Key(key)
		if !value.IsNull() {
			text := value.Text()
			if text != "" {
				doc.Metadata[key] = text
			}
		}
	}
}
