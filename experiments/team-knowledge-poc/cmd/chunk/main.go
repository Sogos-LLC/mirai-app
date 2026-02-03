package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/sogos/mirai-experiments/team-knowledge-poc/chunker"
)

type ChunkOutput struct {
	Index     int    `json:"index"`
	StartChar int    `json:"start_char"`
	EndChar   int    `json:"end_char"`
	Length    int    `json:"length"`
	Content   string `json:"content"`
}

func main() {
	chunkSize := flag.Int("size", 500, "Target chunk size in characters")
	chunkOverlap := flag.Int("overlap", 50, "Overlap between chunks in characters")
	jsonOutput := flag.Bool("json", false, "Output as JSON")
	inputFile := flag.String("file", "", "Input file (reads from stdin if not specified)")
	showStats := flag.Bool("stats", false, "Show chunking statistics")
	flag.Parse()

	var text string

	if *inputFile != "" {
		// Read from file
		content, err := os.ReadFile(*inputFile)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading file: %v\n", err)
			os.Exit(1)
		}
		text = string(content)
	} else {
		// Read from stdin
		reader := bufio.NewReader(os.Stdin)
		content, err := io.ReadAll(reader)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading stdin: %v\n", err)
			os.Exit(1)
		}
		text = string(content)
	}

	if len(text) == 0 {
		fmt.Fprintln(os.Stderr, "No input text provided")
		os.Exit(1)
	}

	config := chunker.ChunkConfig{
		ChunkSize:    *chunkSize,
		ChunkOverlap: *chunkOverlap,
	}

	chunks := chunker.ChunkText(text, config)

	if *jsonOutput {
		outputJSON(chunks, *showStats, text)
	} else {
		outputText(chunks, *showStats, text)
	}
}

func outputJSON(chunks []chunker.Chunk, showStats bool, originalText string) {
	output := struct {
		Stats  *StatsOutput   `json:"stats,omitempty"`
		Chunks []ChunkOutput  `json:"chunks"`
	}{
		Chunks: make([]ChunkOutput, len(chunks)),
	}

	if showStats {
		output.Stats = calcStats(chunks, originalText)
	}

	for i, c := range chunks {
		output.Chunks[i] = ChunkOutput{
			Index:     c.Index,
			StartChar: c.StartChar,
			EndChar:   c.EndChar,
			Length:    len(c.Content),
			Content:   c.Content,
		}
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(output); err != nil {
		fmt.Fprintf(os.Stderr, "Error encoding JSON: %v\n", err)
		os.Exit(1)
	}
}

type StatsOutput struct {
	OriginalLength int     `json:"original_length"`
	ChunkCount     int     `json:"chunk_count"`
	AvgChunkSize   float64 `json:"avg_chunk_size"`
	MinChunkSize   int     `json:"min_chunk_size"`
	MaxChunkSize   int     `json:"max_chunk_size"`
}

func calcStats(chunks []chunker.Chunk, originalText string) *StatsOutput {
	if len(chunks) == 0 {
		return &StatsOutput{
			OriginalLength: len(originalText),
		}
	}

	totalSize := 0
	minSize := len(chunks[0].Content)
	maxSize := len(chunks[0].Content)

	for _, c := range chunks {
		size := len(c.Content)
		totalSize += size
		if size < minSize {
			minSize = size
		}
		if size > maxSize {
			maxSize = size
		}
	}

	return &StatsOutput{
		OriginalLength: len(originalText),
		ChunkCount:     len(chunks),
		AvgChunkSize:   float64(totalSize) / float64(len(chunks)),
		MinChunkSize:   minSize,
		MaxChunkSize:   maxSize,
	}
}

func outputText(chunks []chunker.Chunk, showStats bool, originalText string) {
	if showStats {
		stats := calcStats(chunks, originalText)
		fmt.Println("=== Chunking Statistics ===")
		fmt.Printf("Original Length: %d chars\n", stats.OriginalLength)
		fmt.Printf("Chunk Count: %d\n", stats.ChunkCount)
		if stats.ChunkCount > 0 {
			fmt.Printf("Avg Chunk Size: %.1f chars\n", stats.AvgChunkSize)
			fmt.Printf("Min Chunk Size: %d chars\n", stats.MinChunkSize)
			fmt.Printf("Max Chunk Size: %d chars\n", stats.MaxChunkSize)
		}
		fmt.Println()
	}

	fmt.Printf("=== %d Chunks ===\n\n", len(chunks))

	for _, c := range chunks {
		fmt.Printf("--- Chunk %d [chars %d-%d, len=%d] ---\n",
			c.Index, c.StartChar, c.EndChar, len(c.Content))
		fmt.Println(c.Content)
		fmt.Println()
	}
}
