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
// STUB: This will be fully implemented in Phase 4.
func (s *TeamKnowledgeService) ProcessAndIndex(ctx context.Context, source *entity.KnowledgeSource, content string) (int32, int32, error) {
	log.Printf("[TeamKnowledgeService.ProcessAndIndex] STUB called: sourceID=%s, contentLen=%d", source.ID, len(content))

	// STUB: Return fake values for now
	// Phase 4 will implement actual chunking, embedding, and vector storage
	chunkCount := int32(len(content) / ChunkSize)
	if chunkCount == 0 {
		chunkCount = 1
	}
	tokenCount := int32(len(content) / 4) // Rough estimate

	log.Printf("[TeamKnowledgeService.ProcessAndIndex] STUB returning: chunks=%d, tokens=%d", chunkCount, tokenCount)
	return chunkCount, tokenCount, nil
}

// SearchByTeam performs semantic search across team knowledge.
// STUB: This will be fully implemented in Phase 6.
func (s *TeamKnowledgeService) SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error) {
	log.Printf("[TeamKnowledgeService.SearchByTeam] STUB called: teamID=%s, query=%s, topK=%d", teamID, query, topK)

	// STUB: Return empty results for now
	// Phase 6 will implement actual vector search
	log.Printf("[TeamKnowledgeService.SearchByTeam] STUB returning empty results")
	return []*entity.RetrievedChunk{}, nil
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
