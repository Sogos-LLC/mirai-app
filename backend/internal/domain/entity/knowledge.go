package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeSource represents a knowledge source for RAG-enhanced course generation.
type KnowledgeSource struct {
	ID        uuid.UUID
	TenantID  uuid.UUID
	CourseID  *uuid.UUID // Optional - nil for pre-course session sources
	SessionID *string    // For pre-course wizard flow

	Type   valueobject.KnowledgeSourceType
	Status valueobject.KnowledgeSourceStatus

	Name          string
	FilePath      *string
	MimeType      *string
	FileSizeBytes *int64

	ChunkCount   int32
	ErrorMessage *string

	// RAG verification
	Summary    *string // AI-generated summary proving RAG works
	TokenCount *int32  // Total token count of the document

	// Detected video URLs in the content
	VideoURLs []string

	// Document index for AI navigation (Internal Data Only mode)
	DocumentIndex *DocumentIndex

	CreatedAt   time.Time
	UpdatedAt   time.Time
	ProcessedAt *time.Time
}

// DocumentIndex provides a structured outline of document contents for AI navigation.
// Used during "Internal Data Only" mode to help AI understand what content is available.
type DocumentIndex struct {
	Title                string   // Document title (extracted or inferred)
	MainTopics           []string // Main sections/topics found in the document
	KeyConcepts          []string // Important terms and concepts
	EstimatedLessonCount int      // How many lessons this content could support
	ContentDepth         string   // "basic", "intermediate", "advanced"
}

// IsReady returns true if the source is ready for retrieval.
func (ks *KnowledgeSource) IsReady() bool {
	return ks.Status == valueobject.KnowledgeSourceStatusReady
}

// IsFailed returns true if the source failed to process.
func (ks *KnowledgeSource) IsFailed() bool {
	return ks.Status == valueobject.KnowledgeSourceStatusFailed
}

// RetrievedChunk represents a chunk retrieved from vector search.
type RetrievedChunk struct {
	ID              string
	SourceID        uuid.UUID
	SourceName      string
	Content         string
	SimilarityScore float32
	ChunkIndex      *int32
}
