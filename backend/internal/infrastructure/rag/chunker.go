// Package rag provides document chunking and RAG infrastructure for knowledge ingestion.
package rag

import (
	"regexp"
	"strings"
)

const (
	DefaultMaxChunkSize = 800
	DefaultOverlap      = 50
)

// StructuredChunk represents a chunk with section heading context from the original document.
type StructuredChunk struct {
	Content        string
	SectionHeading string
	ChunkIndex     int
}

// ChunkDocument splits a document into structured chunks with section headings.
// It uses document-type-aware parsing to preserve heading hierarchy,
// then splits large sections at sentence boundaries with overlap.
func ChunkDocument(text, mimeType, filename string) []StructuredChunk {
	return ChunkDocumentWithOptions(text, mimeType, filename, DefaultMaxChunkSize, DefaultOverlap)
}

// ChunkDocumentWithOptions splits a document with custom chunk size and overlap.
func ChunkDocumentWithOptions(text, mimeType, filename string, maxChunkSize, overlap int) []StructuredChunk {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	var sections []parsedSection
	if isMarkdown(mimeType, filename) {
		sections = parseMarkdown(text)
	} else {
		sections = parseText(text)
	}

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

		if len(content) <= maxChunkSize {
			chunks = append(chunks, StructuredChunk{
				Content:        content,
				SectionHeading: section.heading,
				ChunkIndex:     globalIndex,
			})
			globalIndex++
		} else {
			subChunks := splitAtSentences(content, maxChunkSize, overlap)
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

// parsedSection is a section of a document with heading context.
type parsedSection struct {
	heading string
	content string
	level   int
}

// headingRe matches ATX-style headings: # H1, ## H2, ### H3, etc.
var headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+)$`)

// paragraphRe splits on two or more consecutive newlines.
var paragraphRe = regexp.MustCompile(`\n\s*\n`)

func isMarkdown(mimeType, filename string) bool {
	switch mimeType {
	case "text/markdown", "text/x-markdown":
		return true
	}
	lower := strings.ToLower(filename)
	return strings.HasSuffix(lower, ".md") || strings.HasSuffix(lower, ".markdown")
}

// parseMarkdown extracts heading hierarchy and section content from markdown.
func parseMarkdown(text string) []parsedSection {
	matches := headingRe.FindAllStringSubmatchIndex(text, -1)

	if len(matches) == 0 {
		content := strings.TrimSpace(text)
		if content == "" {
			return nil
		}
		return []parsedSection{{
			heading: "Document",
			content: content,
			level:   0,
		}}
	}

	var sections []parsedSection

	// Handle text before first heading
	firstPos := matches[0][0]
	preamble := strings.TrimSpace(text[:firstPos])
	if preamble != "" {
		sections = append(sections, parsedSection{
			heading: "Introduction",
			content: preamble,
			level:   0,
		})
	}

	type stackEntry struct {
		level int
		title string
	}
	var headingStack []stackEntry

	for i, match := range matches {
		// match indices: [full_start, full_end, group1_start, group1_end, group2_start, group2_end]
		hashes := text[match[2]:match[3]]
		level := len(hashes)
		title := strings.TrimSpace(text[match[4]:match[5]])

		// Update heading stack - pop everything at same or deeper level
		for len(headingStack) > 0 && headingStack[len(headingStack)-1].level >= level {
			headingStack = headingStack[:len(headingStack)-1]
		}
		headingStack = append(headingStack, stackEntry{level: level, title: title})

		// Build breadcrumb from stack
		parts := make([]string, len(headingStack))
		for j, entry := range headingStack {
			parts[j] = entry.title
		}
		breadcrumb := strings.Join(parts, " > ")

		// Extract content between this heading and the next
		contentStart := match[1] // end of full match
		var contentEnd int
		if i+1 < len(matches) {
			contentEnd = matches[i+1][0]
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

// parseText splits plain text into paragraph-based sections.
func parseText(text string) []parsedSection {
	paragraphs := paragraphRe.Split(text, -1)

	var sections []parsedSection
	paraNum := 0
	for _, para := range paragraphs {
		content := strings.TrimSpace(para)
		if content == "" {
			continue
		}
		paraNum++
		sections = append(sections, parsedSection{
			heading: "Paragraph " + itoa(paraNum),
			content: content,
			level:   0,
		})
	}
	return sections
}

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
			window := text[start:end]
			bestBreak := -1
			for _, sep := range []string{". ", ".\n", "! ", "!\n", "? ", "?\n", "\n\n"} {
				idx := strings.LastIndex(window, sep)
				if idx > maxSize/2 {
					candidate := idx + len(sep)
					if candidate > bestBreak {
						bestBreak = candidate
					}
				}
			}
			if bestBreak > 0 {
				end = start + bestBreak
			}
		}

		chunk := strings.TrimSpace(text[start:end])
		if chunk != "" {
			chunks = append(chunks, chunk)
		}

		// If we've reached the end, stop
		if end >= len(text) {
			break
		}

		// Move forward with overlap, ensuring progress
		next := end - overlap
		if next <= start {
			next = end
		}
		start = next
	}

	return chunks
}

// itoa converts a small int to string without importing strconv.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	pos := len(buf)
	for n > 0 {
		pos--
		buf[pos] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[pos:])
}
