package service

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/embedding"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
)

// KnowledgeScope defines which repository/scope a knowledge operation targets.
type KnowledgeScope string

const (
	// KnowledgeScopeCourse targets course-level knowledge (knowledge_sources table).
	KnowledgeScopeCourse KnowledgeScope = "course"
	// KnowledgeScopeTeam targets team/global-level knowledge (team_knowledge_sources table).
	KnowledgeScopeTeam KnowledgeScope = "team"
)

// UnifiedKnowledgeService handles all knowledge source operations across both
// course-scoped and team-scoped knowledge. It shares the common chunking,
// embedding, and vector storage logic while delegating persistence to the
// appropriate repository based on scope.
type UnifiedKnowledgeService struct {
	courseRepo      repository.KnowledgeSourceRepository
	teamRepo        repository.TeamKnowledgeRepository
	embeddingClient *embedding.Client
	vectorClient    *vectordb.QdrantClient
	fileStorage     domainservice.FileStorage
}

// NewUnifiedKnowledgeService creates a new unified knowledge service.
func NewUnifiedKnowledgeService(
	courseRepo repository.KnowledgeSourceRepository,
	teamRepo repository.TeamKnowledgeRepository,
	embeddingClient *embedding.Client,
	vectorClient *vectordb.QdrantClient,
	fileStorage domainservice.FileStorage,
) *UnifiedKnowledgeService {
	log.Printf("[UnifiedKnowledgeService] Initializing service")
	return &UnifiedKnowledgeService{
		courseRepo:      courseRepo,
		teamRepo:        teamRepo,
		embeddingClient: embeddingClient,
		vectorClient:    vectorClient,
		fileStorage:     fileStorage,
	}
}

// ---------------------------------------------------------------------------
// Course-scope operations (delegate to courseRepo)
// ---------------------------------------------------------------------------

// CreateCourseSource creates a new course-scoped knowledge source.
func (s *UnifiedKnowledgeService) CreateCourseSource(ctx context.Context, source *entity.KnowledgeSource) error {
	source.Status = valueobject.KnowledgeSourceStatusPending
	return s.courseRepo.Create(ctx, source)
}

// CreateWithSession creates a knowledge source with session_id (pre-course wizard flow).
func (s *UnifiedKnowledgeService) CreateWithSession(ctx context.Context, source *entity.KnowledgeSource) error {
	source.Status = valueobject.KnowledgeSourceStatusPending
	return s.courseRepo.CreateWithSession(ctx, source)
}

// GetCourseSourceByID retrieves a course-scoped knowledge source by ID.
func (s *UnifiedKnowledgeService) GetCourseSourceByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	return s.courseRepo.GetByID(ctx, id)
}

// ListByCourse retrieves all knowledge sources for a course.
func (s *UnifiedKnowledgeService) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	return s.courseRepo.ListByCourse(ctx, courseID)
}

// ListBySession retrieves all knowledge sources for a session.
func (s *UnifiedKnowledgeService) ListBySession(ctx context.Context, sessionID string) ([]*entity.KnowledgeSource, error) {
	return s.courseRepo.ListBySession(ctx, sessionID)
}

// LinkSessionToCourse links all sources from a session to a course.
func (s *UnifiedKnowledgeService) LinkSessionToCourse(ctx context.Context, sessionID string, courseID uuid.UUID) (int64, error) {
	return s.courseRepo.LinkSessionToCourse(ctx, sessionID, courseID)
}

// DeleteCourseSource deletes a course-scoped knowledge source and its vectors.
func (s *UnifiedKnowledgeService) DeleteCourseSource(ctx context.Context, id uuid.UUID) error {
	// Delete vectors first
	if s.vectorClient != nil {
		if err := s.vectorClient.DeleteBySourceID(ctx, VectorCollectionName, id); err != nil {
			fmt.Printf("Warning: failed to delete vectors for source %s: %v\n", id, err)
		}
	}
	return s.courseRepo.Delete(ctx, id)
}

