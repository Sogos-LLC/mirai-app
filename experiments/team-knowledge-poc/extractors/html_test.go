package extractors

import (
	"context"
	"strings"
	"testing"
)

func TestHTMLExtractor_Extract(t *testing.T) {
	extractor := NewHTMLExtractor()
	ctx := context.Background()

	tests := []struct {
		name           string
		content        string
		filename       string
		wantTitle      string
		wantSections   int
		wantContains   []string
		wantNotContain []string
	}{
		{
			name: "basic HTML with title and headings",
			content: `<!DOCTYPE html>
<html>
<head><title>Test Document</title></head>
<body>
<h1>Introduction</h1>
<p>This is the intro paragraph.</p>
<h2>Details</h2>
<p>This is more detail.</p>
</body>
</html>`,
			filename:     "test.html",
			wantTitle:    "Test Document",
			wantSections: 2,
			wantContains: []string{"intro paragraph", "more detail"},
		},
		{
			name: "HTML with script and style tags",
			content: `<!DOCTYPE html>
<html>
<head>
<title>Page Title</title>
<style>body { color: red; }</style>
</head>
<body>
<p>Visible content</p>
<script>console.log("should be ignored");</script>
</body>
</html>`,
			filename:       "script-test.html",
			wantTitle:      "Page Title",
			wantSections:   1,
			wantContains:   []string{"Visible content"},
			wantNotContain: []string{"color: red", "console.log", "should be ignored"},
		},
		{
			name: "HTML entities",
			content: `<!DOCTYPE html>
<html>
<head><title>Entities</title></head>
<body>
<p>Tom &amp; Jerry</p>
<p>5 &lt; 10 &gt; 3</p>
<p>&quot;quoted&quot; and &apos;apostrophe&apos;</p>
</body>
</html>`,
			filename:     "entities.html",
			wantTitle:    "Entities",
			wantSections: 1,
			wantContains: []string{"Tom & Jerry", "5 < 10 > 3"},
		},
		{
			name: "no title tag",
			content: `<!DOCTYPE html>
<html>
<body>
<h1>Main Heading</h1>
<p>Some content here.</p>
</body>
</html>`,
			filename:     "notitle.html",
			wantTitle:    "notitle",
			wantSections: 1,
			wantContains: []string{"Main Heading", "Some content"},
		},
		{
			name: "multiple heading levels",
			content: `<!DOCTYPE html>
<html>
<head><title>Multi-level</title></head>
<body>
<h1>Level 1</h1>
<p>First content.</p>
<h2>Level 2</h2>
<p>Second content.</p>
<h3>Level 3</h3>
<p>Third content.</p>
<h4>Level 4</h4>
<p>Fourth content (h4 not tracked as section boundary).</p>
</body>
</html>`,
			filename:     "levels.html",
			wantTitle:    "Multi-level",
			wantSections: 3, // h1, h2, h3 create sections
			wantContains: []string{"First content", "Second content", "Third content", "Fourth content"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, err := extractor.Extract(ctx, []byte(tt.content), tt.filename)
			if err != nil {
				t.Fatalf("Extract() error = %v", err)
			}

			if doc.Title != tt.wantTitle {
				t.Errorf("Title = %q, want %q", doc.Title, tt.wantTitle)
			}

			if len(doc.Sections) != tt.wantSections {
				t.Errorf("Sections count = %d, want %d", len(doc.Sections), tt.wantSections)
				for i, s := range doc.Sections {
					t.Logf("Section %d: title=%q, content=%q", i, s.Title, s.Content[:min(50, len(s.Content))])
				}
			}

			for _, want := range tt.wantContains {
				if !strings.Contains(doc.Text, want) {
					t.Errorf("Text should contain %q, got: %q", want, doc.Text)
				}
			}

			for _, notWant := range tt.wantNotContain {
				if strings.Contains(doc.Text, notWant) {
					t.Errorf("Text should NOT contain %q, but it does", notWant)
				}
			}
		})
	}
}

func TestHTMLExtractor_SupportedTypes(t *testing.T) {
	extractor := NewHTMLExtractor()
	types := extractor.SupportedTypes()

	if len(types) != 1 || types[0] != "text/html" {
		t.Errorf("SupportedTypes() = %v, want [text/html]", types)
	}
}

func TestHTMLExtractor_MalformedHTML(t *testing.T) {
	extractor := NewHTMLExtractor()
	ctx := context.Background()

	// Malformed HTML should be handled gracefully
	malformed := `<html><body><p>Unclosed paragraph<div>Nested wrong</p></div></body>`

	doc, err := extractor.Extract(ctx, []byte(malformed), "malformed.html")
	if err != nil {
		t.Fatalf("Extract() should not fail on malformed HTML: %v", err)
	}

	if !strings.Contains(doc.Text, "Unclosed paragraph") {
		t.Error("Should still extract text from malformed HTML")
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
