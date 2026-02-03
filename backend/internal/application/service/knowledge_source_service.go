package service

import (
	"context"
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/embedding"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
)

const (
	// VectorCollectionName is the Qdrant collection for knowledge chunks.
	VectorCollectionName = "knowledge_chunks"
	// VectorDimensions is the size of embeddings from all-MiniLM-L6-v2.
	VectorDimensions = 384
	// ChunkSize is the target size for text chunks.
	ChunkSize = 500
	// ChunkOverlap is the overlap between chunks.
	ChunkOverlap = 50
)

// Video URL patterns for detection.
var videoPatterns = []*regexp.Regexp{
	regexp.MustCompile(`https?://(?:www\.)?youtube\.com/watch\?v=[\w-]+`),
	regexp.MustCompile(`https?://youtu\.be/[\w-]+`),
	regexp.MustCompile(`https?://(?:www\.)?vimeo\.com/\d+`),
	regexp.MustCompile(`https?://(?:www\.)?notebooklm\.google\.com/[\w/-]+`),
}

// KnowledgeSourceService handles knowledge source operations.
type KnowledgeSourceService struct {
	repo            repository.KnowledgeSourceRepository
	embeddingClient *embedding.Client
	vectorClient    *vectordb.QdrantClient
}

// NewKnowledgeSourceService creates a new knowledge source service.
func NewKnowledgeSourceService(
	repo repository.KnowledgeSourceRepository,
	embeddingClient *embedding.Client,
	vectorClient *vectordb.QdrantClient,
) *KnowledgeSourceService {
	return &KnowledgeSourceService{
		repo:            repo,
		embeddingClient: embeddingClient,
		vectorClient:    vectorClient,
	}
}

// Create creates a new knowledge source.
func (s *KnowledgeSourceService) Create(ctx context.Context, source *entity.KnowledgeSource) error {
	source.Status = valueobject.KnowledgeSourceStatusPending
	return s.repo.Create(ctx, source)
}

// GetByID retrieves a knowledge source by ID.
func (s *KnowledgeSourceService) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	return s.repo.GetByID(ctx, id)
}

// ListByCourse retrieves all knowledge sources for a course.
func (s *KnowledgeSourceService) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	return s.repo.ListByCourse(ctx, courseID)
}

// CreateWithSession creates a knowledge source with session_id (pre-course wizard flow).
func (s *KnowledgeSourceService) CreateWithSession(ctx context.Context, source *entity.KnowledgeSource) error {
	source.Status = valueobject.KnowledgeSourceStatusPending
	return s.repo.CreateWithSession(ctx, source)
}

// ListBySession retrieves all knowledge sources for a session.
func (s *KnowledgeSourceService) ListBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error) {
	return s.repo.ListBySession(ctx, sessionID)
}

// LinkSessionToCourse links all sources from a session to a course.
func (s *KnowledgeSourceService) LinkSessionToCourse(ctx context.Context, sessionID string, courseID uuid.UUID) (int64, error) {
	return s.repo.LinkSessionToCourse(ctx, sessionID, courseID)
}

// Delete deletes a knowledge source and its vectors.
func (s *KnowledgeSourceService) Delete(ctx context.Context, id uuid.UUID) error {
	// Delete vectors first
	if s.vectorClient != nil {
		if err := s.vectorClient.DeleteBySourceID(ctx, VectorCollectionName, id); err != nil {
			// Log but don't fail - vectors may not exist
			fmt.Printf("Warning: failed to delete vectors for source %s: %v\n", id, err)
		}
	}
	return s.repo.Delete(ctx, id)
}

// SearchKnowledge performs semantic search across course knowledge.
func (s *KnowledgeSourceService) SearchKnowledge(
	ctx context.Context,
	courseID uuid.UUID,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	if s.embeddingClient == nil || s.vectorClient == nil {
		return nil, fmt.Errorf("embedding or vector client not configured")
	}

	// Generate query embedding
	queryVector, err := s.embeddingClient.EmbedSingle(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to embed query: %w", err)
	}

	// Build filter for course
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "course_id",
				"match": map[string]interface{}{"value": courseID.String()},
			},
		},
	}

	// Search vectors
	results, err := s.vectorClient.Search(ctx, VectorCollectionName, queryVector, topK, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to search vectors: %w", err)
	}

	// Convert to domain entities
	chunks := make([]*entity.RetrievedChunk, len(results))
	for i, r := range results {
		sourceID, _ := uuid.Parse(getStringPayload(r.Payload, "source_id"))
		chunkIndex := getIntPayload(r.Payload, "chunk_index")

		chunks[i] = &entity.RetrievedChunk{
			ID:              r.ID,
			SourceID:        sourceID,
			SourceName:      getStringPayload(r.Payload, "source_name"),
			Content:         getStringPayload(r.Payload, "content"),
			SimilarityScore: r.Score,
			ChunkIndex:      &chunkIndex,
		}
	}

	return chunks, nil
}