// UpdateCourseStatusWithSummary updates a course-scoped source status with summary and counts.
func (s *UnifiedKnowledgeService) UpdateCourseStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	return s.courseRepo.UpdateStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// SearchKnowledge performs semantic search across course knowledge.
func (s *UnifiedKnowledgeService) SearchKnowledge(
	ctx context.Context,
	courseID uuid.UUID,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "course_id",
				"match": map[string]interface{}{"value": courseID.String()},
			},
		},
	}
	return s.searchVectors(ctx, query, topK, filter)
}

// SearchKnowledgeBySession performs semantic search across session knowledge.
func (s *UnifiedKnowledgeService) SearchKnowledgeBySession(
	ctx context.Context,
	sessionID string,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "session_id",
				"match": map[string]interface{}{"value": sessionID},
			},
		},
	}
	return s.searchVectors(ctx, query, topK, filter)
}

// SearchKnowledgeBySourceIDs performs semantic search across specific knowledge sources.
func (s *UnifiedKnowledgeService) SearchKnowledgeBySourceIDs(
	ctx context.Context,
	sourceIDs []string,
	query string,
	topK int,
) ([]*entity.RetrievedChunk, error) {
	if len(sourceIDs) == 0 {
		return nil, nil
	}

	shouldConditions := make([]map[string]interface{}, len(sourceIDs))
	for i, sourceID := range sourceIDs {
		shouldConditions[i] = map[string]interface{}{
			"key":   "source_id",
			"match": map[string]interface{}{"value": sourceID},
		}
	}

	filter := map[string]interface{}{
		"should": shouldConditions,
	}
	return s.searchVectors(ctx, query, topK, filter)
}

// ---------------------------------------------------------------------------
// Team-scope operations (delegate to teamRepo)
// ---------------------------------------------------------------------------

// CreateTeamSource creates a new team-level knowledge source.
func (s *UnifiedKnowledgeService) CreateTeamSource(ctx context.Context, source *entity.KnowledgeSource) error {
	log.Printf("[UnifiedKnowledgeService.CreateTeamSource] Creating source: name=%s, teamID=%v", source.Name, source.TeamID)
	source.Status = valueobject.KnowledgeSourceStatusPending
	err := s.teamRepo.CreateWithTeam(ctx, source)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.CreateTeamSource] ERROR: %v", err)
		return err
	}
	log.Printf("[UnifiedKnowledgeService.CreateTeamSource] SUCCESS: id=%s", source.ID)
	return nil
}

// GetTeamSourceByID retrieves a team-scoped knowledge source by ID.
func (s *UnifiedKnowledgeService) GetTeamSourceByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.GetTeamSourceByID] Fetching source: id=%s", id)
	source, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.GetTeamSourceByID] ERROR: %v", err)
		return nil, err
	}
	if source != nil {
		log.Printf("[UnifiedKnowledgeService.GetTeamSourceByID] SUCCESS: id=%s, status=%s", id, source.Status)
	} else {
		log.Printf("[UnifiedKnowledgeService.GetTeamSourceByID] Not found: id=%s", id)
	}
	return source, nil
}

// ListByTeam retrieves all knowledge sources for a team.
func (s *UnifiedKnowledgeService) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.ListByTeam] Listing sources for team: %s", teamID)
	sources, err := s.teamRepo.ListByTeam(ctx, teamID)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.ListByTeam] ERROR: %v", err)
		return nil, err
	}
	log.Printf("[UnifiedKnowledgeService.ListByTeam] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// GetReadyByTeam retrieves ready sources for a team.
func (s *UnifiedKnowledgeService) GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.GetReadyByTeam] Getting ready sources for team: %s", teamID)
	return s.teamRepo.GetReadyByTeam(ctx, teamID)
}

// CountByTeam returns the count of sources for a team.
func (s *UnifiedKnowledgeService) CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error) {
	log.Printf("[UnifiedKnowledgeService.CountByTeam] Counting sources for team: %s", teamID)
	return s.teamRepo.CountByTeam(ctx, teamID)
}

// SumTokensByTeam returns the total token count for all ready sources in a team.
func (s *UnifiedKnowledgeService) SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error) {
	log.Printf("[UnifiedKnowledgeService.SumTokensByTeam] Summing tokens for team: %s", teamID)
	return s.teamRepo.SumTokensByTeam(ctx, teamID)
}

