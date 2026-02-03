package service

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/embedding"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
)

// TeamKnowledgeService handles team-level knowledge source operations.
type TeamKnowledgeService struct {
	repo            repository.TeamKnowledgeRepository
	embeddingClient *embedding.Client
	vectorClient    *vectordb.QdrantClient
}

// NewTeamKnowledgeService creates a new team knowledge service.
func NewTeamKnowledgeService(
	repo repository.TeamKnowledgeRepository,
	embeddingClient *embedding.Client,
	vectorClient *vectordb.QdrantClient,
) *TeamKnowledgeService {
	log.Printf("[TeamKnowledgeService] Initializing service")
	return &TeamKnowledgeService{
		repo:            repo,
		embeddingClient: embeddingClient,
		vectorClient:    vectorClient,
	}
}

// Create creates a new team-level knowledge source.
func (s *TeamKnowledgeService) Create(ctx context.Context, source *entity.KnowledgeSource) error {
	log.Printf("[TeamKnowledgeService.Create] Creating source: name=%s, teamID=%v", source.Name, source.TeamID)
	source.Status = valueobject.KnowledgeSourceStatusPending
	err := s.repo.CreateWithTeam(ctx, source)
	if err != nil {
		log.Printf("[TeamKnowledgeService.Create] ERROR: %v", err)
		return err
	}
	log.Printf("[TeamKnowledgeService.Create] SUCCESS: id=%s", source.ID)
	return nil
}

// GetByID retrieves a knowledge source by ID.
func (s *TeamKnowledgeService) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeService.GetByID] Fetching source: id=%s", id)
	source, err := s.repo.GetByID(ctx, id)
	if err != nil {
		log.Printf("[TeamKnowledgeService.GetByID] ERROR: %v", err)
		return nil, err
	}
	if source != nil {
		log.Printf("[TeamKnowledgeService.GetByID] SUCCESS: id=%s, status=%s", id, source.Status)
	} else {
		log.Printf("[TeamKnowledgeService.GetByID] Not found: id=%s", id)
	}
	return source, nil
}

// ListByTeam retrieves all knowledge sources for a team.
func (s *TeamKnowledgeService) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeService.ListByTeam] Listing sources for team: %s", teamID)
	sources, err := s.repo.ListByTeam(ctx, teamID)
	if err != nil {
		log.Printf("[TeamKnowledgeService.ListByTeam] ERROR: %v", err)
		return nil, err
	}
	log.Printf("[TeamKnowledgeService.ListByTeam] SUCCESS: count=%d", len(sources))
	return sources, nil
}

// GetReadyByTeam retrieves ready sources for a team.
func (s *TeamKnowledgeService) GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeService.GetReadyByTeam] Getting ready sources for team: %s", teamID)
	return s.repo.GetReadyByTeam(ctx, teamID)
}

// CountByTeam returns the count of sources for a team.
func (s *TeamKnowledgeService) CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error) {
	log.Printf("[TeamKnowledgeService.CountByTeam] Counting sources for team: %s", teamID)
	return s.repo.CountByTeam(ctx, teamID)
}

// SumTokensByTeam returns the total token count for all ready sources in a team.
func (s *TeamKnowledgeService) SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error) {
	log.Printf("[TeamKnowledgeService.SumTokensByTeam] Summing tokens for team: %s", teamID)
	return s.repo.SumTokensByTeam(ctx, teamID)
}

// UpdateStatus updates the processing status of a source.
func (s *TeamKnowledgeService) UpdateStatus(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeService.UpdateStatus] Updating: id=%s, status=%s", id, status)
	return s.repo.UpdateStatus(ctx, id, status, errorMsg, chunkCount)
}

