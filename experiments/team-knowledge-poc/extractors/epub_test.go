package extractors

import (
	"archive/zip"
	"bytes"
	"context"
	"os"
	"strings"
	"testing"
)

func TestEPUBExtractor_Extract(t *testing.T) {
	extractor := NewEPUBExtractor()
	ctx := context.Background()

	// Read the sample EPUB file
	content, err := os.ReadFile("../test-files/sample.epub")
	if err != nil {
		t.Skipf("Skipping EPUB test: sample.epub not found: %v", err)
	}

	doc, err := extractor.Extract(ctx, content, "sample.epub")
	if err != nil {
		t.Fatalf("Extract() error = %v", err)
	}

	// Check title from metadata
	if doc.Title != "Sample EPUB Book" {
		t.Errorf("Title = %q, want %q", doc.Title, "Sample EPUB Book")
	}

	// Check author in metadata
	if doc.Metadata["author"] != "Test Author" {
		t.Errorf("Metadata[author] = %q, want %q", doc.Metadata["author"], "Test Author")
	}

	// Should have 2 chapters
	if len(doc.Sections) != 2 {
		t.Errorf("Sections count = %d, want 2", len(doc.Sections))
	}

	// Check section titles
	wantTitles := []string{"Chapter 1: Getting Started", "Chapter 2: Advanced Topics"}
	for i, want := range wantTitles {
		if i < len(doc.Sections) && doc.Sections[i].Title != want {
			t.Errorf("Section[%d].Title = %q, want %q", i, doc.Sections[i].Title, want)
		}
	}

	// Check content extraction
	wantContent := []string{
		"Welcome to this sample EPUB book",
		"EPUB files are simply ZIP archives",
		"advanced topics including styling",
		"Modern EPUB readers support CSS",
	}
	for _, want := range wantContent {
		if !strings.Contains(doc.Text, want) {
			t.Errorf("Text should contain %q", want)
		}
	}

	// PageCount should equal number of sections
	if doc.PageCount != len(doc.Sections) {
		t.Errorf("PageCount = %d, want %d (number of sections)", doc.PageCount, len(doc.Sections))
	}
}

func TestEPUBExtractor_SupportedTypes(t *testing.T) {
	extractor := NewEPUBExtractor()
	types := extractor.SupportedTypes()

	if len(types) != 1 || types[0] != "application/epub+zip" {
		t.Errorf("SupportedTypes() = %v, want [application/epub+zip]", types)
	}
}

func TestEPUBExtractor_InvalidZIP(t *testing.T) {
	extractor := NewEPUBExtractor()
	ctx := context.Background()

	// Not a valid ZIP file
	_, err := extractor.Extract(ctx, []byte("not a zip file"), "invalid.epub")
	if err == nil {
		t.Error("Extract() should fail for invalid ZIP")
	}
}

func TestEPUBExtractor_MissingContainer(t *testing.T) {
	extractor := NewEPUBExtractor()
	ctx := context.Background()

	// Create a valid ZIP but without container.xml
	invalidEPUB := createMinimalZIP(t, map[string]string{
		"mimetype": "application/epub+zip",
	})

	_, err := extractor.Extract(ctx, invalidEPUB, "missing-container.epub")
	if err == nil {
		t.Error("Extract() should fail when container.xml is missing")
	}
	if !strings.Contains(err.Error(), "container.xml") {
		t.Errorf("Error should mention container.xml: %v", err)
	}
}

// createMinimalZIP creates a minimal ZIP file for testing
func createMinimalZIP(t *testing.T, files map[string]string) []byte {
	t.Helper()

	// Use archive/zip to create a valid ZIP in memory
	var buf bytes.Buffer
	w := zip.NewWriter(&buf)

	for name, content := range files {
		f, err := w.Create(name)
		if err != nil {
			t.Fatalf("Failed to create file in ZIP: %v", err)
		}
		_, err = f.Write([]byte(content))
		if err != nil {
			t.Fatalf("Failed to write file in ZIP: %v", err)
		}
	}

	if err := w.Close(); err != nil {
		t.Fatalf("Failed to close ZIP: %v", err)
	}

	return buf.Bytes()
}