// ListGlobal retrieves all global knowledge sources (team_id IS NULL).
func (s *UnifiedKnowledgeService) ListGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.ListGlobal] Listing global knowledge sources")
	sources, err := s.teamRepo.ListGlobal(ctx)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.ListGlobal] ERROR: %v", err)
		return nil, err
	}
	log.Printf("[UnifiedKnowledgeService.ListGlobal] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// SumTokensGlobal returns the total token count for all ready global sources.
func (s *UnifiedKnowledgeService) SumTokensGlobal(ctx context.Context) (int64, error) {
	log.Printf("[UnifiedKnowledgeService.SumTokensGlobal] Summing global tokens")
	return s.teamRepo.SumTokensGlobal(ctx)
}

// GetReadyGlobal retrieves ready global sources.
func (s *UnifiedKnowledgeService) GetReadyGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.GetReadyGlobal] Getting ready global sources")
	return s.teamRepo.GetReadyGlobal(ctx)
}

// UpdateTeamStatus updates the processing status of a team-scoped source.
func (s *UnifiedKnowledgeService) UpdateTeamStatus(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.UpdateTeamStatus] Updating: id=%s, status=%s", id, status)
	return s.teamRepo.UpdateStatus(ctx, id, status, errorMsg, chunkCount)
}

// UpdateTeamStatusWithSummary updates a team-scoped source status with RAG-generated summary.
func (s *UnifiedKnowledgeService) UpdateTeamStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.UpdateTeamStatusWithSummary] Updating: id=%s, status=%s, chunks=%d, tokens=%d",
		id, status, chunkCount, tokenCount)
	return s.teamRepo.UpdateStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// DeleteTeamSource deletes a team-scoped knowledge source, its vectors, and the stored file.
func (s *UnifiedKnowledgeService) DeleteTeamSource(ctx context.Context, id uuid.UUID) error {
	log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Deleting source: id=%s", id)

	// First, fetch the source to get the file path
	source, err := s.teamRepo.GetByID(ctx, id)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] ERROR fetching source: %v", err)
		return fmt.Errorf("failed to fetch source for deletion: %w", err)
	}
	if source == nil {
		log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Source not found: id=%s", id)
		return fmt.Errorf("knowledge source not found: %s", id)
	}

	// Step 1: Delete vectors from Qdrant
	if s.vectorClient != nil {
		log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Step 1: Deleting vectors from Qdrant")
		if err := s.vectorClient.DeleteBySourceID(ctx, VectorCollectionName, id); err != nil {
			log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Warning: failed to delete vectors: %v", err)
		}
	}

	// Step 2: Delete file from storage
	if s.fileStorage != nil && source.FilePath != nil && *source.FilePath != "" {
		log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Step 2: Deleting file from storage: %s", *source.FilePath)
		if err := s.fileStorage.Delete(ctx, *source.FilePath); err != nil {
			log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Warning: failed to delete file: %v", err)
		}
	}

	// Step 3: Delete DB record
	log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] Step 3: Deleting DB record")
	err = s.teamRepo.Delete(ctx, id)
	if err != nil {
		log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] ERROR: %v", err)
		return err
	}

	log.Printf("[UnifiedKnowledgeService.DeleteTeamSource] SUCCESS: id=%s", id)
	return nil
}

// SearchByTeam performs semantic search across team knowledge.
func (s *UnifiedKnowledgeService) SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error) {
	log.Printf("[UnifiedKnowledgeService.SearchByTeam] Starting: teamID=%s, query=%s, topK=%d", teamID, query, topK)

	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "team_id",
				"match": map[string]interface{}{"value": teamID.String()},
			},
		},
	}

	chunks, err := s.searchVectors(ctx, query, topK, filter)
	if err != nil {
		return nil, err
	}

	log.Printf("[UnifiedKnowledgeService.SearchByTeam] SUCCESS: returned %d chunks", len(chunks))
	return chunks, nil
}

// CheckDuplicate checks if a file with the same content hash already exists.
func (s *UnifiedKnowledgeService) CheckDuplicate(ctx context.Context, contentHash string) (*entity.KnowledgeSource, error) {
	log.Printf("[UnifiedKnowledgeService.CheckDuplicate] Checking for duplicate: hash=%s...", contentHash[:16])
	return s.teamRepo.FindByContentHash(ctx, contentHash)
}

