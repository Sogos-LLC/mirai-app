package connect

import (
	"context"
	"fmt"
	"log"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamKnowledgeTaskEnqueuer defines the interface for enqueueing team knowledge tasks.
type TeamKnowledgeTaskEnqueuer interface {
	EnqueueTeamKnowledgeIngestion(sourceID, tenantID, teamID, filePath string) error
}

// TeamKnowledgeServiceServer implements the TeamKnowledgeService Connect handler.
type TeamKnowledgeServiceServer struct {
	miraiv1connect.UnimplementedTeamKnowledgeServiceHandler
	teamKnowledgeService *service.TeamKnowledgeService
	teamService          *service.TeamService
	storageClient        StorageAdapter
	taskEnqueuer         TeamKnowledgeTaskEnqueuer
}

// NewTeamKnowledgeServiceServer creates a new TeamKnowledgeServiceServer.
func NewTeamKnowledgeServiceServer(
	teamKnowledgeService *service.TeamKnowledgeService,
	teamService *service.TeamService,
	storageClient StorageAdapter,
	taskEnqueuer TeamKnowledgeTaskEnqueuer,
) *TeamKnowledgeServiceServer {
	log.Printf("[TeamKnowledgeService] Handler initialized")
	return &TeamKnowledgeServiceServer{
		teamKnowledgeService: teamKnowledgeService,
		teamService:          teamService,
		storageClient:        storageClient,
		taskEnqueuer:         taskEnqueuer,
	}
}

// UploadTeamKnowledge uploads a file and processes it for RAG.
// If team_id is omitted, creates global knowledge (tenant-level).
// If team_id is provided, creates team-specific knowledge.
func (s *TeamKnowledgeServiceServer) UploadTeamKnowledge(
	ctx context.Context,
	req *connect.Request[v1.UploadTeamKnowledgeRequest],
) (*connect.Response[v1.UploadTeamKnowledgeResponse], error) {
	log.Printf("[Knowledge.Upload] Step 1: Extracting context")

	// Step 1: Extract tenant from context
	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		log.Printf("[Knowledge.Upload] ERROR: No tenant in context")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	// Step 2: Determine scope (global vs team)
	var teamID *uuid.UUID
	var teamIDStr string
	var storagePath string

	if req.Msg.TeamId != nil && *req.Msg.TeamId != "" {
		// Team-specific knowledge
		parsedTeamID, err := uuid.Parse(*req.Msg.TeamId)
		if err != nil {
			log.Printf("[Knowledge.Upload] ERROR: Invalid team ID: %v", err)
			return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
		}
		teamID = &parsedTeamID
		teamIDStr = parsedTeamID.String()
		storagePath = fmt.Sprintf("knowledge/%s/team/%s/%s", tenantID.String(), teamIDStr, req.Msg.Filename)
		log.Printf("[Knowledge.Upload] Team knowledge: teamID=%s", teamIDStr)
	} else {
		// Global knowledge (tenant-level)
		teamIDStr = "" // Empty string for enqueue
		storagePath = fmt.Sprintf("knowledge/%s/global/%s", tenantID.String(), req.Msg.Filename)
		log.Printf("[Knowledge.Upload] Global knowledge: tenantID=%s", tenantID)
	}

	// Step 3: Store file to MinIO
	log.Printf("[Knowledge.Upload] Step 3: Storing file to MinIO")
	if err := s.storageClient.PutContent(ctx, storagePath, req.Msg.FileContent, req.Msg.ContentType); err != nil {
		log.Printf("[Knowledge.Upload] ERROR: Failed to store file: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to store file: %w", err))
	}
	log.Printf("[Knowledge.Upload] File stored: path=%s, size=%d", storagePath, len(req.Msg.FileContent))

	// Step 4: Create DB record
	log.Printf("[Knowledge.Upload] Step 4: Creating DB record")
	fileSize := int64(len(req.Msg.FileContent))
	contentHash := req.Msg.ContentHash // Frontend provides SHA-256 hash
	source := &entity.KnowledgeSource{
		ID:            uuid.New(),
		TenantID:      tenantID,
		TeamID:        teamID, // nil for global, set for team
		Type:          valueobject.KnowledgeSourceTypeFileUpload,
		Status:        valueobject.KnowledgeSourceStatusPending,
		Name:          req.Msg.Filename,
		FilePath:      &storagePath,
		MimeType:      &req.Msg.ContentType,
		FileSizeBytes: &fileSize,
		ContentHash:   &contentHash,
	}

	if err := s.teamKnowledgeService.Create(ctx, source); err != nil {
		log.Printf("[Knowledge.Upload] ERROR: Failed to create source: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to create source: %w", err))
	}
	log.Printf("[Knowledge.Upload] DB record created: sourceID=%s", source.ID)

	// Step 5: Enqueue worker task for async processing
	log.Printf("[Knowledge.Upload] Step 5: Enqueueing worker task")
	if s.taskEnqueuer != nil {
		if err := s.taskEnqueuer.EnqueueTeamKnowledgeIngestion(
			source.ID.String(),
			tenantID.String(),
			teamIDStr, // Empty for global knowledge
			storagePath,
		); err != nil {
			log.Printf("[Knowledge.Upload] ERROR: Failed to enqueue task: %v", err)
			// Don't fail the request - the source is created, worker poll can pick it up
		} else {
			log.Printf("[Knowledge.Upload] Worker task enqueued successfully")
		}
	} else {
		log.Printf("[Knowledge.Upload] WARNING: No task enqueuer configured, processing will not happen")
	}

	// Step 6: Return response
	scope := "global"
	if teamID != nil {
		scope = "team"
	}
	summary := fmt.Sprintf("Document '%s' uploaded to %s knowledge. Processing will begin shortly.", req.Msg.Filename, scope)

	log.Printf("[Knowledge.Upload] SUCCESS: sourceID=%s, scope=%s", source.ID, scope)
	return connect.NewResponse(&v1.UploadTeamKnowledgeResponse{
		Source:     teamKnowledgeSourceToProto(source),
		RagSummary: summary,
	}), nil
}