// UpdateStatusWithSummary updates status with RAG-generated summary.
func (s *TeamKnowledgeService) UpdateStatusWithSummary(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
	summary string,
	tokenCount int32,
) (*entity.KnowledgeSource, error) {
	log.Printf("[TeamKnowledgeService.UpdateStatusWithSummary] Updating: id=%s, status=%s, chunks=%d, tokens=%d",
		id, status, chunkCount, tokenCount)
	return s.repo.UpdateStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// Delete deletes a knowledge source and its vectors.
func (s *TeamKnowledgeService) Delete(ctx context.Context, id uuid.UUID) error {
	log.Printf("[TeamKnowledgeService.Delete] Deleting source: id=%s", id)

	// Delete vectors first
	if s.vectorClient != nil {
		log.Printf("[TeamKnowledgeService.Delete] Step 1: Deleting vectors from Qdrant")
		if err := s.vectorClient.DeleteBySourceID(ctx, VectorCollectionName, id); err != nil {
			// Log but don't fail - vectors may not exist
			log.Printf("[TeamKnowledgeService.Delete] Warning: failed to delete vectors: %v", err)
		}
	}

	log.Printf("[TeamKnowledgeService.Delete] Step 2: Deleting DB record")
	err := s.repo.Delete(ctx, id)
	if err != nil {
		log.Printf("[TeamKnowledgeService.Delete] ERROR: %v", err)
		return err
	}

	log.Printf("[TeamKnowledgeService.Delete] SUCCESS: id=%s", id)
	return nil
}

// ProcessAndIndex processes content and indexes it in the vector store.
func (s *TeamKnowledgeService) ProcessAndIndex(ctx context.Context, source *entity.KnowledgeSource, content string) (int32, int32, error) {
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Starting: sourceID=%s, contentLen=%d", source.ID, len(content))

	if s.embeddingClient == nil || s.vectorClient == nil {
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: embedding or vector client not configured")
		return 0, 0, fmt.Errorf("embedding or vector client not configured")
	}

	// Ensure collection exists
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Step 1: Ensuring collection exists")
	if err := s.vectorClient.EnsureCollection(ctx, VectorCollectionName, VectorDimensions); err != nil {
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: failed to ensure collection: %v", err)
		return 0, 0, fmt.Errorf("failed to ensure collection: %w", err)
	}

	// Chunk the content
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Chunking content (len=%d)", len(content))
	chunks := ChunkText(content, ChunkSize, ChunkOverlap)
	if len(chunks) == 0 {
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: no content to process")
		return 0, 0, fmt.Errorf("no content to process")
	}
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Created %d chunks", len(chunks))

	// Calculate token count (rough estimate: ~4 chars per token)
	tokenCount := int32(len(content) / 4)

	// Generate embeddings for all chunks
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Generating embeddings...")
	embeddings, err := s.embeddingClient.Embed(ctx, chunks)
	if err != nil {
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: failed to embed chunks: %v", err)
		return 0, 0, fmt.Errorf("failed to embed chunks: %w", err)
	}
	if embeddings == nil || len(embeddings) != len(chunks) {
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: embedding response mismatch - got %d embeddings for %d chunks",
			len(embeddings), len(chunks))
		return 0, 0, fmt.Errorf("embedding response mismatch")
	}
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Generated %d embeddings", len(embeddings))

	// Build points for vector DB
	points := make([]vectordb.Point, len(chunks))
	for i, chunk := range chunks {
		pointID := uuid.New().String()

		// Build payload with metadata including team_id for filtering
		payload := map[string]interface{}{
			"source_id":   source.ID.String(),
			"source_name": source.Name,
			"content":     chunk,
			"chunk_index": i,
			"tenant_id":   source.TenantID.String(),
		}

		// Add team_id for team-scoped searches
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
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] Step 5: Upserting %d vectors", len(points))
	const batchSize = 100
	for i := 0; i < len(points); i += batchSize {
		end := i + batchSize
		if end > len(points) {
			end = len(points)
		}
		batch := points[i:end]
		log.Printf("[TeamKnowledgeService.ProcessAndIndex] Upserting batch %d-%d of %d", i, end, len(points))
		if err := s.vectorClient.Upsert(ctx, VectorCollectionName, batch); err != nil {
			log.Printf("[TeamKnowledgeService.ProcessAndIndex] ERROR: failed to upsert vectors: %v", err)
			return 0, 0, fmt.Errorf("failed to upsert vectors: %w", err)
		}
	}

	log.Printf("[TeamKnowledgeService.ProcessAndIndex] SUCCESS: chunks=%d, tokens=%d", len(chunks), tokenCount)
	return int32(len(chunks)), tokenCount, nil
}

// SearchByTeam performs semantic search across team knowledge.
func (s *TeamKnowledgeService) SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error) {
	log.Printf("[TeamKnowledgeService.SearchByTeam] Starting: teamID=%s, query=%s, topK=%d", teamID, query, topK)

	if s.embeddingClient == nil || s.vectorClient == nil {
		log.Printf("[TeamKnowledgeService.SearchByTeam] ERROR: embedding or vector client not configured")
		return nil, fmt.Errorf("embedding or vector client not configured")
	}

	// Generate query embedding
	log.Printf("[TeamKnowledgeService.SearchByTeam] Step 1: Generating query embedding")
	queryVector, err := s.embeddingClient.EmbedSingle(ctx, query)
	if err != nil {
		log.Printf("[TeamKnowledgeService.SearchByTeam] ERROR: failed to embed query: %v", err)
		return nil, fmt.Errorf("failed to embed query: %w", err)
	}

	// Build filter for team
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "team_id",
				"match": map[string]interface{}{"value": teamID.String()},
			},
		},
	}

	// Search vectors
	log.Printf("[TeamKnowledgeService.SearchByTeam] Step 2: Searching vectors")
	results, err := s.vectorClient.Search(ctx, VectorCollectionName, queryVector, topK, filter)
	if err != nil {
		log.Printf("[TeamKnowledgeService.SearchByTeam] ERROR: failed to search vectors: %v", err)
		return nil, fmt.Errorf("failed to search vectors: %w", err)
	}
	log.Printf("[TeamKnowledgeService.SearchByTeam] Found %d results", len(results))

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

	log.Printf("[TeamKnowledgeService.SearchByTeam] SUCCESS: returned %d chunks", len(chunks))
	return chunks, nil
}

// generateDocumentSummary generates a brief summary of the document.
// STUB: Returns first N characters as summary.
func generateDocumentSummary(content string, name string) string {
	const maxLen = 500
	if len(content) <= maxLen {
		return fmt.Sprintf("Document '%s': %s", name, content)
	}
	return fmt.Sprintf("Document '%s': %s...", name, content[:maxLen])
}
