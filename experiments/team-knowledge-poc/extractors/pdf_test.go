package extractors

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestPDFExtractor_SupportedTypes(t *testing.T) {
	extractor := NewPDFExtractor()
	types := extractor.SupportedTypes()

	if len(types) != 1 {
		t.Errorf("expected 1 supported type, got %d", len(types))
	}
	if types[0] != "application/pdf" {
		t.Errorf("expected application/pdf, got %s", types[0])
	}
}

func TestPDFExtractor_Extract(t *testing.T) {
	// Find the test file relative to the test
	testFile := filepath.Join("..", "test-files", "sample.pdf")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("test file not found at %s: %v", testFile, err)
	}

	extractor := NewPDFExtractor()
	doc, err := extractor.Extract(context.Background(), content, "sample.pdf")
	if err != nil {
		t.Fatalf("failed to extract PDF: %v", err)
	}

	// Verify basic extraction results
	if doc.PageCount == 0 {
		t.Error("expected at least one page")
	}
	t.Logf("Extracted %d pages", doc.PageCount)

	if doc.Text == "" {
		t.Error("expected non-empty text")
	}
	t.Logf("Text length: %d characters", len(doc.Text))
	t.Logf("First 200 chars: %s", truncate(doc.Text, 200))

	if len(doc.Sections) != doc.PageCount {
		t.Errorf("expected %d sections (one per page), got %d", doc.PageCount, len(doc.Sections))
	}

	// Verify sections have correct indices
	for i, section := range doc.Sections {
		if section.Index != i {
			t.Errorf("section %d has wrong index: %d", i, section.Index)
		}
		t.Logf("Section %d (%s): %d chars", i, section.Title, len(section.Content))
	}

	if doc.Title == "" {
		t.Error("expected non-empty title")
	}
	t.Logf("Title: %s", doc.Title)

	// Metadata should be initialized
	if doc.Metadata == nil {
		t.Error("expected metadata map to be initialized")
	}
	t.Logf("Metadata: %v", doc.Metadata)
}

func TestPDFExtractor_Extract_InvalidPDF(t *testing.T) {
	extractor := NewPDFExtractor()

	// Test with invalid content
	_, err := extractor.Extract(context.Background(), []byte("not a pdf"), "fake.pdf")
	if err == nil {
		t.Error("expected error for invalid PDF content")
	}
}

func TestPDFExtractor_Extract_EmptyContent(t *testing.T) {
	extractor := NewPDFExtractor()

	_, err := extractor.Extract(context.Background(), []byte{}, "empty.pdf")
	if err == nil {
		t.Error("expected error for empty content")
	}
}

func TestPDFExtractor_Extract_ContextCancellation(t *testing.T) {
	extractor := NewPDFExtractor()

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	_, err := extractor.Extract(ctx, []byte("test"), "test.pdf")
	if err == nil {
		t.Error("expected error for cancelled context")
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
