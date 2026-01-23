package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// KnowledgeSource represents a knowledge source for RAG-enhanced course generation.
type KnowledgeSource struct {
	ID       uuid.UUID
	TenantID uuid.UUID
	CourseID uuid.UUID

	Type   valueobject.KnowledgeSourceType
	Status valueobject.KnowledgeSourceStatus

	Name          string
	FilePath      *string
	MimeType      *string
	FileSizeBytes *int64

	ChunkCount   int32
	ErrorMessage *string

	// Detected video URLs in the content
	VideoURLs []string

	CreatedAt   time.Time
	UpdatedAt   time.Time
	ProcessedAt *time.Time
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
