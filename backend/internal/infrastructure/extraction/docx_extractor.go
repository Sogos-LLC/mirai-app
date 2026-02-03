package extraction

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// DOCXExtractor handles Microsoft Word documents (.docx).
type DOCXExtractor struct{}

// NewDOCXExtractor creates a new DOCX extractor.
func NewDOCXExtractor() *DOCXExtractor {
	return &DOCXExtractor{}
}

// SupportedTypes returns the MIME types this extractor handles.
func (e *DOCXExtractor) SupportedTypes() []string {
	return []string{"application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
}

// docxDocument represents the root document element.
type docxDocument struct {
	XMLName xml.Name `xml:"document"`
	Body    docxBody `xml:"body"`
}

// docxBody represents the document body.
type docxBody struct {
	Paragraphs []docxParagraph `xml:"p"`
}

// docxParagraph represents a paragraph element.
type docxParagraph struct {
	Properties docxParagraphProperties `xml:"pPr"`
	Runs       []docxRun               `xml:"r"`
}

// docxParagraphProperties represents paragraph properties.
type docxParagraphProperties struct {
	PStyle docxPStyle `xml:"pStyle"`
}

// docxPStyle represents a paragraph style reference.
type docxPStyle struct {
	Val string `xml:"val,attr"`
}

// docxRun represents a run of text.
type docxRun struct {
	Text []docxText `xml:"t"`
}

// docxText represents a text element.
type docxText struct {
	Content string `xml:",chardata"`
}

// Extract extracts text content from DOCX files.
func (e *DOCXExtractor) Extract(ctx context.Context, content []byte, filename string) (*service.ExtractedDocument, error) {
	// DOCX is a ZIP archive
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("failed to open DOCX file (may be corrupted or password-protected): %w", err)
	}

	// Find and read word/document.xml
	var documentXML []byte
	for _, file := range reader.File {
		if file.Name == "word/document.xml" {
			rc, err := file.Open()
			if err != nil {
				return nil, fmt.Errorf("failed to open document.xml: %w", err)
			}
			buf := new(bytes.Buffer)
			_, err = buf.ReadFrom(rc)
			rc.Close()
			if err != nil {
				return nil, fmt.Errorf("failed to read document.xml: %w", err)
			}
			documentXML = buf.Bytes()
			break
		}
	}

	if documentXML == nil {
		return nil, fmt.Errorf("invalid DOCX file: word/document.xml not found")
	}

	// Parse the XML
	doc, err := e.parseDocumentXML(documentXML)
	if err != nil {
		return nil, fmt.Errorf("failed to parse document.xml: %w", err)
	}

	// Build sections and extract text
	sections, fullText := e.buildSections(doc)

	ext := strings.ToLower(filepath.Ext(filename))
	title := strings.TrimSuffix(filepath.Base(filename), ext)

	// Use first heading as title if available
	if len(sections) > 0 && sections[0].Title != "" {
		title = sections[0].Title
	}

	return &service.ExtractedDocument{
		Text:      fullText,
		Title:     title,
		Sections:  sections,
		PageCount: 1, // DOCX doesn't store page count in XML; would need rendering
		Metadata:  make(map[string]string),
	}, nil
}

// parseDocumentXML parses the word/document.xml content.
func (e *DOCXExtractor) parseDocumentXML(data []byte) (*docxDocument, error) {
	// Remove namespace prefixes for easier parsing
	// The actual XML has w: prefixes on all elements
	cleaned := e.stripNamespacePrefixes(data)

	var doc docxDocument
	if err := xml.Unmarshal(cleaned, &doc); err != nil {
		return nil, err
	}
	return &doc, nil
}

// stripNamespacePrefixes removes XML namespace prefixes to simplify parsing.
func (e *DOCXExtractor) stripNamespacePrefixes(data []byte) []byte {
	// Replace common Word namespace prefixes
	result := string(data)

	// Replace w: prefix on elements and attributes
	re := regexp.MustCompile(`<(/?)w:`)
	result = re.ReplaceAllString(result, `<$1`)

	// Handle attributes with w: prefix
	re = regexp.MustCompile(` w:`)
	result = re.ReplaceAllString(result, ` `)

	return []byte(result)
}

// buildSections extracts sections based on heading styles.
func (e *DOCXExtractor) buildSections(doc *docxDocument) ([]service.DocumentSection, string) {
	var sections []service.DocumentSection
	var fullTextBuilder strings.Builder
	var currentSection *service.DocumentSection
	var contentBuilder strings.Builder

	headingPattern := regexp.MustCompile(`(?i)^heading(\d+)$|^title$|^subtitle$`)

	for _, para := range doc.Body.Paragraphs {
		// Extract text from all runs in the paragraph
		var paraText strings.Builder
		for _, run := range para.Runs {
			for _, t := range run.Text {
				paraText.WriteString(t.Content)
			}
		}
		text := paraText.String()

		if text == "" {
			continue
		}

		// Check if this is a heading
		style := para.Properties.PStyle.Val
		isHeading := headingPattern.MatchString(style)

		if isHeading {
			// Save previous section if exists
			if currentSection != nil {
				currentSection.Content = strings.TrimSpace(contentBuilder.String())
				sections = append(sections, *currentSection)
				contentBuilder.Reset()
			}

			currentSection = &service.DocumentSection{
				Title: text,
				Index: len(sections),
			}
		} else if currentSection != nil {
			contentBuilder.WriteString(text)
			contentBuilder.WriteString("\n")
		} else {
			// Content before first heading - create implicit section
			currentSection = &service.DocumentSection{
				Title: "",
				Index: 0,
			}
			contentBuilder.WriteString(text)
			contentBuilder.WriteString("\n")
		}

		fullTextBuilder.WriteString(text)
		fullTextBuilder.WriteString("\n")
	}

	// Add final section
	if currentSection != nil {
		currentSection.Content = strings.TrimSpace(contentBuilder.String())
		sections = append(sections, *currentSection)
	}

	// If no sections were created, create one with all content
	if len(sections) == 0 {
		sections = []service.DocumentSection{
			{
				Title:   "",
				Content: strings.TrimSpace(fullTextBuilder.String()),
				Index:   0,
			},
		}
	}

	return sections, strings.TrimSpace(fullTextBuilder.String())
}

// Compile-time interface check.
var _ service.DocumentExtractor = (*DOCXExtractor)(nil)
