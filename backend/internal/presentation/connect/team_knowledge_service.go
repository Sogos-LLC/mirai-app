package connect

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	v1 "github.com/sogos/mirai-backend/gen/mirai/v1"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
	"github.com/sogos/mirai-backend/internal/domain/worker"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
	infraworker "github.com/sogos/mirai-backend/internal/infrastructure/worker"
)

// TeamKnowledgeServiceServer implements the TeamKnowledgeService Connect handler.
type TeamKnowledgeServiceServer struct {
	miraiv1connect.UnimplementedTeamKnowledgeServiceHandler
	knowledgeService *service.KnowledgeSourceService
	teamService      *service.TeamService
	userRepo         repository.UserRepository
	storageClient    StorageAdapter
	workerClient     *infraworker.Client
	subscriber       pubsub.Subscriber
}

// NewTeamKnowledgeServiceServer creates a new TeamKnowledgeServiceServer.
func NewTeamKnowledgeServiceServer(
	knowledgeService *service.KnowledgeSourceService,
	teamService *service.TeamService,
	userRepo repository.UserRepository,
	storageClient StorageAdapter,
	workerClient *infraworker.Client,
	subscriber pubsub.Subscriber,
) *TeamKnowledgeServiceServer {
	return &TeamKnowledgeServiceServer{
		knowledgeService: knowledgeService,
		teamService:      teamService,
		userRepo:         userRepo,
		storageClient:    storageClient,
		workerClient:     workerClient,
		subscriber:       subscriber,
	}
}

// QueueTeamKnowledgeIngestion uploads a file and queues it for async processing.
// Returns immediately with job_id for tracking via SSE stream.
func (s *TeamKnowledgeServiceServer) QueueTeamKnowledgeIngestion(
	ctx context.Context,
	req *connect.Request[v1.QueueTeamKnowledgeIngestionRequest],
) (*connect.Response[v1.QueueTeamKnowledgeIngestionResponse], error) {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	// Get user by kratos ID
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
	}

	// Verify user has access to team
	_, err = s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Store file to MinIO at: knowledge/{tenant_id}/teams/{team_id}/{filename}
	filePath := fmt.Sprintf("knowledge/%s/teams/%s/%s", tenantID.String(), teamID.String(), req.Msg.Filename)
	if err := s.storageClient.PutContent(ctx, filePath, req.Msg.FileContent, req.Msg.ContentType); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to store file: %w", err))
	}

	// Create knowledge source with team_id (status: pending)
	fileSize := int64(len(req.Msg.FileContent))
	source := &entity.KnowledgeSource{
		ID:            uuid.New(),
		TenantID:      tenantID,
		TeamID:        &teamID,
		Type:          valueobject.KnowledgeSourceTypeFileUpload,
		Status:        valueobject.KnowledgeSourceStatusPending,
		Name:          req.Msg.Filename,
		FilePath:      &filePath,
		MimeType:      &req.Msg.ContentType,
		FileSizeBytes: &fileSize,
	}

	if err := s.knowledgeService.CreateWithTeam(ctx, source); err != nil {
		return nil, toConnectError(err)
	}

	// Generate job ID and enqueue Asynq task
	jobID := uuid.New().String()

	payload := worker.TeamKnowledgeIngestionPayload{
		JobID:       jobID,
		SourceID:    source.ID.String(),
		TeamID:      teamID.String(),
		TenantID:    tenantID.String(),
		UserID:      user.ID.String(),
		FilePath:    filePath,
		Filename:    req.Msg.Filename,
		ContentType: req.Msg.ContentType,
	}

	if err := s.workerClient.EnqueueTeamKnowledgeIngestion(payload); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to enqueue ingestion job: %w", err))
	}

	return connect.NewResponse(&v1.QueueTeamKnowledgeIngestionResponse{
		JobId:    jobID,
		SourceId: source.ID.String(),
	}), nil
}

