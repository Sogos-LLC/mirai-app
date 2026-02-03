package extractors

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDOCXExtractor(t *testing.T) {
	extractor := NewDOCXExtractor()

	// Check supported types
	types := extractor.SupportedTypes()
	if len(types) != 1 || types[0] != "application/vnd.openxmlformats-officedocument.wordprocessingml.document" {
		t.Errorf("unexpected supported types: %v", types)
	}

	// Load test file
	testFile := filepath.Join("..", "test-files", "sample.docx")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("test file not found: %v (run create_office_test_files.go first)", err)
	}

	doc, err := extractor.Extract(context.Background(), content, "sample.docx")
	if err != nil {
		t.Fatalf("extraction failed: %v", err)
	}

	// Verify title was extracted from first heading
	if doc.Title != "Introduction to Document Extraction" {
		t.Errorf("unexpected title: %q", doc.Title)
	}

	// Verify sections were found
	if len(doc.Sections) < 3 {
		t.Errorf("expected at least 3 sections, got %d", len(doc.Sections))
	}

	// Verify text contains expected content
	if !strings.Contains(doc.Text, "Document Extraction") {
		t.Errorf("text missing expected content: %q", doc.Text)
	}

	// Verify section titles
	expectedTitles := []string{
		"Introduction to Document Extraction",
		"Key Features",
		"Conclusion",
	}
	for i, expected := range expectedTitles {
		if i < len(doc.Sections) && doc.Sections[i].Title != expected {
			t.Errorf("section %d: expected title %q, got %q", i, expected, doc.Sections[i].Title)
		}
	}
}

func TestPPTXExtractor(t *testing.T) {
	extractor := NewPPTXExtractor()

	// Check supported types
	types := extractor.SupportedTypes()
	if len(types) != 1 || types[0] != "application/vnd.openxmlformats-officedocument.presentationml.presentation" {
		t.Errorf("unexpected supported types: %v", types)
	}

	// Load test file
	testFile := filepath.Join("..", "test-files", "sample.pptx")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("test file not found: %v (run create_office_test_files.go first)", err)
	}

	doc, err := extractor.Extract(context.Background(), content, "sample.pptx")
	if err != nil {
		t.Fatalf("extraction failed: %v", err)
	}

	// Verify document title (first slide title)
	if doc.Title != "Team Knowledge Management" {
		t.Errorf("unexpected title: %q", doc.Title)
	}

	// Verify page count equals number of slides
	if doc.PageCount != 3 {
		t.Errorf("expected 3 slides, got %d", doc.PageCount)
	}

	// Verify sections match slides
	if len(doc.Sections) != 3 {
		t.Errorf("expected 3 sections, got %d", len(doc.Sections))
	}

	// Verify slide titles
	expectedTitles := []string{
		"Team Knowledge Management",
		"Why Extract Documents?",
		"Next Steps",
	}
	for i, expected := range expectedTitles {
		if i < len(doc.Sections) && doc.Sections[i].Title != expected {
			t.Errorf("slide %d: expected title %q, got %q", i, expected, doc.Sections[i].Title)
		}
	}

	// Verify text contains expected content
	if !strings.Contains(doc.Text, "RAG") {
		t.Errorf("text missing expected content 'RAG'")
	}
}

func TestXLSXExtractor(t *testing.T) {
	extractor := NewXLSXExtractor()

	// Check supported types
	types := extractor.SupportedTypes()
	if len(types) != 1 || types[0] != "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" {
		t.Errorf("unexpected supported types: %v", types)
	}

	// Load test file
	testFile := filepath.Join("..", "test-files", "sample.xlsx")
	content, err := os.ReadFile(testFile)
	if err != nil {
		t.Skipf("test file not found: %v (run create_office_test_files.go first)", err)
	}

	doc, err := extractor.Extract(context.Background(), content, "sample.xlsx")
	if err != nil {
		t.Fatalf("extraction failed: %v", err)
	}

	// Verify page count equals number of sheets
	if doc.PageCount != 3 {
		t.Errorf("expected 3 sheets, got %d", doc.PageCount)
	}

	// Verify sections match sheets
	if len(doc.Sections) != 3 {
		t.Errorf("expected 3 sections, got %d", len(doc.Sections))
	}

	// Verify sheet names as section titles
	expectedSheets := []string{
		"Project Data",
		"Team Members",
		"Metrics",
	}
	for i, expected := range expectedSheets {
		if i < len(doc.Sections) && doc.Sections[i].Title != expected {
			t.Errorf("sheet %d: expected title %q, got %q", i, expected, doc.Sections[i].Title)
		}
	}

	// Verify text contains expected content from different sheets
	if !strings.Contains(doc.Text, "Document Extraction") {
		t.Errorf("text missing expected content from Project Data sheet")
	}
	if !strings.Contains(doc.Text, "Alice Smith") {
		t.Errorf("text missing expected content from Team Members sheet")
	}
	if !strings.Contains(doc.Text, "Success Rate") {
		t.Errorf("text missing expected content from Metrics sheet")
	}
}

func TestDOCXExtractor_InvalidFile(t *testing.T) {
	extractor := NewDOCXExtractor()

	// Test with invalid content (not a ZIP file)
	_, err := extractor.Extract(context.Background(), []byte("not a valid docx file"), "invalid.docx")
	if err == nil {
		t.Error("expected error for invalid file, got nil")
	}
	if !strings.Contains(err.Error(), "corrupted or password-protected") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestPPTXExtractor_InvalidFile(t *testing.T) {
	extractor := NewPPTXExtractor()

	// Test with invalid content (not a ZIP file)
	_, err := extractor.Extract(context.Background(), []byte("not a valid pptx file"), "invalid.pptx")
	if err == nil {
		t.Error("expected error for invalid file, got nil")
	}
	if !strings.Contains(err.Error(), "corrupted or password-protected") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestXLSXExtractor_InvalidFile(t *testing.T) {
	extractor := NewXLSXExtractor()

	// Test with invalid content (not a ZIP file)
	_, err := extractor.Extract(context.Background(), []byte("not a valid xlsx file"), "invalid.xlsx")
	if err == nil {
		t.Error("expected error for invalid file, got nil")
	}
	if !strings.Contains(err.Error(), "corrupted or password-protected") {
		t.Errorf("unexpected error message: %v", err)
	}
}
