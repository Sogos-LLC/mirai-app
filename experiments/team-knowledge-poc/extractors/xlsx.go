package extractors

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/xuri/excelize/v2"
)

// XLSXExtractor handles Microsoft Excel documents (.xlsx)
type XLSXExtractor struct{}

// NewXLSXExtractor creates a new XLSX extractor
func NewXLSXExtractor() *XLSXExtractor {
	return &XLSXExtractor{}
}

// SupportedTypes returns the mime types this extractor handles
func (e *XLSXExtractor) SupportedTypes() []string {
	return []string{"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
}

// Extract extracts text content from XLSX files
func (e *XLSXExtractor) Extract(ctx context.Context, content []byte, filename string) (*ExtractedDocument, error) {
	// Open the Excel file from bytes
	f, err := excelize.OpenReader(bytes.NewReader(content))
	if err != nil {
		return nil, fmt.Errorf("failed to open XLSX file (may be corrupted or password-protected): %w", err)
	}
	defer f.Close()

	// Get all sheet names
	sheetList := f.GetSheetList()
	if len(sheetList) == 0 {
		return nil, fmt.Errorf("invalid XLSX file: no sheets found")
	}

	sections := make([]DocumentSection, 0, len(sheetList))
	var fullTextBuilder strings.Builder

	for i, sheetName := range sheetList {
		sheetText, err := e.extractSheetContent(f, sheetName)
		if err != nil {
			// Log but continue with other sheets
			continue
		}

		sections = append(sections, DocumentSection{
			Title:   sheetName,
			Content: sheetText,
			Index:   i,
		})

		if sheetText != "" {
			fullTextBuilder.WriteString(fmt.Sprintf("=== %s ===\n", sheetName))
			fullTextBuilder.WriteString(sheetText)
			fullTextBuilder.WriteString("\n\n")
		}
	}

	ext := strings.ToLower(filepath.Ext(filename))
	title := strings.TrimSuffix(filepath.Base(filename), ext)

	return &ExtractedDocument{
		Text:      strings.TrimSpace(fullTextBuilder.String()),
		Title:     title,
		Sections:  sections,
		PageCount: len(sheetList),
		Metadata:  make(map[string]string),
	}, nil
}

// extractSheetContent extracts all text from a single sheet
func (e *XLSXExtractor) extractSheetContent(f *excelize.File, sheetName string) (string, error) {
	rows, err := f.GetRows(sheetName)
	if err != nil {
		return "", fmt.Errorf("failed to read sheet %s: %w", sheetName, err)
	}

	var textBuilder strings.Builder

	for _, row := range rows {
		// Join non-empty cells with tabs
		var nonEmptyCells []string
		for _, cell := range row {
			cell = strings.TrimSpace(cell)
			if cell != "" {
				nonEmptyCells = append(nonEmptyCells, cell)
			}
		}

		if len(nonEmptyCells) > 0 {
			textBuilder.WriteString(strings.Join(nonEmptyCells, "\t"))
			textBuilder.WriteString("\n")
		}
	}

	return strings.TrimSpace(textBuilder.String()), nil
}