// ListTeamKnowledgeSources returns knowledge sources.
// If team_id is omitted, returns global knowledge (tenant-level).
// If team_id is provided, returns team-specific knowledge.
func (s *TeamKnowledgeServiceServer) ListTeamKnowledgeSources(
	ctx context.Context,
	req *connect.Request[v1.ListTeamKnowledgeSourcesRequest],
) (*connect.Response[v1.ListTeamKnowledgeSourcesResponse], error) {
	log.Printf("[Knowledge.List] Step 1: Extracting context")

	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		log.Printf("[Knowledge.List] ERROR: No tenant in context")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	var sources []*entity.KnowledgeSource
	var totalTokens int64
	var err error

	if req.Msg.TeamId != nil && *req.Msg.TeamId != "" {
		// Team-specific knowledge
		teamID, parseErr := uuid.Parse(*req.Msg.TeamId)
		if parseErr != nil {
			log.Printf("[Knowledge.List] ERROR: Invalid team ID: %v", parseErr)
			return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
		}
		log.Printf("[Knowledge.List] Listing team knowledge: teamID=%s", teamID)

		sources, err = s.teamKnowledgeService.ListByTeam(ctx, teamID)
		if err != nil {
			log.Printf("[Knowledge.List] ERROR: Failed to list sources: %v", err)
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list sources: %w", err))
		}

		totalTokens, err = s.teamKnowledgeService.SumTokensByTeam(ctx, teamID)
		if err != nil {
			log.Printf("[Knowledge.List] Warning: Failed to sum tokens: %v", err)
			totalTokens = 0
		}
	} else {
		// Global knowledge (tenant-level, team_id IS NULL)
		log.Printf("[Knowledge.List] Listing global knowledge: tenantID=%s", tenantID)

		sources, err = s.teamKnowledgeService.ListGlobal(ctx)
		if err != nil {
			log.Printf("[Knowledge.List] ERROR: Failed to list global sources: %v", err)
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list sources: %w", err))
		}

		totalTokens, err = s.teamKnowledgeService.SumTokensGlobal(ctx)
		if err != nil {
			log.Printf("[Knowledge.List] Warning: Failed to sum global tokens: %v", err)
			totalTokens = 0
		}
	}

	protoSources := make([]*v1.KnowledgeSource, len(sources))
	for i, source := range sources {
		protoSources[i] = teamKnowledgeSourceToProto(source)
	}

	log.Printf("[Knowledge.List] SUCCESS: count=%d, tokens=%d", len(sources), totalTokens)
	return connect.NewResponse(&v1.ListTeamKnowledgeSourcesResponse{
		Sources:      protoSources,
		TotalSources: int32(len(sources)),
		TotalTokens:  totalTokens,
	}), nil
}

// GetTeamKnowledgeSource returns a single team knowledge source by ID.
func (s *TeamKnowledgeServiceServer) GetTeamKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.GetTeamKnowledgeSourceRequest],
) (*connect.Response[v1.GetTeamKnowledgeSourceResponse], error) {
	log.Printf("[TeamKnowledge.Get] Fetching source: id=%s", req.Msg.Id)

	id, err := parseUUID(req.Msg.Id)
	if err != nil {
		log.Printf("[TeamKnowledge.Get] ERROR: Invalid ID: %v", err)
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}

	source, err := s.teamKnowledgeService.GetByID(ctx, id)
	if err != nil {
		log.Printf("[TeamKnowledge.Get] ERROR: Failed to get source: %v", err)
		return nil, toConnectError(err)
	}
	if source == nil {
		log.Printf("[TeamKnowledge.Get] Not found: id=%s", id)
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("knowledge source not found"))
	}

	log.Printf("[TeamKnowledge.Get] SUCCESS: id=%s", id)
	return connect.NewResponse(&v1.GetTeamKnowledgeSourceResponse{
		Source: teamKnowledgeSourceToProto(source),
	}), nil
}

