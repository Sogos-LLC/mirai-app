package service

import (
	"context"
	"regexp"
	"strings"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
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

// KnowledgeSourceService handles course-scoped knowledge source operations.
// It delegates to UnifiedKnowledgeService for all shared processing logic.
type KnowledgeSourceService struct {
	unified *UnifiedKnowledgeService
}

// NewKnowledgeSourceService creates a new knowledge source service backed by the
// unified knowledge service.
func NewKnowledgeSourceService(unified *UnifiedKnowledgeService) *KnowledgeSourceService {
	return &KnowledgeSourceService{
		unified: unified,
	}
}

// Create creates a new knowledge source.
func (s *KnowledgeSourceService) Create(ctx context.Context, source *entity.KnowledgeSource) error {
	return s.unified.CreateCourseSource(ctx, source)
}

// GetByID retrieves a knowledge source by ID.
func (s *KnowledgeSourceService) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	return s.unified.GetCourseSourceByID(ctx, id)
}

// ListByCourse retrieves all knowledge sources for a course.
func (s *KnowledgeSourceService) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	return s.unified.ListByCourse(ctx, courseID)
}

// CreateWithSession creates a knowledge source with session_id (pre-course wizard flow).
func (s *KnowledgeSourceService) CreateWithSession(ctx context.Context, source *entity.KnowledgeSource) error {
	return s.unified.CreateWithSession(ctx, source)
}

// ListBySession retrieves all knowledge sources for a session.
func (s *KnowledgeSourceService) ListBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error) {
	return s.unified.ListBySession(ctx, sessionID)
}

// LinkSessionToCourse links all sources from a session to a course.
func (s *KnowledgeSourceService) LinkSessionToCourse(ctx context.Context, sessionID string, courseID uuid.UUID) (int64, error) {
	return s.unified.LinkSessionToCourse(ctx, sessionID, courseID)
}

// Delete deletes a knowledge source and its vectors.
func (s *KnowledgeSourceService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.unified.DeleteCourseSource(ctx, id)
}

// SearchKnowledge performs semantic search across course knowledge.
func (s *KnowledgeSourceService) SearchKnowledge(
	ctx context.Context,
	courseID uuid.UUID,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	return s.unified.SearchKnowledge(ctx, courseID, query, topK)
}

// SearchKnowledgeBySession performs semantic search across session knowledge.
func (s *KnowledgeSourceService) SearchKnowledgeBySession(
	ctx context.Context,
	sessionID string,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	return s.unified.SearchKnowledgeBySession(ctx, sessionID, query, topK)
}

// SearchKnowledgeBySourceIDs performs semantic search across specific knowledge sources.
func (s *KnowledgeSourceService) SearchKnowledgeBySourceIDs(
	ctx context.Context,
	sourceIDs []string,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	return s.unified.SearchKnowledgeBySourceIDs(ctx, sourceIDs, query, topK)
}

// ProcessAndIndex processes document content and stores vectors in the vector DB.
func (s *KnowledgeSourceService) ProcessAndIndex(
	ctx context.Context,
	source *entity.KnowledgeSource,
	content string,
) (chunkCount int32, tokenCount int32, err error) {
	return s.unified.ProcessAndIndex(ctx, source, content)
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
	return s.unified.UpdateCourseStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// ---------------------------------------------------------------------------
// Shared utility functions (package-level, used by multiple services)
// ---------------------------------------------------------------------------

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
