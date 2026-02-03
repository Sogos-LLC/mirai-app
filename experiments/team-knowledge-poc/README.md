# Team Knowledge POC - Document Extraction

Proof-of-concept for extracting text content from various document formats for the team knowledge base feature.

## Project Structure

```
team-knowledge-poc/
├── extractors/          # Document extraction implementations
│   ├── interface.go     # Core interfaces (DocumentExtractor, ExtractedDocument)
│   ├── registry.go      # ExtractorRegistry for format dispatch
│   ├── text.go          # Plain text and Markdown extractor
│   ├── pdf.go           # PDF extractor
│   ├── docx.go          # Word document extractor
│   ├── pptx.go          # PowerPoint extractor
│   ├── xlsx.go          # Excel spreadsheet extractor
│   ├── html.go          # HTML extractor
│   └── epub.go          # EPUB extractor
├── chunker/             # Text chunking for embedding
│   └── chunker.go       # Sentence-aware text chunking
├── cmd/
│   ├── extract/         # CLI tool for document extraction
│   └── chunk/           # CLI tool for text chunking
├── scripts/
│   └── test-all-formats.sh  # Automated test script
└── test-files/          # Sample documents for testing
```

## Supported Formats

| Format | Extension | MIME Type | Extractor | Notes |
|--------|-----------|-----------|-----------|-------|
| Plain Text | `.txt` | text/plain | TextExtractor | Single section |
| Markdown | `.md` | text/markdown | TextExtractor | Heading-based sections |
| PDF | `.pdf` | application/pdf | PDFExtractor | Page-based sections |
| Word | `.docx` | application/vnd.openxmlformats-officedocument.wordprocessingml.document | DocxExtractor | Paragraph extraction |
| PowerPoint | `.pptx` | application/vnd.openxmlformats-officedocument.presentationml.presentation | PptxExtractor | Slide-based sections |
| Excel | `.xlsx` | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | XlsxExtractor | Sheet-based sections |
| HTML | `.html`, `.htm`, `.xhtml` | text/html | HTMLExtractor | Text extraction with structure |
| EPUB | `.epub` | application/epub+zip | EPUBExtractor | Chapter-based sections |

## Setup

```bash
# Navigate to the POC directory
cd experiments/team-knowledge-poc

# Install dependencies
go mod download

# Build CLI tools
go build ./...

# Run tests
go test ./...
```

## CLI Tools

### Extract Tool

Extracts text content from documents.

```bash
# Basic usage - outputs title, counts, and full text
go run cmd/extract/main.go test-files/sample.pdf

# Show section breakdown
go run cmd/extract/main.go --sections test-files/sample.md

# Show document metadata
go run cmd/extract/main.go --metadata test-files/sample.pdf

# Output as JSON
go run cmd/extract/main.go --json test-files/sample.docx

# Combine flags
go run cmd/extract/main.go --json --sections --metadata test-files/sample.pdf
```

**Flags:**
- `--sections` - Show section breakdown (pages, slides, chapters)
- `--metadata` - Show document metadata (author, dates, etc.)
- `--json` - Output as JSON instead of plain text

### Chunk Tool

Splits text into overlapping chunks for embedding.

```bash
# Chunk from stdin (pipe from extract)
go run cmd/extract/main.go test-files/sample.md | go run cmd/chunk/main.go

# Chunk from file
go run cmd/chunk/main.go --file test-files/sample.txt

# Custom chunk size and overlap
go run cmd/chunk/main.go --size 300 --overlap 30 --file test-files/sample.txt

# Show chunking statistics
go run cmd/chunk/main.go --stats --file test-files/sample.md

# Output as JSON
go run cmd/chunk/main.go --json --file test-files/sample.txt
```

**Flags:**
- `--file` - Input file (reads from stdin if not specified)
- `--size` - Target chunk size in characters (default: 500)
- `--overlap` - Overlap between chunks in characters (default: 50)
- `--stats` - Show chunking statistics
- `--json` - Output as JSON

## Running Tests

```bash
# Run all Go tests
go test ./...

# Run with verbose output
go test -v ./...

# Run the full test suite (builds tools, tests all formats)
./scripts/test-all-formats.sh
```

## Adding New Extractors

1. Create a new file in `extractors/` (e.g., `rtf.go`)

2. Implement the `DocumentExtractor` interface:

```go
package extractors

import "context"

type RTFExtractor struct{}

func NewRTFExtractor() *RTFExtractor {
    return &RTFExtractor{}
}

func (e *RTFExtractor) SupportedTypes() []string {
    return []string{"text/rtf", "application/rtf"}
}

func (e *RTFExtractor) Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
    // Implementation here
    return &ExtractedDocument{
        Text:      extractedText,
        Title:     documentTitle,
        Sections:  sections,
        PageCount: 1,
        Metadata:  metadata,
    }, nil
}
```

3. Add the extension mapping in `registry.go`:

```go
extensions: map[string]string{
    // ... existing mappings
    ".rtf": "text/rtf",
}
```

4. Register the extractor in `cmd/extract/main.go`:

```go
registry.Register(extractors.NewRTFExtractor())
```

5. Add a test file to `test-files/` and update `scripts/test-all-formats.sh`

## Architecture

### ExtractedDocument

All extractors return an `ExtractedDocument`:

```go
type ExtractedDocument struct {
    Text      string              // Full extracted text
    Title     string              // Document title
    Sections  []DocumentSection   // Structural units (pages, slides, chapters)
    PageCount int                 // Number of pages/slides/sheets
    Metadata  map[string]string   // Document metadata
}

type DocumentSection struct {
    Title   string  // Section title (e.g., "Page 1", "Slide 2", "Chapter 1")
    Content string  // Section content
    Index   int     // 0-based section index
}
```

### ExtractorRegistry

The registry handles format dispatch:

```go
registry := extractors.NewRegistry()
registry.Register(extractors.NewTextExtractor())
registry.Register(extractors.NewPDFExtractor())
// ... register more extractors

// Extract by filename (uses extension mapping)
doc, err := registry.ExtractFile(ctx, content, "document.pdf")

// Extract by explicit MIME type
doc, err := registry.Extract(ctx, content, "document.pdf", "application/pdf")
```

### Chunker

The chunker splits text into overlapping chunks for embedding:

```go
config := chunker.ChunkConfig{
    ChunkSize:    500,  // Target chunk size
    ChunkOverlap: 50,   // Overlap between chunks
}

chunks := chunker.ChunkText(text, config)

for _, chunk := range chunks {
    fmt.Printf("Chunk %d: %s\n", chunk.Index, chunk.Content)
}
```

Chunking behavior:
- Prefers sentence boundaries (`.`, `!`, `?` followed by space)
- Falls back to word boundaries when no sentence break found
- Uses hard cutoff only when no word boundary found
- Ensures forward progress even with very long words

## Dependencies

- `github.com/ledongthuc/pdf` - PDF text extraction
- `github.com/xuri/excelize/v2` - Excel file reading
- `golang.org/x/net/html` - HTML parsing (used for HTML and EPUB)
