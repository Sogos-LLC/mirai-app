package service

import (
	"context"
	"regexp"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

const (
	// VectorCollectionName is the Qdrant collection for knowledge chunks.
	VectorCollectionName = "knowledge_chunks"
	// VectorDimensions is the size of Gemini embedding-001 embeddings (3072).
	VectorDimensions = 3072
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

// NOTE: SearchKnowledge, SearchKnowledgeBySession, SearchKnowledgeBySourceIDs, ProcessAndIndex
// have been removed. Embedding/search is now handled by the Python AI service via Temporal.

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

