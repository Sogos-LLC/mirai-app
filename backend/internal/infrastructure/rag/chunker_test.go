package rag

import (
	"strings"
	"testing"
)

func TestChunkDocument_EmptyInput(t *testing.T) {
	chunks := ChunkDocument("", "text/plain", "test.txt")
	if len(chunks) != 0 {
		t.Fatalf("expected 0 chunks, got %d", len(chunks))
	}

	chunks = ChunkDocument("   \n  \t  ", "text/plain", "test.txt")
	if len(chunks) != 0 {
		t.Fatalf("expected 0 chunks for whitespace, got %d", len(chunks))
	}
}

func TestChunkDocument_SmallPlainText(t *testing.T) {
	text := "Hello world. This is a test document."
	chunks := ChunkDocument(text, "text/plain", "test.txt")

	if len(chunks) == 0 {
		t.Fatal("expected at least 1 chunk")
	}
	if chunks[0].Content != text {
		t.Fatalf("expected content %q, got %q", text, chunks[0].Content)
	}
	if chunks[0].ChunkIndex != 0 {
		t.Fatalf("expected chunk index 0, got %d", chunks[0].ChunkIndex)
	}
}

func TestChunkDocument_PlainTextParagraphs(t *testing.T) {
	text := "First paragraph here.\n\nSecond paragraph here.\n\nThird paragraph here."
	chunks := ChunkDocument(text, "text/plain", "test.txt")

	if len(chunks) != 3 {
		t.Fatalf("expected 3 chunks, got %d", len(chunks))
	}

	expected := []string{
		"First paragraph here.",
		"Second paragraph here.",
		"Third paragraph here.",
	}
	for i, exp := range expected {
		if chunks[i].Content != exp {
			t.Errorf("chunk %d: expected %q, got %q", i, exp, chunks[i].Content)
		}
		if chunks[i].SectionHeading != "Paragraph "+itoa(i+1) {
			t.Errorf("chunk %d: expected heading %q, got %q", i, "Paragraph "+itoa(i+1), chunks[i].SectionHeading)
		}
	}
}

func TestChunkDocument_MarkdownHeadings(t *testing.T) {
	text := `# Introduction

Welcome to the guide.

## Getting Started

Here is how to get started.

### Installation

Run the installer.

## Advanced

Advanced topics here.`

	chunks := ChunkDocument(text, "text/markdown", "guide.md")

	if len(chunks) < 4 {
		t.Fatalf("expected at least 4 chunks, got %d", len(chunks))
	}

	// Check breadcrumbs
	headings := make(map[string]bool)
	for _, c := range chunks {
		headings[c.SectionHeading] = true
	}

	expectedHeadings := []string{
		"Introduction",
		"Introduction > Getting Started",
		"Introduction > Getting Started > Installation",
		"Introduction > Advanced",
	}
	for _, h := range expectedHeadings {
		if !headings[h] {
			t.Errorf("expected heading %q not found in chunks", h)
		}
	}
}

func TestChunkDocument_MarkdownDetectionByFilename(t *testing.T) {
	text := "# Heading\n\nContent under heading."

	// Detected by mime type
	chunks := ChunkDocument(text, "text/markdown", "")
	if len(chunks) != 1 || chunks[0].SectionHeading != "Heading" {
		t.Errorf("markdown detection by mime type failed")
	}

	// Detected by filename
	chunks = ChunkDocument(text, "text/plain", "doc.md")
	if len(chunks) != 1 || chunks[0].SectionHeading != "Heading" {
		t.Errorf("markdown detection by filename failed")
	}

	// Not detected - plain text
	chunks = ChunkDocument(text, "text/plain", "doc.txt")
	if len(chunks) == 1 && chunks[0].SectionHeading == "Heading" {
		t.Errorf("plain text should not parse markdown headings")
	}
}

func TestChunkDocument_LargeSectionSplitting(t *testing.T) {
	// Create text larger than default chunk size (800 chars)
	sentence := "This is a test sentence that is reasonably long. "
	text := strings.Repeat(sentence, 30) // ~1500 chars

	chunks := ChunkDocumentWithOptions(text, "text/plain", "test.txt", 800, 50)

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks for large text, got %d", len(chunks))
	}

	// Verify all content is covered
	for _, c := range chunks {
		if len(c.Content) == 0 {
			t.Error("found empty chunk")
		}
		if len(c.Content) > 850 { // Allow some margin for sentence boundary
			t.Errorf("chunk too large: %d chars", len(c.Content))
		}
	}
}

func TestChunkDocument_MarkdownPreamble(t *testing.T) {
	text := `Some introductory text before any heading.

# First Heading

Content after heading.`

	chunks := ChunkDocument(text, "text/markdown", "doc.md")

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}

	if chunks[0].SectionHeading != "Introduction" {
		t.Errorf("expected preamble heading 'Introduction', got %q", chunks[0].SectionHeading)
	}
}

func TestChunkDocument_MarkdownNoHeadings(t *testing.T) {
	text := "Just some text without any headings at all."
	chunks := ChunkDocument(text, "text/markdown", "doc.md")

	if len(chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(chunks))
	}
	if chunks[0].SectionHeading != "Document" {
		t.Errorf("expected heading 'Document', got %q", chunks[0].SectionHeading)
	}
}

func TestSplitAtSentences_Basic(t *testing.T) {
	text := "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence."
	chunks := splitAtSentences(text, 40, 10)

	if len(chunks) < 2 {
		t.Fatalf("expected at least 2 chunks, got %d", len(chunks))
	}

	// Each chunk should end at a sentence boundary when possible
	for _, c := range chunks {
		if len(c) > 50 { // some margin
			t.Errorf("chunk too large: %q (%d chars)", c, len(c))
		}
	}
}

func TestChunkDocument_ConsecutiveIndices(t *testing.T) {
	text := "Para 1.\n\nPara 2.\n\nPara 3."
	chunks := ChunkDocument(text, "text/plain", "test.txt")

	for i, c := range chunks {
		if c.ChunkIndex != i {
			t.Errorf("expected chunk index %d, got %d", i, c.ChunkIndex)
		}
	}
}