// SubscribeIngestionStatus streams real-time status updates for ingestion jobs.
// Server-sent events pattern for job progress tracking.
func (s *TeamKnowledgeServiceServer) SubscribeIngestionStatus(
	ctx context.Context,
	req *connect.Request[v1.SubscribeIngestionStatusRequest],
	stream *connect.ServerStream[v1.SubscribeIngestionStatusResponse],
) error {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}

	// Get user ID from kratos ID
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	// Subscribe to Redis channel for ingestion events
	eventCh, cleanup, err := s.subscriber.SubscribeIngestionEvents(ctx, user.ID)
	if err != nil {
		return connect.NewError(connect.CodeInternal, err)
	}
	defer cleanup()

	// Heartbeat ticker to keep connection alive through Cloudflare/proxy timeouts
	// Send a keep-alive every 15 seconds
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	// Forward events to client stream
	for {
		select {
		case <-ctx.Done():
			// Client disconnected or context cancelled
			return nil
		case <-heartbeat.C:
			// Send heartbeat to keep connection alive
			resp := &v1.SubscribeIngestionStatusResponse{
				Status: v1.IngestionStatus_INGESTION_STATUS_KEEPALIVE,
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		case event, ok := <-eventCh:
			if !ok {
				// Channel closed
				return nil
			}
			// Send event to client
			resp := &v1.SubscribeIngestionStatusResponse{
				JobId:           event.JobID,
				SourceId:        event.SourceID,
				Status:          event.Status,
				ErrorMessage:    event.ErrorMessage,
				Source:          event.Source,
				ProgressPercent: event.ProgressPercent,
			}
			if err := stream.Send(resp); err != nil {
				return err
			}
		}
	}
}

// UpdateKnowledgeSourceIndex saves user edits to summary/topics after review.
// Human-in-the-loop: user can refine AI-generated summaries before saving.
func (s *TeamKnowledgeServiceServer) UpdateKnowledgeSourceIndex(
	ctx context.Context,
	req *connect.Request[v1.UpdateKnowledgeSourceIndexRequest],
) (*connect.Response[v1.UpdateKnowledgeSourceIndexResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	sourceID, err := parseUUID(req.Msg.SourceId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid source_id"))
	}

	// Get the source to verify team access
	source, err := s.knowledgeService.GetByID(ctx, sourceID)
	if err != nil {
		return nil, toConnectError(err)
	}
	if source == nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("knowledge source not found"))
	}

	// If source has a team_id, verify user has access to the team
	if source.TeamID != nil {
		_, err = s.teamService.GetTeam(ctx, kratosID, *source.TeamID)
		if err != nil {
			return nil, toConnectError(err)
		}
	}

	// Convert proto topics to domain model
	var mainTopics []string
	for _, topic := range req.Msg.Topics {
		mainTopics = append(mainTopics, topic.Topic)
	}

	documentIndex := &entity.DocumentIndex{
		MainTopics:  mainTopics,
		KeyConcepts: req.Msg.KeyConcepts,
	}

	// Update the document index
	updatedSource, err := s.knowledgeService.UpdateDocumentIndex(ctx, sourceID, req.Msg.Summary, documentIndex)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UpdateKnowledgeSourceIndexResponse{
		Source: knowledgeSourceToProto(updatedSource),
	}), nil
}

