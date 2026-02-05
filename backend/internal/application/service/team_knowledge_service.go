package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamKnowledgeService handles team-level knowledge source operations.
// It delegates to UnifiedKnowledgeService for all shared processing logic.
type TeamKnowledgeService struct {
	unified *UnifiedKnowledgeService
}

// NewTeamKnowledgeService creates a new team knowledge service backed by the
// unified knowledge service.
func NewTeamKnowledgeService(unified *UnifiedKnowledgeService) *TeamKnowledgeService {
	return &TeamKnowledgeService{
		unified: unified,
	}
}

// Create creates a new team-level knowledge source.
func (s *TeamKnowledgeService) Create(ctx context.Context, source *entity.KnowledgeSource) error {
	return s.unified.CreateTeamSource(ctx, source)
}

// GetByID retrieves a knowledge source by ID.
func (s *TeamKnowledgeService) GetByID(ctx context.Context, id uuid.UUID) (*entity.KnowledgeSource, error) {
	return s.unified.GetTeamSourceByID(ctx, id)
}

// ListByTeam retrieves all knowledge sources for a team.
func (s *TeamKnowledgeService) ListByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	return s.unified.ListByTeam(ctx, teamID)
}

// GetReadyByTeam retrieves ready sources for a team.
func (s *TeamKnowledgeService) GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error) {
	return s.unified.GetReadyByTeam(ctx, teamID)
}

// CountByTeam returns the count of sources for a team.
func (s *TeamKnowledgeService) CountByTeam(ctx context.Context, teamID uuid.UUID) (int32, error) {
	return s.unified.CountByTeam(ctx, teamID)
}

// SumTokensByTeam returns the total token count for all ready sources in a team.
func (s *TeamKnowledgeService) SumTokensByTeam(ctx context.Context, teamID uuid.UUID) (int64, error) {
	return s.unified.SumTokensByTeam(ctx, teamID)
}

// ListGlobal retrieves all global knowledge sources (team_id IS NULL).
func (s *TeamKnowledgeService) ListGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	return s.unified.ListGlobal(ctx)
}

// SumTokensGlobal returns the total token count for all ready global sources.
func (s *TeamKnowledgeService) SumTokensGlobal(ctx context.Context) (int64, error) {
	return s.unified.SumTokensGlobal(ctx)
}

// GetReadyGlobal retrieves ready global sources.
func (s *TeamKnowledgeService) GetReadyGlobal(ctx context.Context) ([]*entity.KnowledgeSource, error) {
	return s.unified.GetReadyGlobal(ctx)
}

// UpdateStatus updates the processing status of a source.
func (s *TeamKnowledgeService) UpdateStatus(
	ctx context.Context,
	id uuid.UUID,
	status valueobject.KnowledgeSourceStatus,
	errorMsg *string,
	chunkCount int32,
) (*entity.KnowledgeSource, error) {
	return s.unified.UpdateTeamStatus(ctx, id, status, errorMsg, chunkCount)
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
	return s.unified.UpdateTeamStatusWithSummary(ctx, id, status, errorMsg, chunkCount, summary, tokenCount)
}

// Delete deletes a knowledge source, its vectors, and the stored file.
func (s *TeamKnowledgeService) Delete(ctx context.Context, id uuid.UUID) error {
	return s.unified.DeleteTeamSource(ctx, id)
}

// ProcessAndIndex processes content and indexes it in the vector store.
func (s *TeamKnowledgeService) ProcessAndIndex(ctx context.Context, source *entity.KnowledgeSource, content string) (int32, int32, error) {
	return s.unified.ProcessAndIndex(ctx, source, content)
}

// SearchByTeam performs semantic search across team knowledge.
func (s *TeamKnowledgeService) SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error) {
	return s.unified.SearchByTeam(ctx, teamID, query, topK)
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

// CheckDuplicate checks if a file with the same content hash already exists.
func (s *TeamKnowledgeService) CheckDuplicate(ctx context.Context, contentHash string) (*entity.KnowledgeSource, error) {
	return s.unified.CheckDuplicate(ctx, contentHash)
}

// UpdateContentHash updates the content hash for a knowledge source.
func (s *TeamKnowledgeService) UpdateContentHash(ctx context.Context, id uuid.UUID, contentHash string) error {
	return s.unified.UpdateContentHash(ctx, id, contentHash)
}
