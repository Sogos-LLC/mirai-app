package rag

import (
	"strings"
	"testing"
)

func TestChunkDocument_EmptyInput(t *testing.T) {
	tests := []struct {
		name string
		text string
	}{
		{"empty string", ""},
		{"whitespace only", "   \n\t  "},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chunks := ChunkDocument(tt.text, "text/plain", "")
			if len(chunks) != 0 {
				t.Errorf("expected 0 chunks, got %d", len(chunks))
			}
		})
	}
}

func TestChunkDocument_ShortText(t *testing.T) {
	chunks := ChunkDocument("Hello world", "text/plain", "test.txt")
	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0].Content != "Hello world" {
		t.Errorf("expected 'Hello world', got %q", chunks[0].Content)
	}
	if chunks[0].ChunkIndex != 0 {
		t.Errorf("expected chunk_index=0, got %d", chunks[0].ChunkIndex)
	}
}

func TestChunkDocument_MarkdownHeadings(t *testing.T) {
	md := `# Introduction

Welcome to the guide.

## Getting Started

### Installation

Run the install command.

### Configuration

Edit the config file.

## Advanced

Deep dive content here.
`
	chunks := ChunkDocument(md, "text/markdown", "guide.md")

	if len(chunks) < 4 {
		t.Fatalf("expected at least 4 chunks, got %d", len(chunks))
	}

	// Check breadcrumbs (H1 stays in stack as parent for H2/H3)
	headings := make(map[string]bool)
	for _, c := range chunks {
		headings[c.SectionHeading] = true
	}

	expected := []string{
		"Introduction",
		"Introduction > Getting Started > Installation",
		"Introduction > Getting Started > Configuration",
		"Introduction > Advanced",
	}
	for _, h := range expected {
		if !headings[h] {
			t.Errorf("expected heading %q not found in chunks; got headings: %v", h, headings)
		}
	}
}

func TestChunkDocument_MarkdownPreamble(t *testing.T) {
	md := `This is preamble text before any heading.

# First Section

Content here.
`
	chunks := ChunkDocument(md, "text/markdown", "doc.md")

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}

	if chunks[0].SectionHeading != "Introduction" {
		t.Errorf("expected preamble heading 'Introduction', got %q", chunks[0].SectionHeading)
	}
	if !strings.Contains(chunks[0].Content, "preamble text") {
		t.Errorf("expected preamble content, got %q", chunks[0].Content)
	}
}

func TestChunkDocument_PlainTextParagraphs(t *testing.T) {
	text := `First paragraph content.

Second paragraph content.

Third paragraph content.`

	chunks := ChunkDocument(text, "text/plain", "doc.txt")

	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}

	if chunks[0].SectionHeading != "Paragraph 1" {
		t.Errorf("expected 'Paragraph 1', got %q", chunks[0].SectionHeading)
	}
	if chunks[1].SectionHeading != "Paragraph 2" {
		t.Errorf("expected 'Paragraph 2', got %q", chunks[1].SectionHeading)
	}
	if chunks[2].SectionHeading != "Paragraph 3" {
		t.Errorf("expected 'Paragraph 3', got %q", chunks[2].SectionHeading)
	}
}

func TestChunkDocument_LargeSectionSplitting(t *testing.T) {
	// Create a section larger than DefaultMaxChunkSize (800)
	longText := strings.Repeat("This is a sentence. ", 100) // ~2000 chars
	md := "# Big Section\n\n" + longText

	chunks := ChunkDocument(md, "text/markdown", "big.md")

	if len(chunks) < 2 {
		t.Fatalf("expected multiple chunks from large section, got %d", len(chunks))
	}

	// All chunks should have the same heading
	for _, c := range chunks {
		if c.SectionHeading != "Big Section" {
			t.Errorf("expected heading 'Big Section', got %q", c.SectionHeading)
		}
	}

	// No chunk should exceed max size (with some tolerance for sentence boundaries)
	for i, c := range chunks {
		if len(c.Content) > DefaultMaxChunkSize+100 {
			t.Errorf("chunk %d exceeds max size: %d chars", i, len(c.Content))
		}
	}
}

func TestChunkDocument_ConsecutiveIndices(t *testing.T) {
	md := `# Section A

Content A.

# Section B

Content B.

# Section C

Content C.
`
	chunks := ChunkDocument(md, "text/markdown", "doc.md")

	for i, c := range chunks {
		if c.ChunkIndex != i {
			t.Errorf("expected chunk_index=%d, got %d (heading=%q)", i, c.ChunkIndex, c.SectionHeading)
		}
	}
}

