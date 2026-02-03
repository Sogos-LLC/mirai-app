package extractors

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// PPTXExtractor handles Microsoft PowerPoint documents (.pptx)
type PPTXExtractor struct{}

// NewPPTXExtractor creates a new PPTX extractor
func NewPPTXExtractor() *PPTXExtractor {
	return &PPTXExtractor{}
}

// SupportedTypes returns the mime types this extractor handles
func (e *PPTXExtractor) SupportedTypes() []string {
	return []string{"application/vnd.openxmlformats-officedocument.presentationml.presentation"}
}

// pptxSlide represents a slide's XML structure
type pptxSlide struct {
	XMLName xml.Name    `xml:"sld"`
	CSld    pptxCSld    `xml:"cSld"`
}

// pptxCSld represents the common slide data
type pptxCSld struct {
	SpTree pptxSpTree `xml:"spTree"`
}

// pptxSpTree represents the shape tree
type pptxSpTree struct {
	Shapes []pptxShape `xml:"sp"`
}

// pptxShape represents a shape element
type pptxShape struct {
	NvSpPr pptxNvSpPr `xml:"nvSpPr"`
	TxBody pptxTxBody `xml:"txBody"`
}

// pptxNvSpPr represents non-visual shape properties
type pptxNvSpPr struct {
	NvPr pptxNvPr `xml:"nvPr"`
}

// pptxNvPr represents non-visual properties
type pptxNvPr struct {
	Ph pptxPh `xml:"ph"`
}

// pptxPh represents a placeholder
type pptxPh struct {
	Type string `xml:"type,attr"`
	Idx  string `xml:"idx,attr"`
}

// pptxTxBody represents a text body
type pptxTxBody struct {
	Paragraphs []pptxParagraph `xml:"p"`
}

// pptxParagraph represents a paragraph
type pptxParagraph struct {
	Runs []pptxRun `xml:"r"`
}

// pptxRun represents a text run
type pptxRun struct {
	Text string `xml:"t"`
}

// slideContent holds parsed slide data
type slideContent struct {
	slideNum int
	title    string
	text     string
}

// Extract extracts text content from PPTX files
func (e *PPTXExtractor) Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
	// PPTX is a ZIP archive
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("failed to open PPTX file (may be corrupted or password-protected): %w", err)
	}

	// Find all slide files (ppt/slides/slide*.xml)
	slidePattern := regexp.MustCompile(`^ppt/slides/slide(\d+)\.xml$`)
	var slides []slideContent

	for _, file := range reader.File {
		matches := slidePattern.FindStringSubmatch(file.Name)
		if matches == nil {
			continue
		}

		slideNum := 0
		fmt.Sscanf(matches[1], "%d", &slideNum)

		rc, err := file.Open()
		if err != nil {
			continue // Skip corrupted slides
		}

		buf := new(bytes.Buffer)
		_, err = buf.ReadFrom(rc)
		rc.Close()
		if err != nil {
			continue
		}

		slide, err := e.parseSlide(buf.Bytes())
		if err != nil {
			continue
		}

		title, text := e.extractSlideContent(slide)
		slides = append(slides, slideContent{
			slideNum: slideNum,
			title:    title,
			text:     text,
		})
	}

	if len(slides) == 0 {
		return nil, fmt.Errorf("invalid PPTX file: no slides found")
	}

	// Sort slides by number
	sort.Slice(slides, func(i, j int) bool {
		return slides[i].slideNum < slides[j].slideNum
	})

	// Build sections and full text
	sections := make([]DocumentSection, len(slides))
	var fullTextBuilder strings.Builder

	for i, slide := range slides {
		title := slide.title
		if title == "" {
			title = fmt.Sprintf("Slide %d", slide.slideNum)
		}

		sections[i] = DocumentSection{
			Title:   title,
			Content: slide.text,
			Index:   i,
		}

		if slide.title != "" {
			fullTextBuilder.WriteString(slide.title)
			fullTextBuilder.WriteString("\n")
		}
		if slide.text != "" {
			fullTextBuilder.WriteString(slide.text)
			fullTextBuilder.WriteString("\n\n")
		}
	}

	ext := strings.ToLower(filepath.Ext(filename))
	docTitle := strings.TrimSuffix(filepath.Base(filename), ext)

	// Use first slide title as document title if available
	if len(sections) > 0 && slides[0].title != "" {
		docTitle = slides[0].title
	}

	return &ExtractedDocument{
		Text:      strings.TrimSpace(fullTextBuilder.String()),
		Title:     docTitle,
		Sections:  sections,
		PageCount: len(slides),
		Metadata:  make(map[string]string),
	}, nil
}

// parseSlide parses a slide's XML content
func (e *PPTXExtractor) parseSlide(data []byte) (*pptxSlide, error) {
	// Remove namespace prefixes for easier parsing
	cleaned := e.stripNamespacePrefixes(data)

	var slide pptxSlide
	if err := xml.Unmarshal(cleaned, &slide); err != nil {
		return nil, err
	}
	return &slide, nil
}

// stripNamespacePrefixes removes XML namespace prefixes to simplify parsing
func (e *PPTXExtractor) stripNamespacePrefixes(data []byte) []byte {
	result := string(data)

	// Common PPTX namespace prefixes: p:, a:, r:
	prefixes := []string{"p:", "a:", "r:"}
	for _, prefix := range prefixes {
		re := regexp.MustCompile(`<(/?)` + regexp.QuoteMeta(prefix))
		result = re.ReplaceAllString(result, `<$1`)

		// Handle attributes
		re = regexp.MustCompile(` ` + regexp.QuoteMeta(prefix))
		result = re.ReplaceAllString(result, ` `)
	}

	return []byte(result)
}

// extractSlideContent extracts title and body text from a slide
func (e *PPTXExtractor) extractSlideContent(slide *pptxSlide) (title string, bodyText string) {
	var titleParts []string
	var bodyParts []string

	for _, shape := range slide.CSld.SpTree.Shapes {
		phType := strings.ToLower(shape.NvSpPr.NvPr.Ph.Type)

		// Extract text from all paragraphs in the shape
		var textParts []string
		for _, para := range shape.TxBody.Paragraphs {
			var paraText strings.Builder
			for _, run := range para.Runs {
				paraText.WriteString(run.Text)
			}
			if text := strings.TrimSpace(paraText.String()); text != "" {
				textParts = append(textParts, text)
			}
		}

		text := strings.Join(textParts, " ")
		if text == "" {
			continue
		}

		// Title and center title placeholders contain the slide title
		if phType == "title" || phType == "ctrtitle" {
			titleParts = append(titleParts, text)
		} else {
			// Everything else is body content
			bodyParts = append(bodyParts, text)
		}
	}

	return strings.Join(titleParts, " "), strings.Join(bodyParts, "\n")
}