// ListTeamKnowledgeSources returns all knowledge sources for a team.
func (s *TeamKnowledgeServiceServer) ListTeamKnowledgeSources(
	ctx context.Context,
	req *connect.Request[v1.ListTeamKnowledgeSourcesRequest],
) (*connect.Response[v1.ListTeamKnowledgeSourcesResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
	}

	// Verify user has access to team
	_, err = s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	sources, err := s.knowledgeService.ListByTeam(ctx, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoSources := make([]*v1.KnowledgeSource, len(sources))
	for i, source := range sources {
		protoSources[i] = knowledgeSourceToProto(source)
	}

	return connect.NewResponse(&v1.ListTeamKnowledgeSourcesResponse{
		Sources: protoSources,
	}), nil
}

// GetTeamKnowledgeSource returns a single team knowledge source by ID.
func (s *TeamKnowledgeServiceServer) GetTeamKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.GetTeamKnowledgeSourceRequest],
) (*connect.Response[v1.GetTeamKnowledgeSourceResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	sourceID, err := parseUUID(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}

	source, err := s.knowledgeService.GetByID(ctx, sourceID)
	if err != nil {
		return nil, toConnectError(err)
	}
	if source == nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("knowledge source not found"))
	}

	// If source has a team_id, verify user has access to the team
	if source.TeamID != nil {
		_, err = s.teamService.GetTeam(ctx, kratosID, *source.TeamID)
		if err != nil {
			return nil, toConnectError(err)
		}
	}

	return connect.NewResponse(&v1.GetTeamKnowledgeSourceResponse{
		Source: knowledgeSourceToProto(source),
	}), nil
}

// DeleteTeamKnowledgeSource removes a team knowledge source.
func (s *TeamKnowledgeServiceServer) DeleteTeamKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.DeleteTeamKnowledgeSourceRequest],
) (*connect.Response[v1.DeleteTeamKnowledgeSourceResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	sourceID, err := parseUUID(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}

	// Get the source to verify team access
	source, err := s.knowledgeService.GetByID(ctx, sourceID)
	if err != nil {
		return nil, toConnectError(err)
	}
	if source == nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("knowledge source not found"))
	}

	// If source has a team_id, verify user has access to the team
	if source.TeamID != nil {
		_, err = s.teamService.GetTeam(ctx, kratosID, *source.TeamID)
		if err != nil {
			return nil, toConnectError(err)
		}
	}

	if err := s.knowledgeService.Delete(ctx, sourceID); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteTeamKnowledgeSourceResponse{
		Success: true,
	}), nil
}

// SearchTeamKnowledge performs semantic search across team knowledge.
func (s *TeamKnowledgeServiceServer) SearchTeamKnowledge(
	ctx context.Context,
	req *connect.Request[v1.SearchTeamKnowledgeRequest],
) (*connect.Response[v1.SearchTeamKnowledgeResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
	}

	// Verify user has access to team
	_, err = s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	topK := int(req.Msg.TopK)
	if topK <= 0 {
		topK = 5
	}
	if topK > 20 {
		topK = 20
	}

	chunks, err := s.knowledgeService.SearchKnowledgeByTeam(ctx, teamID, req.Msg.Query, topK)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoChunks := make([]*v1.RetrievedChunk, len(chunks))
	for i, chunk := range chunks {
		protoChunks[i] = &v1.RetrievedChunk{
			Id:              chunk.ID,
			SourceId:        chunk.SourceID.String(),
			SourceName:      chunk.SourceName,
			Content:         chunk.Content,
			SimilarityScore: chunk.SimilarityScore,
			ChunkIndex:      chunk.ChunkIndex,
		}
	}

	return connect.NewResponse(&v1.SearchTeamKnowledgeResponse{
		Chunks: protoChunks,
	}), nil
}

// GetTeamKnowledgeSummary returns aggregated statistics for team knowledge.
func (s *TeamKnowledgeServiceServer) GetTeamKnowledgeSummary(
	ctx context.Context,
	req *connect.Request[v1.GetTeamKnowledgeSummaryRequest],
) (*connect.Response[v1.GetTeamKnowledgeSummaryResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
	}

	// Verify user has access to team
	_, err = s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	summary, err := s.knowledgeService.GetTeamSummary(ctx, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.GetTeamKnowledgeSummaryResponse{
		TotalSources: summary.TotalSources,
		TotalChunks:  summary.TotalChunks,
		TotalTokens:  summary.TotalTokens,
	}), nil
}

