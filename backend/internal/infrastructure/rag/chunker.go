// Package rag provides document chunking and embedding for knowledge ingestion.
package rag

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	// DefaultMaxChunkSize is the maximum number of characters per chunk.
	DefaultMaxChunkSize = 800
	// DefaultOverlap is the number of characters to overlap between sub-chunks.
	DefaultOverlap = 50
)

// StructuredChunk is a chunk with section heading context from the original document.
type StructuredChunk struct {
	Content        string `json:"content"`
	SectionHeading string `json:"section_heading"`
	ChunkIndex     int    `json:"chunk_index"`
}

// parsedSection is a section of a document with heading context.
type parsedSection struct {
	heading string
	content string
	level   int
}

// documentParser defines the interface for document type parsers.
type documentParser interface {
	parse(text string) []parsedSection
}

// ChunkDocument splits a document into structured chunks with section headings.
// It uses document-type-aware parsing to preserve heading hierarchy,
// then splits large sections at sentence boundaries with overlap.
func ChunkDocument(text, mimeType, filename string) []StructuredChunk {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	parser := getParser(mimeType, filename)
	sections := parser.parse(text)

	if len(sections) == 0 {
		return []StructuredChunk{{
			Content:        text,
			SectionHeading: "Document",
			ChunkIndex:     0,
		}}
	}

	var chunks []StructuredChunk
	globalIndex := 0

	for _, section := range sections {
		content := strings.TrimSpace(section.content)
		if content == "" {
			continue
		}

		if len(content) <= DefaultMaxChunkSize {
			chunks = append(chunks, StructuredChunk{
				Content:        content,
				SectionHeading: section.heading,
				ChunkIndex:     globalIndex,
			})
			globalIndex++
		} else {
			subChunks := splitAtSentences(content, DefaultMaxChunkSize, DefaultOverlap)
			for _, sub := range subChunks {
				chunks = append(chunks, StructuredChunk{
					Content:        sub,
					SectionHeading: section.heading,
					ChunkIndex:     globalIndex,
				})
				globalIndex++
			}
		}
	}

	return chunks
}

// getParser selects the appropriate parser based on MIME type and filename.
func getParser(mimeType, filename string) documentParser {
	if mimeType == "text/markdown" || mimeType == "text/x-markdown" {
		return &markdownParser{}
	}

	lower := strings.ToLower(filename)
	if strings.HasSuffix(lower, ".md") || strings.HasSuffix(lower, ".markdown") {
		return &markdownParser{}
	}

	return &textParser{}
}

// --------------------------------------------------------------------------
// Markdown parser
// --------------------------------------------------------------------------

var headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)

type markdownParser struct{}

func (p *markdownParser) parse(text string) []parsedSection {
	matches := headingRe.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		content := strings.TrimSpace(text)
		if content == "" {
			return nil
		}
		return []parsedSection{{heading: "Document", content: content, level: 0}}
	}

	var sections []parsedSection
	type stackEntry struct {
		level int
		title string
	}
	var headingStack []stackEntry

	// Handle preamble (text before first heading)
	firstPos := matches[0][0]
	preamble := strings.TrimSpace(text[:firstPos])
	if preamble != "" {
		sections = append(sections, parsedSection{
			heading: "Introduction",
			content: preamble,
			level:   0,
		})
	}

	for i, match := range matches {
		// match[2]:match[3] is the # group, match[4]:match[5] is the title group
		hashes := text[match[2]:match[3]]
		level := len(hashes)
		title := strings.TrimSpace(text[match[4]:match[5]])

		// Update heading stack - pop everything at same or deeper level
		for len(headingStack) > 0 && headingStack[len(headingStack)-1].level >= level {
			headingStack = headingStack[:len(headingStack)-1]
		}
		headingStack = append(headingStack, stackEntry{level: level, title: title})

		// Build breadcrumb
		parts := make([]string, len(headingStack))
		for j, entry := range headingStack {
			parts[j] = entry.title
		}
		breadcrumb := strings.Join(parts, " > ")

		// Extract content between this heading and the next
		contentStart := match[1] // end of match
		var contentEnd int
		if i+1 < len(matches) {
			contentEnd = matches[i+1][0] // start of next match
		} else {
			contentEnd = len(text)
		}
		content := strings.TrimSpace(text[contentStart:contentEnd])

		if content != "" {
			sections = append(sections, parsedSection{
				heading: breadcrumb,
				content: content,
				level:   level,
			})
		}
	}

	return sections
}

// --------------------------------------------------------------------------
// Text parser
// --------------------------------------------------------------------------

var paragraphRe = regexp.MustCompile(`\n\s*\n`)

type textParser struct{}

func (p *textParser) parse(text string) []parsedSection {
	paragraphs := paragraphRe.Split(text, -1)

	var sections []parsedSection
	for i, para := range paragraphs {
		content := strings.TrimSpace(para)
		if content == "" {
			continue
		}
		sections = append(sections, parsedSection{
			heading: fmt.Sprintf("Paragraph %d", i+1),
			content: content,
			level:   0,
		})
	}

	return sections
}

// --------------------------------------------------------------------------
// Sentence-boundary splitting
// --------------------------------------------------------------------------

// splitAtSentences splits text at sentence boundaries with overlap.
func splitAtSentences(text string, maxSize, overlap int) []string {
	var chunks []string
	start := 0

	for start < len(text) {
		end := start + maxSize
		if end > len(text) {
			end = len(text)
		}

		// Try to break at a sentence boundary
		if end < len(text) {
			separators := []string{". ", ".\n", "! ", "!\n", "? ", "?\n", "\n\n"}
			for _, sep := range separators {
				lastSep := strings.LastIndex(text[start:end], sep)
				if lastSep > maxSize/2 {
					end = start + lastSep + len(sep)
					break
				}
			}
		}

		chunk := strings.TrimSpace(text[start:end])
		if chunk != "" {
			chunks = append(chunks, chunk)
		}

		// Move forward, applying overlap
		prevStart := start
		start = end - overlap
		// Prevent backward movement or stalling
		if start <= prevStart {
			start = end
		}
		if start >= len(text) {
			break
		}
	}

	return chunks
}