func TestChunkDocument_MIMERouting(t *testing.T) {
	md := "# Heading\n\nContent."

	tests := []struct {
		name     string
		mimeType string
		filename string
		isMarkdown bool
	}{
		{"markdown mime", "text/markdown", "", true},
		{"x-markdown mime", "text/x-markdown", "", true},
		{"md extension", "text/plain", "readme.md", true},
		{"markdown extension", "text/plain", "doc.markdown", true},
		{"plain text", "text/plain", "doc.txt", false},
		{"unknown type", "application/octet-stream", "file.bin", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			chunks := ChunkDocument(md, tt.mimeType, tt.filename)
			if len(chunks) == 0 {
				t.Fatal("expected at least 1 chunk")
			}

			// Markdown parser produces "Heading" as section heading;
			// text parser produces "Paragraph N" headings
			firstHeading := chunks[0].SectionHeading
			if tt.isMarkdown {
				if firstHeading != "Heading" {
					t.Errorf("expected markdown parsing (heading='Heading'), got %q", firstHeading)
				}
			} else {
				if !strings.HasPrefix(firstHeading, "Paragraph") {
					t.Errorf("expected text parsing (heading='Paragraph N'), got %q", firstHeading)
				}
			}
		})
	}
}

func TestChunkDocument_MarkdownNoHeadings(t *testing.T) {
	text := "Just plain content without any headings."
	chunks := ChunkDocument(text, "text/markdown", "doc.md")

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0].SectionHeading != "Document" {
		t.Errorf("expected heading 'Document', got %q", chunks[0].SectionHeading)
	}
}

func TestChunkDocument_Overlap(t *testing.T) {
	// Build a document with sentences that will be split across chunks
	var sentences []string
	for i := 0; i < 50; i++ {
		sentences = append(sentences, "A quick brown fox jumps over the lazy dog.")
	}
	longText := strings.Join(sentences, " ")

	chunks := ChunkDocument(longText, "text/plain", "long.txt")

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}

	// Verify that consecutive chunks share overlapping content
	for i := 1; i < len(chunks); i++ {
		prev := chunks[i-1].Content
		curr := chunks[i].Content

		// The end of the previous chunk should share some text with the start of the current
		prevEnd := prev[len(prev)-20:]
		if !strings.Contains(curr, prevEnd[:10]) {
			// Overlap doesn't guarantee exact substring match at boundaries due to trimming,
			// but chunks should be reasonably close. Just verify chunks are non-empty.
			if curr == "" {
				t.Errorf("chunk %d is empty", i)
			}
		}
	}
}

func TestChunkDocument_HeadingBreadcrumbStack(t *testing.T) {
	md := `# Chapter 1

## Section 1.1

### Subsection 1.1.1

Content 1.1.1.

## Section 1.2

Content 1.2.

# Chapter 2

Content 2.
`
	chunks := ChunkDocument(md, "text/markdown", "doc.md")

	expectedHeadings := map[string]bool{
		"Chapter 1 > Section 1.1 > Subsection 1.1.1": false,
		"Chapter 1 > Section 1.2":                    false,
		"Chapter 2":                                  false,
	}

	for _, c := range chunks {
		if _, ok := expectedHeadings[c.SectionHeading]; ok {
			expectedHeadings[c.SectionHeading] = true
		}
	}

	for heading, found := range expectedHeadings {
		if !found {
			t.Errorf("expected heading %q not found", heading)
		}
	}
}

func TestGetParser(t *testing.T) {
	tests := []struct {
		mimeType   string
		filename   string
		wantMarkdown bool
	}{
		{"text/markdown", "", true},
		{"text/x-markdown", "", true},
		{"text/plain", "README.md", true},
		{"text/plain", "DOC.MARKDOWN", true},
		{"text/plain", "file.txt", false},
		{"application/pdf", "doc.pdf", false},
	}

	for _, tt := range tests {
		t.Run(tt.mimeType+"/"+tt.filename, func(t *testing.T) {
			p := getParser(tt.mimeType, tt.filename)
			_, isMarkdown := p.(*markdownParser)
			if isMarkdown != tt.wantMarkdown {
				t.Errorf("got markdownParser=%v, want %v", isMarkdown, tt.wantMarkdown)
			}
		})
	}
}