// GetAggregatedTeamKnowledge returns combined summary of all team docs.
// Used in course wizard when "Include team knowledge" is enabled.
func (s *TeamKnowledgeServiceServer) GetAggregatedTeamKnowledge(
	ctx context.Context,
	req *connect.Request[v1.GetAggregatedTeamKnowledgeRequest],
) (*connect.Response[v1.GetAggregatedTeamKnowledgeResponse], error) {
	kratosIDStr, ok := ctx.Value(kratosIDKey{}).(string)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	kratosID, err := parseUUID(kratosIDStr)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}

	teamID, err := parseUUID(req.Msg.TeamId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid team_id"))
	}

	// Verify user has access to team
	_, err = s.teamService.GetTeam(ctx, kratosID, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Get all ready sources for the team
	sources, err := s.knowledgeService.GetReadyByTeam(ctx, teamID)
	if err != nil {
		return nil, toConnectError(err)
	}

	// Aggregate topics and concepts from all document indices
	topicSet := make(map[string]struct{})
	conceptSet := make(map[string]struct{})
	var totalChunks int32
	var totalTokens int32

	for _, source := range sources {
		totalChunks += source.ChunkCount
		if source.TokenCount != nil {
			totalTokens += *source.TokenCount
		}

		if source.DocumentIndex != nil {
			for _, topic := range source.DocumentIndex.MainTopics {
				topicSet[topic] = struct{}{}
			}
			for _, concept := range source.DocumentIndex.KeyConcepts {
				conceptSet[concept] = struct{}{}
			}
		}
	}

	// Convert sets to slices
	mainTopics := make([]string, 0, len(topicSet))
	for topic := range topicSet {
		mainTopics = append(mainTopics, topic)
	}

	keyConcepts := make([]string, 0, len(conceptSet))
	for concept := range conceptSet {
		keyConcepts = append(keyConcepts, concept)
	}

	// Convert sources to proto
	protoSources := make([]*v1.KnowledgeSource, len(sources))
	for i, source := range sources {
		protoSources[i] = knowledgeSourceToProto(source)
	}

	return connect.NewResponse(&v1.GetAggregatedTeamKnowledgeResponse{
		Sources:      protoSources,
		MainTopics:   mainTopics,
		KeyConcepts:  keyConcepts,
		TotalSources: int32(len(sources)),
		TotalChunks:  totalChunks,
		TotalTokens:  totalTokens,
	}), nil
}

// teamKnowledgeSourceToProto converts a domain entity to proto with team-specific fields.
// Note: This function uses the existing knowledgeSourceToProto and adds team_id.
func teamKnowledgeSourceToProto(source *entity.KnowledgeSource) *v1.KnowledgeSource {
	pb := &v1.KnowledgeSource{
		Id:         source.ID.String(),
		TenantId:   source.TenantID.String(),
		Type:       knowledgeSourceTypeToProto(source.Type),
		Status:     knowledgeSourceStatusToProto(source.Status),
		Name:       source.Name,
		ChunkCount: source.ChunkCount,
		VideoUrls:  source.VideoURLs,
		CreatedAt:  timestamppb.New(source.CreatedAt),
		UpdatedAt:  timestamppb.New(source.UpdatedAt),
	}

	// Handle optional fields
	if source.TeamID != nil {
		pb.TeamId = strPtr(source.TeamID.String())
	}
	if source.CourseID != nil {
		pb.CourseId = source.CourseID.String()
	}
	if source.SessionID != nil {
		pb.SessionId = source.SessionID
	}
	if source.FilePath != nil {
		pb.FilePath = *source.FilePath
	}
	if source.MimeType != nil {
		pb.MimeType = *source.MimeType
	}
	if source.FileSizeBytes != nil {
		pb.FileSizeBytes = *source.FileSizeBytes
	}
	if source.ErrorMessage != nil {
		pb.ErrorMessage = source.ErrorMessage
	}
	if source.Summary != nil {
		pb.Summary = source.Summary
	}
	if source.TokenCount != nil {
		pb.TokenCount = source.TokenCount
	}
	if source.ProcessedAt != nil {
		pb.ProcessedAt = timestamppb.New(*source.ProcessedAt)
	}

	return pb
}