// DeleteTeamKnowledgeSource removes a team knowledge source.
func (s *TeamKnowledgeServiceServer) DeleteTeamKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.DeleteTeamKnowledgeSourceRequest],
) (*connect.Response[v1.DeleteTeamKnowledgeSourceResponse], error) {
	log.Printf("[TeamKnowledge.Delete] Step 1: Parsing ID")

	id, err := parseUUID(req.Msg.Id)
	if err != nil {
		log.Printf("[TeamKnowledge.Delete] ERROR: Invalid ID: %v", err)
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}
	log.Printf("[TeamKnowledge.Delete] Deleting source: id=%s", id)

	// Step 2: Delete source (service handles vector cleanup)
	log.Printf("[TeamKnowledge.Delete] Step 2: Calling service delete")
	if err := s.teamKnowledgeService.Delete(ctx, id); err != nil {
		log.Printf("[TeamKnowledge.Delete] ERROR: Failed to delete: %v", err)
		return nil, toConnectError(err)
	}

	log.Printf("[TeamKnowledge.Delete] SUCCESS: id=%s", id)
	return connect.NewResponse(&v1.DeleteTeamKnowledgeSourceResponse{
		Success: true,
	}), nil
}

// CheckDuplicateKnowledge checks if a file with the same content hash already exists.
func (s *TeamKnowledgeServiceServer) CheckDuplicateKnowledge(
	ctx context.Context,
	req *connect.Request[v1.CheckDuplicateKnowledgeRequest],
) (*connect.Response[v1.CheckDuplicateKnowledgeResponse], error) {
	log.Printf("[Knowledge.CheckDuplicate] Checking hash: %s...", req.Msg.ContentHash[:16])

	// Check authentication
	_, ok := tenant.FromContext(ctx)
	if !ok {
		log.Printf("[Knowledge.CheckDuplicate] ERROR: No tenant in context")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	// Check for duplicate
	existing, err := s.teamKnowledgeService.CheckDuplicate(ctx, req.Msg.ContentHash)
	if err != nil {
		log.Printf("[Knowledge.CheckDuplicate] ERROR: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to check duplicate: %w", err))
	}

	if existing == nil {
		log.Printf("[Knowledge.CheckDuplicate] No duplicate found")
		return connect.NewResponse(&v1.CheckDuplicateKnowledgeResponse{
			Exists: false,
		}), nil
	}

	// Determine location description
	var location string
	if existing.TeamID != nil {
		location = "Team Knowledge"
	} else {
		location = "Global Knowledge"
	}

	log.Printf("[Knowledge.CheckDuplicate] Duplicate found: id=%s, name=%s, location=%s", existing.ID, existing.Name, location)
	return connect.NewResponse(&v1.CheckDuplicateKnowledgeResponse{
		Exists:         true,
		ExistingSource: teamKnowledgeSourceToProto(existing),
		Location:       location,
	}), nil
}

// SearchTeamKnowledge performs semantic search across team knowledge.
func (s *TeamKnowledgeServiceServer) SearchTeamKnowledge(
	ctx context.Context,
	req *connect.Request[v1.SearchTeamKnowledgeRequest],
) (*connect.Response[v1.SearchTeamKnowledgeResponse], error) {
	log.Printf("[TeamKnowledge.Search] Step 1: Extracting context")

	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		log.Printf("[TeamKnowledge.Search] ERROR: No tenant in context")
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	// Step 2: Get user's team
	log.Printf("[TeamKnowledge.Search] Step 2: Getting user's team")
	team, err := s.teamService.GetTeamByTenant(ctx, tenantID)
	if err != nil {
		log.Printf("[TeamKnowledge.Search] ERROR: Failed to get team: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to get team: %w", err))
	}
	if team == nil {
		log.Printf("[TeamKnowledge.Search] No team found, returning empty results")
		return connect.NewResponse(&v1.SearchTeamKnowledgeResponse{
			Chunks: []*v1.RetrievedChunk{},
		}), nil
	}

	// Step 3: Perform search
	topK := int(req.Msg.TopK)
	if topK <= 0 {
		topK = 5
	}
	if topK > 20 {
		topK = 20
	}

	log.Printf("[TeamKnowledge.Search] Step 3: Searching: query=%s, topK=%d", req.Msg.Query, topK)
	chunks, err := s.teamKnowledgeService.SearchByTeam(ctx, team.ID, req.Msg.Query, topK)
	if err != nil {
		log.Printf("[TeamKnowledge.Search] ERROR: Search failed: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("search failed: %w", err))
	}

	protoChunks := make([]*v1.RetrievedChunk, len(chunks))
	for i, chunk := range chunks {
		protoChunks[i] = &v1.RetrievedChunk{
			Id:              chunk.ID,
			SourceId:        chunk.SourceID.String(),
			SourceName:      chunk.SourceName,
			Content:         chunk.Content,
			SimilarityScore: chunk.SimilarityScore,
		}
		if chunk.ChunkIndex != nil {
			protoChunks[i].ChunkIndex = chunk.ChunkIndex
		}
	}

	log.Printf("[TeamKnowledge.Search] SUCCESS: results=%d", len(chunks))
	return connect.NewResponse(&v1.SearchTeamKnowledgeResponse{
		Chunks: protoChunks,
	}), nil
}

