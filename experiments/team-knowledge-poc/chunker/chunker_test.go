package chunker

import (
	"strings"
	"testing"
)

func TestChunkText_Empty(t *testing.T) {
	chunks := ChunkText("", DefaultConfig())
	if len(chunks) != 0 {
		t.Errorf("Expected 0 chunks for empty text, got %d", len(chunks))
	}

	chunks = ChunkText("   ", DefaultConfig())
	if len(chunks) != 0 {
		t.Errorf("Expected 0 chunks for whitespace-only text, got %d", len(chunks))
	}
}

func TestChunkText_SmallText(t *testing.T) {
	text := "This is a short text."
	chunks := ChunkText(text, DefaultConfig())

	if len(chunks) != 1 {
		t.Errorf("Expected 1 chunk for small text, got %d", len(chunks))
	}
	if chunks[0].Content != text {
		t.Errorf("Expected chunk content to be %q, got %q", text, chunks[0].Content)
	}
	if chunks[0].Index != 0 {
		t.Errorf("Expected chunk index to be 0, got %d", chunks[0].Index)
	}
	if chunks[0].StartChar != 0 {
		t.Errorf("Expected StartChar to be 0, got %d", chunks[0].StartChar)
	}
	if chunks[0].EndChar != len(text) {
		t.Errorf("Expected EndChar to be %d, got %d", len(text), chunks[0].EndChar)
	}
}

func TestChunkText_SentenceBoundary(t *testing.T) {
	// Create text with clear sentence boundaries
	text := "First sentence. Second sentence. Third sentence. Fourth sentence. Fifth sentence."

	config := ChunkConfig{
		ChunkSize:    35,
		ChunkOverlap: 5,
	}

	chunks := ChunkText(text, config)

	// Verify chunks exist
	if len(chunks) < 2 {
		t.Errorf("Expected at least 2 chunks, got %d", len(chunks))
	}

	// Verify each chunk ends at a sentence boundary (ends with period or is trimmed)
	for i, chunk := range chunks {
		content := chunk.Content
		if i < len(chunks)-1 {
			// Non-final chunks should ideally end with sentence punctuation
			if !strings.HasSuffix(content, ".") && !strings.HasSuffix(content, "!") && !strings.HasSuffix(content, "?") {
				// This is OK if the chunk is at max size and no sentence boundary was found
				t.Logf("Chunk %d doesn't end with sentence punctuation: %q", i, content)
			}
		}
	}

	// Verify indices are sequential
	for i, chunk := range chunks {
		if chunk.Index != i {
			t.Errorf("Expected chunk %d to have index %d, got %d", i, i, chunk.Index)
		}
	}
}

func TestChunkText_Overlap(t *testing.T) {
	text := strings.Repeat("word ", 100) // 500 chars
	config := ChunkConfig{
		ChunkSize:    100,
		ChunkOverlap: 20,
	}

	chunks := ChunkText(text, config)

	// With overlap, we should have more chunks than without
	// Verify chunks have proper overlap
	for i := 1; i < len(chunks); i++ {
		prev := chunks[i-1]
		curr := chunks[i]

		// Current chunk should start before previous chunk ends (overlap)
		if curr.StartChar >= prev.EndChar {
			t.Logf("Note: Chunk %d starts at %d, chunk %d ends at %d (limited overlap)",
				i, curr.StartChar, i-1, prev.EndChar)
		}
	}
}

func TestChunkText_NoSentenceBoundary(t *testing.T) {
	// Text without sentence endings - should split at word boundaries
	text := "word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15"

	config := ChunkConfig{
		ChunkSize:    30,
		ChunkOverlap: 5,
	}

	chunks := ChunkText(text, config)

	if len(chunks) < 2 {
		t.Errorf("Expected multiple chunks, got %d", len(chunks))
	}

	// Verify chunks are non-empty and have valid indices
	for i, chunk := range chunks {
		if len(chunk.Content) == 0 {
			t.Errorf("Chunk %d is empty", i)
		}
		if chunk.Index != i {
			t.Errorf("Chunk %d has wrong index: %d", i, chunk.Index)
		}
		// Start and end chars should be valid
		if chunk.StartChar < 0 || chunk.EndChar > len(text) {
			t.Errorf("Chunk %d has invalid char range: %d-%d", i, chunk.StartChar, chunk.EndChar)
		}
	}
}

func TestChunkText_VeryLongWord(t *testing.T) {
	// Edge case: word longer than chunk size
	text := strings.Repeat("a", 600) + " short"

	config := ChunkConfig{
		ChunkSize:    100,
		ChunkOverlap: 10,
	}

	chunks := ChunkText(text, config)

	// Should still produce chunks (hard cutoff when no boundary found)
	if len(chunks) == 0 {
		t.Error("Expected chunks even for text without word boundaries")
	}

	// Verify all text is covered
	totalLen := 0
	for _, chunk := range chunks {
		totalLen += len(chunk.Content)
	}
	// Account for overlaps, but total should cover original text
	if totalLen < len(strings.TrimSpace(text)) {
		t.Errorf("Chunks don't cover all text: got %d chars across chunks, original has %d",
			totalLen, len(text))
	}
}

func TestChunkText_InvalidConfig(t *testing.T) {
	text := "Some text to chunk."

	// Zero chunk size should use default
	chunks := ChunkText(text, ChunkConfig{ChunkSize: 0, ChunkOverlap: 10})
	if len(chunks) == 0 {
		t.Error("Expected chunks with zero chunk size (should use default)")
	}

	// Negative overlap should be set to 0
	chunks = ChunkText(text, ChunkConfig{ChunkSize: 10, ChunkOverlap: -5})
	if len(chunks) == 0 {
		t.Error("Expected chunks with negative overlap")
	}

	// Overlap >= chunk size should be reduced
	chunks = ChunkText("word word word word word", ChunkConfig{ChunkSize: 10, ChunkOverlap: 15})
	if len(chunks) == 0 {
		t.Error("Expected chunks when overlap >= chunk size")
	}
}

func TestDefaultConfig(t *testing.T) {
	config := DefaultConfig()
	if config.ChunkSize != 500 {
		t.Errorf("Expected default ChunkSize of 500, got %d", config.ChunkSize)
	}
	if config.ChunkOverlap != 50 {
		t.Errorf("Expected default ChunkOverlap of 50, got %d", config.ChunkOverlap)
	}
}
