package extractors

import (
	"bytes"
	"context"
	"path/filepath"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

// HTMLExtractor handles HTML files
type HTMLExtractor struct{}

// NewHTMLExtractor creates a new HTML extractor
func NewHTMLExtractor() *HTMLExtractor {
	return &HTMLExtractor{}
}

// SupportedTypes returns the mime types this extractor handles
func (e *HTMLExtractor) SupportedTypes() []string {
	return []string{"text/html"}
}

// Extract extracts text content from HTML files
func (e *HTMLExtractor) Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
	// Parse HTML, handling malformed content gracefully
	doc, err := html.Parse(bytes.NewReader(content))
	if err != nil {
		// If parsing fails, try to extract text by stripping tags
		text := e.stripTagsFallback(string(content))
		return &ExtractedDocument{
			Text:      text,
			Title:     strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename)),
			PageCount: 1,
			Metadata:  make(map[string]string),
			Sections: []DocumentSection{
				{
					Title:   "",
					Content: text,
					Index:   0,
				},
			},
		}, nil
	}

	// Extract title, headings, and text
	title := e.extractTitle(doc)
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	}

	sections := e.extractSections(doc)
	text := e.extractAllText(doc)

	return &ExtractedDocument{
		Text:      text,
		Title:     title,
		Sections:  sections,
		PageCount: 1,
		Metadata:  make(map[string]string),
	}, nil
}

// extractTitle finds the <title> tag content
func (e *HTMLExtractor) extractTitle(n *html.Node) string {
	if n.Type == html.ElementNode && n.Data == "title" {
		return e.getTextContent(n)
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if title := e.extractTitle(c); title != "" {
			return title
		}
	}
	return ""
}

// extractSections extracts sections based on h1, h2, h3 headings
func (e *HTMLExtractor) extractSections(doc *html.Node) []DocumentSection {
	var sections []DocumentSection
	var currentContent strings.Builder
	var currentTitle string
	sectionIndex := 0

	// Track if we've found any content before the first heading
	hasPreContent := false

	var traverse func(*html.Node)
	traverse = func(n *html.Node) {
		if n.Type == html.ElementNode {
			switch n.Data {
			case "h1", "h2", "h3":
				// Save previous section if it has content
				content := strings.TrimSpace(currentContent.String())
				if content != "" || (sectionIndex == 0 && hasPreContent) {
					sections = append(sections, DocumentSection{
						Title:   currentTitle,
						Content: content,
						Index:   sectionIndex,
					})
					sectionIndex++
				}
				currentContent.Reset()
				currentTitle = e.getTextContent(n)
				hasPreContent = false
				return // Don't traverse children, we already got the title
			case "script", "style", "noscript", "head":
				// Skip these elements
				return
			}
		}

		if n.Type == html.TextNode {
			text := normalizeWhitespace(n.Data)
			if text != "" {
				if currentTitle == "" && sectionIndex == 0 {
					hasPreContent = true
				}
				currentContent.WriteString(text)
				currentContent.WriteString(" ")
			}
		}

		for c := n.FirstChild; c != nil; c = c.NextSibling {
			traverse(c)
		}
	}

	traverse(doc)

	// Add final section
	content := strings.TrimSpace(currentContent.String())
	if content != "" {
		sections = append(sections, DocumentSection{
			Title:   currentTitle,
			Content: content,
			Index:   sectionIndex,
		})
	}

	// If no sections found, create one with all text
	if len(sections) == 0 {
		text := e.extractAllText(doc)
		if text != "" {
			sections = []DocumentSection{
				{
					Title:   "",
					Content: text,
					Index:   0,
				},
			}
		}
	}

	return sections
}

// extractAllText extracts all visible text content from the HTML
func (e *HTMLExtractor) extractAllText(doc *html.Node) string {
	var buf strings.Builder
	var traverse func(*html.Node)

	traverse = func(n *html.Node) {
		if n.Type == html.ElementNode {
			// Skip script, style, and other non-visible elements
			switch n.Data {
			case "script", "style", "noscript", "head":
				return
			}
		}

		if n.Type == html.TextNode {
			text := normalizeWhitespace(n.Data)
			if text != "" {
				buf.WriteString(text)
				buf.WriteString(" ")
			}
		}

		for c := n.FirstChild; c != nil; c = c.NextSibling {
			traverse(c)
		}
	}

	traverse(doc)
	return strings.TrimSpace(buf.String())
}

// getTextContent extracts text from a node and its children
func (e *HTMLExtractor) getTextContent(n *html.Node) string {
	var buf strings.Builder
	var traverse func(*html.Node)

	traverse = func(n *html.Node) {
		if n.Type == html.TextNode {
			buf.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			traverse(c)
		}
	}

	traverse(n)
	return strings.TrimSpace(buf.String())
}

// stripTagsFallback is a fallback for malformed HTML
func (e *HTMLExtractor) stripTagsFallback(content string) string {
	// Remove script and style blocks
	re := regexp.MustCompile(`(?i)<(script|style)[^>]*>[\s\S]*?</\1>`)
	content = re.ReplaceAllString(content, "")

	// Remove all tags
	re = regexp.MustCompile(`<[^>]*>`)
	content = re.ReplaceAllString(content, " ")

	// Decode common HTML entities
	content = decodeHTMLEntities(content)

	// Normalize whitespace
	return normalizeWhitespace(content)
}

// decodeHTMLEntities decodes common HTML entities
func decodeHTMLEntities(s string) string {
	entities := map[string]string{
		"&amp;":   "&",
		"&lt;":    "<",
		"&gt;":    ">",
		"&quot;":  "\"",
		"&apos;":  "'",
		"&#39;":   "'",
		"&nbsp;":  " ",
		"&mdash;": "—",
		"&ndash;": "–",
		"&copy;":  "©",
		"&reg;":   "®",
		"&trade;": "™",
		"&hellip;": "...",
	}

	for entity, char := range entities {
		s = strings.ReplaceAll(s, entity, char)
	}

	// Handle numeric entities like &#160;
	re := regexp.MustCompile(`&#(\d+);`)
	s = re.ReplaceAllStringFunc(s, func(match string) string {
		var num int
		if _, err := strings.NewReader(match[2:len(match)-1]).Read(nil); err == nil {
			// Parse the number
			for _, c := range match[2 : len(match)-1] {
				num = num*10 + int(c-'0')
			}
			if num > 0 && num < 128 {
				return string(rune(num))
			}
		}
		return match
	})

	return s
}

// normalizeWhitespace collapses whitespace and trims
func normalizeWhitespace(s string) string {
	// Replace all whitespace sequences with single space
	re := regexp.MustCompile(`\s+`)
	return strings.TrimSpace(re.ReplaceAllString(s, " "))
}