// teamKnowledgeSourceToProto converts a domain entity to proto message.
func teamKnowledgeSourceToProto(source *entity.KnowledgeSource) *v1.KnowledgeSource {
	proto := &v1.KnowledgeSource{
		Id:         source.ID.String(),
		TenantId:   source.TenantID.String(),
		Type:       knowledgeTypeToProto(source.Type),
		Status:     knowledgeStatusToProto(source.Status),
		Name:       source.Name,
		ChunkCount: source.ChunkCount,
		VideoUrls:  source.VideoURLs,
		CreatedAt:  timestamppb.New(source.CreatedAt),
		UpdatedAt:  timestamppb.New(source.UpdatedAt),
	}

	if source.CourseID != nil {
		proto.CourseId = source.CourseID.String()
	}
	if source.TeamID != nil {
		proto.TeamId = ptrString(source.TeamID.String())
	}
	if source.SessionID != nil {
		proto.SessionId = source.SessionID
	}
	if source.FilePath != nil {
		proto.FilePath = *source.FilePath
	}
	if source.MimeType != nil {
		proto.MimeType = *source.MimeType
	}
	if source.FileSizeBytes != nil {
		proto.FileSizeBytes = *source.FileSizeBytes
	}
	if source.ErrorMessage != nil {
		proto.ErrorMessage = source.ErrorMessage
	}
	if source.Summary != nil {
		proto.Summary = source.Summary
	}
	if source.TokenCount != nil {
		proto.TokenCount = source.TokenCount
	}
	if source.ProcessedAt != nil {
		proto.ProcessedAt = timestamppb.New(*source.ProcessedAt)
	}
	if source.ContentHash != nil {
		proto.ContentHash = source.ContentHash
	}

	return proto
}

// Helper to create string pointer
func ptrString(s string) *string {
	return &s
}

// Helper functions to convert between domain and proto enums
func knowledgeTypeToProto(t valueobject.KnowledgeSourceType) v1.KnowledgeSourceType {
	switch t {
	case valueobject.KnowledgeSourceTypeFileUpload:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_FILE_UPLOAD
	case valueobject.KnowledgeSourceTypeGoogleDrive:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_GOOGLE_DRIVE
	case valueobject.KnowledgeSourceTypeOneDrive:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_ONEDRIVE
	case valueobject.KnowledgeSourceTypeS3:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_S3
	case valueobject.KnowledgeSourceTypeGoogleSheets:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_GOOGLE_SHEETS
	case valueobject.KnowledgeSourceTypeMicrosoft365:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_MICROSOFT_365
	case valueobject.KnowledgeSourceTypeURL:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_URL
	default:
		return v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_UNSPECIFIED
	}
}

func knowledgeStatusToProto(s valueobject.KnowledgeSourceStatus) v1.KnowledgeSourceStatus {
	switch s {
	case valueobject.KnowledgeSourceStatusPending:
		return v1.KnowledgeSourceStatus_KNOWLEDGE_SOURCE_STATUS_PENDING
	case valueobject.KnowledgeSourceStatusProcessing:
		return v1.KnowledgeSourceStatus_KNOWLEDGE_SOURCE_STATUS_PROCESSING
	case valueobject.KnowledgeSourceStatusReady:
		return v1.KnowledgeSourceStatus_KNOWLEDGE_SOURCE_STATUS_READY
	case valueobject.KnowledgeSourceStatusFailed:
		return v1.KnowledgeSourceStatus_KNOWLEDGE_SOURCE_STATUS_FAILED
	default:
		return v1.KnowledgeSourceStatus_KNOWLEDGE_SOURCE_STATUS_UNSPECIFIED
	}
}
