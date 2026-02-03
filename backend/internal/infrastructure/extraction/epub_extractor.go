package extraction

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/sogos/mirai-backend/internal/domain/service"
	"golang.org/x/net/html"
)

// EPUBExtractor extracts text content from EPUB files.
type EPUBExtractor struct {
	htmlExtractor *HTMLExtractor
}

// NewEPUBExtractor creates a new EPUB extractor.
func NewEPUBExtractor() *EPUBExtractor {
	return &EPUBExtractor{
		htmlExtractor: NewHTMLExtractor(),
	}
}

// SupportedTypes returns the MIME types this extractor handles.
func (e *EPUBExtractor) SupportedTypes() []string {
	return []string{"application/epub+zip"}
}

// container.xml structure
type epubContainer struct {
	Rootfiles []epubRootfile `xml:"rootfiles>rootfile"`
}

type epubRootfile struct {
	FullPath  string `xml:"full-path,attr"`
	MediaType string `xml:"media-type,attr"`
}

// content.opf structure (Package)
type opfPackage struct {
	XMLName  xml.Name    `xml:"package"`
	Metadata opfMetadata `xml:"metadata"`
	Manifest opfManifest `xml:"manifest"`
	Spine    opfSpine    `xml:"spine"`
}

type opfMetadata struct {
	Title   string `xml:"title"`
	Creator string `xml:"creator"`
}

type opfManifest struct {
	Items []opfItem `xml:"item"`
}

type opfItem struct {
	ID        string `xml:"id,attr"`
	Href      string `xml:"href,attr"`
	MediaType string `xml:"media-type,attr"`
}

type opfSpine struct {
	ItemRefs []opfItemRef `xml:"itemref"`
}

type opfItemRef struct {
	IDRef string `xml:"idref,attr"`
}

// Extract extracts text content from EPUB files.
func (e *EPUBExtractor) Extract(ctx context.Context, content []byte, filename string) (*service.ExtractedDocument, error) {
	// Open the ZIP archive
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, fmt.Errorf("failed to open EPUB as ZIP: %w", err)
	}

	// Build a map of files for easy lookup
	files := make(map[string]*zip.File)
	for _, f := range reader.File {
		// Normalize path separators and remove leading slash
		normalizedPath := strings.TrimPrefix(filepath.ToSlash(f.Name), "/")
		files[normalizedPath] = f
	}

	// Find and parse container.xml
	containerFile, ok := files["META-INF/container.xml"]
	if !ok {
		return nil, fmt.Errorf("EPUB missing META-INF/container.xml")
	}

	containerContent, err := e.readFile(containerFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read container.xml: %w", err)
	}

	var cont epubContainer
	if err := xml.Unmarshal(containerContent, &cont); err != nil {
		return nil, fmt.Errorf("failed to parse container.xml: %w", err)
	}

	if len(cont.Rootfiles) == 0 {
		return nil, fmt.Errorf("no rootfiles found in container.xml")
	}

	// Get the OPF file path
	opfPath := cont.Rootfiles[0].FullPath
	opfFile, ok := files[opfPath]
	if !ok {
		// Try with leading slash removed
		opfPath = strings.TrimPrefix(opfPath, "/")
		opfFile, ok = files[opfPath]
		if !ok {
			return nil, fmt.Errorf("OPF file not found: %s", cont.Rootfiles[0].FullPath)
		}
	}

	opfContent, err := e.readFile(opfFile)
	if err != nil {
		return nil, fmt.Errorf("failed to read OPF file: %w", err)
	}

	var pkg opfPackage
	if err := xml.Unmarshal(opfContent, &pkg); err != nil {
		return nil, fmt.Errorf("failed to parse OPF file: %w", err)
	}

	// Build item map from manifest
	itemMap := make(map[string]opfItem)
	for _, item := range pkg.Manifest.Items {
		itemMap[item.ID] = item
	}

	// Get base directory of OPF file for relative paths
	opfDir := path.Dir(opfPath)

	// Extract chapters in spine order
	var sections []service.DocumentSection
	var allText strings.Builder
	sectionIndex := 0

	for _, itemRef := range pkg.Spine.ItemRefs {
		item, ok := itemMap[itemRef.IDRef]
		if !ok {
			continue
		}

		// Only process HTML/XHTML content
		if !isHTMLMediaType(item.MediaType) {
			continue
		}

		// Resolve the file path
		chapterPath := item.Href
		if opfDir != "" && opfDir != "." {
			chapterPath = path.Join(opfDir, item.Href)
		}

		chapterFile, ok := files[chapterPath]
		if !ok {
			// Try alternate paths
			chapterFile = e.findFile(files, item.Href, opfDir)
			if chapterFile == nil {
				continue
			}
		}

		chapterContent, err := e.readFile(chapterFile)
		if err != nil {
			continue
		}

		// Extract text and title from the chapter
		title, text := e.extractChapterContent(chapterContent)
		if title == "" {
			// Use filename without extension as fallback title
			title = strings.TrimSuffix(path.Base(item.Href), path.Ext(item.Href))
		}

		if text != "" {
			sections = append(sections, service.DocumentSection{
				Title:   title,
				Content: text,
				Index:   sectionIndex,
			})
			sectionIndex++

			if allText.Len() > 0 {
				allText.WriteString("\n\n")
			}
			allText.WriteString(text)
		}
	}

	// If spine extraction yielded nothing, try to extract from all HTML files
	if len(sections) == 0 {
		sections, allText = e.extractAllHTMLFiles(files)
	}

	// Determine title
	title := pkg.Metadata.Title
	if title == "" {
		title = strings.TrimSuffix(filepath.Base(filename), filepath.Ext(filename))
	}

	metadata := make(map[string]string)
	if pkg.Metadata.Creator != "" {
		metadata["author"] = pkg.Metadata.Creator
	}

	return &service.ExtractedDocument{
		Text:      allText.String(),
		Title:     title,
		Sections:  sections,
		PageCount: len(sections),
		Metadata:  metadata,
	}, nil
}

