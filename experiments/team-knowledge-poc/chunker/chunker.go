package chunker

import (
	"strings"
	"unicode"
)

// ChunkConfig configures the chunking behavior
type ChunkConfig struct {
	ChunkSize    int // Target size in characters (default 500)
	ChunkOverlap int // Overlap between chunks (default 50)
}

// DefaultConfig returns sensible default chunking configuration
func DefaultConfig() ChunkConfig {
	return ChunkConfig{
		ChunkSize:    500,
		ChunkOverlap: 50,
	}
}

// Chunk represents a piece of text with position information
type Chunk struct {
	Content   string
	Index     int
	StartChar int
	EndChar   int
}

// ChunkText splits text into overlapping chunks, preferring sentence boundaries
func ChunkText(text string, config ChunkConfig) []Chunk {
	if config.ChunkSize <= 0 {
		config.ChunkSize = 500
	}
	if config.ChunkOverlap < 0 {
		config.ChunkOverlap = 0
	}
	if config.ChunkOverlap >= config.ChunkSize {
		config.ChunkOverlap = config.ChunkSize / 10
	}

	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return nil
	}

	// If text is smaller than chunk size, return single chunk
	if len(text) <= config.ChunkSize {
		return []Chunk{{
			Content:   text,
			Index:     0,
			StartChar: 0,
			EndChar:   len(text),
		}}
	}

	var chunks []Chunk
	pos := 0
	index := 0

	for pos < len(text) {
		// Determine the end position for this chunk
		end := pos + config.ChunkSize
		if end >= len(text) {
			// Last chunk - take everything remaining
			chunk := Chunk{
				Content:   strings.TrimSpace(text[pos:]),
				Index:     index,
				StartChar: pos,
				EndChar:   len(text),
			}
			if len(chunk.Content) > 0 {
				chunks = append(chunks, chunk)
			}
			break
		}

		// Try to find a sentence boundary (. followed by space or end)
		breakPoint := findSentenceBreak(text, pos, end)
		if breakPoint == -1 {
			// No sentence break found, try word boundary
			breakPoint = findWordBreak(text, pos, end)
		}
		if breakPoint == -1 {
			// No good break point, use hard cutoff
			breakPoint = end
		}

		chunk := Chunk{
			Content:   strings.TrimSpace(text[pos:breakPoint]),
			Index:     index,
			StartChar: pos,
			EndChar:   breakPoint,
		}

		if len(chunk.Content) > 0 {
			chunks = append(chunks, chunk)
			index++
		}

		// Move position forward, accounting for overlap
		pos = breakPoint - config.ChunkOverlap
		if pos <= chunk.StartChar {
			// Ensure we always make forward progress
			pos = breakPoint
		}
	}

	return chunks
}

// findSentenceBreak looks for a sentence ending (. ! ?) followed by whitespace
// within the range [start, end]. Returns position after the sentence end, or -1
func findSentenceBreak(text string, start, end int) int {
	// Search backwards from end to find a good sentence break
	// But don't go too far back (at least half the chunk should be used)
	minPos := start + (end-start)/2

	for i := end - 1; i >= minPos; i-- {
		if isSentenceEnd(text, i) {
			// Found sentence end, return position after the punctuation
			return i + 1
		}
	}
	return -1
}

// isSentenceEnd checks if position i is a sentence-ending punctuation followed by space/end
func isSentenceEnd(text string, i int) bool {
	c := rune(text[i])
	if c != '.' && c != '!' && c != '?' {
		return false
	}

	// Must be followed by space, newline, or end of text
	if i+1 >= len(text) {
		return true
	}
	next := rune(text[i+1])
	return unicode.IsSpace(next)
}

// findWordBreak finds a word boundary (whitespace) near the end position
func findWordBreak(text string, start, end int) int {
	// Search backwards from end
	minPos := start + (end-start)/2

	for i := end - 1; i >= minPos; i-- {
		if unicode.IsSpace(rune(text[i])) {
			// Return position after the space
			return i + 1
		}
	}
	return -1
}