// UpdateContentHash updates the content hash for a knowledge source.
func (s *UnifiedKnowledgeService) UpdateContentHash(ctx context.Context, id uuid.UUID, contentHash string) error {
	log.Printf("[UnifiedKnowledgeService.UpdateContentHash] Updating hash for: id=%s", id)
	return s.teamRepo.UpdateContentHash(ctx, id, contentHash)
}

// ---------------------------------------------------------------------------
// Shared operations (scope-agnostic processing logic)
// ---------------------------------------------------------------------------

// ProcessAndIndex processes document content and stores vectors in the vector DB.
// This method works for both course-scoped and team-scoped sources. The entity's
// CourseID, SessionID, and TeamID fields determine which metadata is attached to
// the vector payloads for later filtered retrieval.
func (s *UnifiedKnowledgeService) ProcessAndIndex(
	ctx context.Context,
	source *entity.KnowledgeSource,
	content string,
) (chunkCount int32, tokenCount int32, err error) {
	log.Printf("[UnifiedKnowledgeService.ProcessAndIndex] Starting: sourceID=%s, contentLen=%d", source.ID, len(content))

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
	log.Printf("[UnifiedKnowledgeService.ProcessAndIndex] Created %d chunks", len(chunks))

	// Calculate token count (rough estimate: ~4 chars per token)
	tokenCount = int32(len(content) / 4)

	// Generate embeddings for all chunks
	embeddings, err := s.embeddingClient.Embed(ctx, chunks)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to embed chunks: %w", err)
	}

	// Validate embedding response
	if embeddings == nil || len(embeddings) != len(chunks) {
		return 0, 0, fmt.Errorf("embedding response mismatch: got %d embeddings for %d chunks", len(embeddings), len(chunks))
	}

	// Build points for vector DB with scope-appropriate metadata
	points := make([]vectordb.Point, len(chunks))
	for i, chunk := range chunks {
		pointID := uuid.New().String()

		payload := map[string]interface{}{
			"source_id":   source.ID.String(),
			"source_name": source.Name,
			"content":     chunk,
			"chunk_index": i,
			"tenant_id":   source.TenantID.String(),
		}

		// Attach scope-specific metadata for filtered searches
		if source.CourseID != nil {
			payload["course_id"] = source.CourseID.String()
		}
		if source.SessionID != nil {
			payload["session_id"] = *source.SessionID
		}
		if source.TeamID != nil {
			payload["team_id"] = source.TeamID.String()
		}

		points[i] = vectordb.Point{
			ID:      pointID,
			Vector:  embeddings[i],
			Payload: payload,
		}
	}

	// Upsert vectors in batches to avoid timeout
	const batchSize = 100
	for i := 0; i < len(points); i += batchSize {
		end := i + batchSize
		if end > len(points) {
			end = len(points)
		}
		if err := s.vectorClient.Upsert(ctx, VectorCollectionName, points[i:end]); err != nil {
			return 0, 0, fmt.Errorf("failed to upsert vectors (batch %d-%d): %w", i, end, err)
		}
	}

	log.Printf("[UnifiedKnowledgeService.ProcessAndIndex] SUCCESS: chunks=%d, tokens=%d", len(chunks), tokenCount)
	return int32(len(chunks)), tokenCount, nil
}

// ---------------------------------------------------------------------------
// Shared vector search helper
// ---------------------------------------------------------------------------

// searchVectors is the common vector search path: embed the query, apply a
// filter, call Qdrant, and convert results to domain chunks.
func (s *UnifiedKnowledgeService) searchVectors(
	ctx context.Context,
	query string,
	topK int,
	filter map[string]interface{},
) ([]*entity.RetrievedChunk, error) {
	if s.embeddingClient == nil || s.vectorClient == nil {
		return nil, fmt.Errorf("embedding or vector client not configured")
	}

	// Generate query embedding
	queryVector, err := s.embeddingClient.EmbedSingle(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to embed query: %w", err)
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
