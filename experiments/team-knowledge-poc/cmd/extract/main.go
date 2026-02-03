package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"time"

	"github.com/sogos/mirai-experiments/team-knowledge-poc/extractors"
)

type Output struct {
	Title      string              `json:"title"`
	PageCount  int                 `json:"page_count"`
	Sections   int                 `json:"section_count"`
	Metadata   map[string]string   `json:"metadata,omitempty"`
	Text       string              `json:"text,omitempty"`
	SectionArr []SectionOutput     `json:"sections,omitempty"`
}

type SectionOutput struct {
	Index   int    `json:"index"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

func main() {
	showSections := flag.Bool("sections", false, "Show section breakdown")
	showMetadata := flag.Bool("metadata", false, "Show document metadata")
	jsonOutput := flag.Bool("json", false, "Output as JSON")
	flag.Parse()

	if flag.NArg() < 1 {
		fmt.Fprintf(os.Stderr, "Usage: %s [flags] <file>\n", os.Args[0])
		fmt.Fprintln(os.Stderr, "\nFlags:")
		flag.PrintDefaults()
		os.Exit(1)
	}

	filePath := flag.Arg(0)

	// Read file
	content, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading file: %v\n", err)
		os.Exit(1)
	}

	// Set up registry with all extractors
	registry := extractors.NewRegistry()
	registry.Register(extractors.NewTextExtractor())
	registry.Register(extractors.NewPDFExtractor())
	registry.Register(extractors.NewDOCXExtractor())
	registry.Register(extractors.NewPPTXExtractor())
	registry.Register(extractors.NewXLSXExtractor())
	registry.Register(extractors.NewHTMLExtractor())
	registry.Register(extractors.NewEPUBExtractor())

	// Extract with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	doc, err := registry.ExtractFile(ctx, content, filePath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error extracting content: %v\n", err)
		os.Exit(1)
	}

	if *jsonOutput {
		outputJSON(doc, *showSections, *showMetadata)
	} else {
		outputText(doc, *showSections, *showMetadata)
	}
}

func outputJSON(doc *extractors.ExtractedDocument, showSections, showMetadata bool) {
	output := Output{
		Title:     doc.Title,
		PageCount: doc.PageCount,
		Sections:  len(doc.Sections),
		Text:      doc.Text,
	}

	if showMetadata && len(doc.Metadata) > 0 {
		output.Metadata = doc.Metadata
	}

	if showSections {
		output.SectionArr = make([]SectionOutput, len(doc.Sections))
		for i, s := range doc.Sections {
			output.SectionArr[i] = SectionOutput{
				Index:   s.Index,
				Title:   s.Title,
				Content: s.Content,
			}
		}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(output); err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
}

func outputText(doc *extractors.ExtractedDocument, showSections, showMetadata bool) {
	fmt.Printf("Title: %s\n", doc.Title)
	fmt.Printf("Page Count: %d\n", doc.PageCount)
	fmt.Printf("Section Count: %d\n", len(doc.Sections))

	if showMetadata && len(doc.Metadata) > 0 {
		fmt.Println("\n--- Metadata ---")
		for k, v := range doc.Metadata {
			fmt.Printf("  %s: %s\n", k, v)
		}
	}

	if showSections {
		fmt.Println("\n--- Sections ---")
		for _, s := range doc.Sections {
			fmt.Printf("\n[%d] %s\n", s.Index, s.Title)
			fmt.Println("---")
			if len(s.Content) > 500 {
				fmt.Printf("%s...\n", s.Content[:500])
			} else {
				fmt.Println(s.Content)
			}
		}
	}

	fmt.Println("\n--- Full Text ---")
	fmt.Println(doc.Text)
}