// readFile reads the entire content of a ZIP file.
func (e *EPUBExtractor) readFile(f *zip.File) ([]byte, error) {
	rc, err := f.Open()
	if err != nil {
		return nil, err
	}
	defer rc.Close()

	return io.ReadAll(rc)
}

// findFile attempts to find a file with various path combinations.
func (e *EPUBExtractor) findFile(files map[string]*zip.File, href string, opfDir string) *zip.File {
	// Try various path combinations
	paths := []string{
		href,
		path.Join(opfDir, href),
		strings.TrimPrefix(href, "/"),
		strings.TrimPrefix(path.Join(opfDir, href), "/"),
	}

	// Try each path
	for _, p := range paths {
		if f, ok := files[p]; ok {
			return f
		}
	}

	return nil
}

// extractChapterContent extracts the title and text from an HTML/XHTML chapter.
func (e *EPUBExtractor) extractChapterContent(content []byte) (title string, text string) {
	doc, err := html.Parse(bytes.NewReader(content))
	if err != nil {
		// Fallback: strip tags
		text = e.htmlExtractor.stripTagsFallback(string(content))
		return "", text
	}

	// Extract title from <title> tag or first heading
	title = e.htmlExtractor.extractTitle(doc)
	if title == "" {
		title = e.extractFirstHeading(doc)
	}

	// Extract text content
	text = e.htmlExtractor.extractAllText(doc)

	return title, text
}

// extractFirstHeading finds the first h1, h2, or h3 heading.
func (e *EPUBExtractor) extractFirstHeading(n *html.Node) string {
	if n.Type == html.ElementNode {
		switch n.Data {
		case "h1", "h2", "h3":
			return e.htmlExtractor.getTextContent(n)
		}
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if heading := e.extractFirstHeading(c); heading != "" {
			return heading
		}
	}
	return ""
}

// extractAllHTMLFiles extracts content from all HTML files when spine parsing fails.
func (e *EPUBExtractor) extractAllHTMLFiles(files map[string]*zip.File) ([]service.DocumentSection, strings.Builder) {
	var sections []service.DocumentSection
	var allText strings.Builder

	// Collect HTML files
	var htmlFiles []*zip.File
	for _, f := range files {
		ext := strings.ToLower(path.Ext(f.Name))
		if ext == ".html" || ext == ".xhtml" || ext == ".htm" {
			// Skip files in META-INF
			if strings.HasPrefix(f.Name, "META-INF") {
				continue
			}
			htmlFiles = append(htmlFiles, f)
		}
	}

	// Sort by filename
	sort.Slice(htmlFiles, func(i, j int) bool {
		return htmlFiles[i].Name < htmlFiles[j].Name
	})

	for i, f := range htmlFiles {
		content, err := e.readFile(f)
		if err != nil {
			continue
		}

		title, text := e.extractChapterContent(content)
		if title == "" {
			title = strings.TrimSuffix(path.Base(f.Name), path.Ext(f.Name))
		}

		if text != "" {
			sections = append(sections, service.DocumentSection{
				Title:   title,
				Content: text,
				Index:   i,
			})

			if allText.Len() > 0 {
				allText.WriteString("\n\n")
			}
			allText.WriteString(text)
		}
	}

	return sections, allText
}

// isHTMLMediaType checks if a media type is HTML/XHTML.
func isHTMLMediaType(mediaType string) bool {
	switch mediaType {
	case "application/xhtml+xml", "text/html", "application/xml":
		return true
	}
	return false
}

// Compile-time interface check.
var _ service.DocumentExtractor = (*EPUBExtractor)(nil)