// SearchKnowledgeBySession performs semantic search across session knowledge.
func (s *KnowledgeSourceService) SearchKnowledgeBySession(
	ctx context.Context,
	sessionID string,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	if s.embeddingClient == nil || s.vectorClient == nil {
		return nil, fmt.Errorf("embedding or vector client not configured")
	}

	// Generate query embedding
	queryVector, err := s.embeddingClient.EmbedSingle(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to embed query: %w", err)
	}

	// Build filter for session
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "session_id",
				"match": map[string]interface{}{"value": sessionID},
			},
		},
	}

	// Search vectors
	results, err := s.vectorClient.Search(ctx, VectorCollectionName, queryVector, topK, filter)
	if err != nil {
		return nil, fmt.Errorf("failed to search vectors: %w", err)
	}

	// Convert to domain entities
	chunks := make([]*entity.RetrievedChunk, len(results))
	for i, r := range results {
		sourceID, _ := uuid.Parse(getStringPayload(r.Payload, "source_id"))
		chunkIndex := getIntPayload(r.Payload, "chunk_index")

		chunks[i] = &entity.RetrievedChunk{
			ID:              r.ID,
			SourceID:        sourceID,
			SourceName:      getStringPayload(r.Payload, "source_name"),
			Content:         getStringPayload(r.Payload, "content"),
			SimilarityScore: r.Score,
			ChunkIndex:      &chunkIndex,
		}
	}

	return chunks, nil
}

// ProcessAndIndex processes document content and stores vectors in the vector DB.
// Returns chunk count and token count for the processed document.
func (s *KnowledgeSourceService) ProcessAndIndex(
	ctx context.Context,
	source *entity.KnowledgeSource,
	content string,
) (chunkCount int32, tokenCount int32, err error) {
	if s.embeddingClient == nil || s.vectorClient == nil {
		return 0, 0, fmt.Errorf("embedding or vector client not configured")
	}

	// Ensure collection exists
	if err := s.vectorClient.EnsureCollection(ctx, VectorCollectionName, VectorDimensions); err != nil {
		return 0, 0, fmt.Errorf("failed to ensure collection: %w", err)
	}

	// Chunk the content
	chunks := ChunkText(content, ChunkSize, ChunkOverlap)
	if len(chunks) == 0 {
		return 0, 0, fmt.Errorf("no content to process")
	}

	// Calculate token count (rough estimate: ~4 chars per token)
	tokenCount = int32(len(content) / 4)

	// Generate embeddings for all chunks
	embeddings, err := s.embeddingClient.Embed(ctx, chunks)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to embed chunks: %w", err)
	}

	// Build points for vector DB
	points := make([]vectordb.Point, len(chunks))
	for i, chunk := range chunks {
		pointID := uuid.New().String()

		// Build payload with metadata
		payload := map[string]interface{}{
			"source_id":   source.ID.String(),
			"source_name": source.Name,
			"content":     chunk,
			"chunk_index": i,
			"tenant_id":   source.TenantID.String(),
		}

		// Add course_id or session_id based on what's available
		if source.CourseID != nil {
			payload["course_id"] = source.CourseID.String()
		}
		if source.SessionID != nil {
			payload["session_id"] = *source.SessionID
		}

		points[i] = vectordb.Point{
			ID:      pointID,
			Vector:  embeddings[i],
			Payload: payload,
		}
	}

	// Upsert vectors
	if err := s.vectorClient.Upsert(ctx, VectorCollectionName, points); err != nil {
		return 0, 0, fmt.Errorf("failed to upsert vectors: %w", err)
	}

	return int32(len(chunks)), tokenCount, nil
}

// UpdateStatusWithSummary updates the source status with summary and counts.
func (s *KnowledgeSourceService) UpdateStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	return s.repo.UpdateStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// DetectVideoURLs extracts video URLs from text content.
func DetectVideoURLs(content string) []string {
	seen := make(map[string]bool)
	var urls []string

	for _, pattern := range videoPatterns {
		matches := pattern.FindAllString(content, -1)
		for _, match := range matches {
			if !seen[match] {
				seen[match] = true
				urls = append(urls, match)
			}
		}
	}

	return urls
}

// ChunkText splits text into overlapping chunks.
func ChunkText(text string, chunkSize, overlap int) []string {
	text = strings.TrimSpace(text)
	if len(text) == 0 {
		return nil
	}

	if len(text) <= chunkSize {
		return []string{text}
	}

	var chunks []string
	start := 0

	for start < len(text) {
		end := start + chunkSize
		if end >= len(text) {
			// This is the last chunk - process it and exit
			end = len(text)
			chunk := strings.TrimSpace(text[start:end])
			if len(chunk) > 0 {
				chunks = append(chunks, chunk)
			}
			break
		}

		// Try to break at sentence boundary
		lastPeriod := strings.LastIndex(text[start:end], ". ")
		if lastPeriod > chunkSize/2 {
			end = start + lastPeriod + 1
		}

		chunk := strings.TrimSpace(text[start:end])
		if len(chunk) > 0 {
			chunks = append(chunks, chunk)
		}

		// Move start forward with overlap
		start = end - overlap
		if start < 0 {
			start = 0
		}
	}

	return chunks
}

func getStringPayload(payload map[string]interface{}, key string) string {
	if v, ok := payload[key].(string); ok {
		return v
	}
	return ""
}

func getIntPayload(payload map[string]interface{}, key string) int32 {
	if v, ok := payload[key].(float64); ok {
		return int32(v)
	}
	return 0
}
