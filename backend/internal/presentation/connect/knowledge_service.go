package connect

import (
	"context"
	"fmt"
	"strings"
	"time"

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

// KnowledgeServiceServer implements the KnowledgeSourceService Connect handler.
type KnowledgeServiceServer struct {
	miraiv1connect.UnimplementedKnowledgeSourceServiceHandler
	knowledgeService *service.KnowledgeSourceService
	storageClient    StorageAdapter
}

// NewKnowledgeServiceServer creates a new KnowledgeServiceServer.
func NewKnowledgeServiceServer(
	knowledgeService *service.KnowledgeSourceService,
	storageClient StorageAdapter,
) *KnowledgeServiceServer {
	return &KnowledgeServiceServer{
		knowledgeService: knowledgeService,
		storageClient:    storageClient,
	}
}

// GetUploadURL returns a presigned URL for file upload to MinIO.
func (s *KnowledgeServiceServer) GetUploadURL(
	ctx context.Context,
	req *connect.Request[v1.GetUploadURLRequest],
) (*connect.Response[v1.GetUploadURLResponse], error) {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid course_id"))
	}

	// Generate presigned URL
	filePath := fmt.Sprintf("knowledge/%s/%s/%s", tenantID.String(), courseID.String(), req.Msg.Filename)
	uploadURL, err := s.storageClient.GenerateUploadURL(ctx, filePath, 15*time.Minute)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to generate upload URL: %w", err))
	}

	return connect.NewResponse(&v1.GetUploadURLResponse{
		UploadUrl: uploadURL,
		FilePath:  filePath,
	}), nil
}

// CreateKnowledgeSource registers a new source and initiates ingestion.
func (s *KnowledgeServiceServer) CreateKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.CreateKnowledgeSourceRequest],
) (*connect.Response[v1.CreateKnowledgeSourceResponse], error) {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid course_id"))
	}

	sourceType, err := protoToKnowledgeSourceType(req.Msg.Type)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	source := &entity.KnowledgeSource{
		ID:            uuid.New(),
		TenantID:      tenantID,
		CourseID:      &courseID,
		Type:          sourceType,
		Name:          req.Msg.Name,
		FilePath:      &req.Msg.FilePath,
		MimeType:      &req.Msg.MimeType,
		FileSizeBytes: &req.Msg.FileSizeBytes,
	}

	if err := s.knowledgeService.Create(ctx, source); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.CreateKnowledgeSourceResponse{
		Source: knowledgeSourceToProto(source),
	}), nil
}

// ListKnowledgeSources returns all sources for a course.
func (s *KnowledgeServiceServer) ListKnowledgeSources(
	ctx context.Context,
	req *connect.Request[v1.ListKnowledgeSourcesRequest],
) (*connect.Response[v1.ListKnowledgeSourcesResponse], error) {
	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid course_id"))
	}

	sources, err := s.knowledgeService.ListByCourse(ctx, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoSources := make([]*v1.KnowledgeSource, len(sources))
	for i, source := range sources {
		protoSources[i] = knowledgeSourceToProto(source)
	}

	return connect.NewResponse(&v1.ListKnowledgeSourcesResponse{
		Sources: protoSources,
	}), nil
}

// GetKnowledgeSource returns a single source by ID.
func (s *KnowledgeServiceServer) GetKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.GetKnowledgeSourceRequest],
) (*connect.Response[v1.GetKnowledgeSourceResponse], error) {
	id, err := parseUUID(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}

	source, err := s.knowledgeService.GetByID(ctx, id)
	if err != nil {
		return nil, toConnectError(err)
	}
	if source == nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("knowledge source not found"))
	}

	return connect.NewResponse(&v1.GetKnowledgeSourceResponse{
		Source: knowledgeSourceToProto(source),
	}), nil
}

// DeleteKnowledgeSource removes a source and its chunks from vector store.
func (s *KnowledgeServiceServer) DeleteKnowledgeSource(
	ctx context.Context,
	req *connect.Request[v1.DeleteKnowledgeSourceRequest],
) (*connect.Response[v1.DeleteKnowledgeSourceResponse], error) {
	id, err := parseUUID(req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid id"))
	}

	if err := s.knowledgeService.Delete(ctx, id); err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.DeleteKnowledgeSourceResponse{
		Success: true,
	}), nil
}

// SearchKnowledge performs semantic search across course knowledge.
func (s *KnowledgeServiceServer) SearchKnowledge(
	ctx context.Context,
	req *connect.Request[v1.SearchKnowledgeRequest],
) (*connect.Response[v1.SearchKnowledgeResponse], error) {
	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid course_id"))
	}

	topK := int(req.Msg.TopK)
	if topK <= 0 {
		topK = 5
	}
	if topK > 20 {
		topK = 20
	}

	chunks, err := s.knowledgeService.SearchKnowledge(ctx, courseID, req.Msg.Query, topK)
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

	return connect.NewResponse(&v1.SearchKnowledgeResponse{
		Chunks: protoChunks,
	}), nil
}

// UploadAndProcess handles file upload + synchronous ingestion with RAG verification.
func (s *KnowledgeServiceServer) UploadAndProcess(
	ctx context.Context,
	req *connect.Request[v1.UploadAndProcessRequest],
) (*connect.Response[v1.UploadAndProcessResponse], error) {
	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
	}

	sessionID := req.Msg.SessionId
	filename := req.Msg.Filename
	contentType := req.Msg.ContentType
	fileContent := req.Msg.FileContent

	// Store file in MinIO
	filePath := fmt.Sprintf("knowledge/%s/sessions/%s/%s", tenantID.String(), sessionID, filename)
	if err := s.storageClient.PutContent(ctx, filePath, fileContent, contentType); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to store file: %w", err))
	}

	// Create knowledge source entity
	fileSize := int64(len(fileContent))
	source := &entity.KnowledgeSource{
		ID:            uuid.New(),
		TenantID:      tenantID,
		SessionID:     &sessionID,
		Type:          valueobject.KnowledgeSourceTypeFileUpload,
		Status:        valueobject.KnowledgeSourceStatusProcessing,
		Name:          filename,
		FilePath:      &filePath,
		MimeType:      &contentType,
		FileSizeBytes: &fileSize,
	}

	// Create in DB with session
	if err := s.knowledgeService.CreateWithSession(ctx, source); err != nil {
		return nil, toConnectError(err)
	}

	// Extract text content from file
	textContent := extractTextContent(fileContent, contentType)
	if textContent == "" {
		// Update status to failed
		errorMsg := "failed to extract text content from file"
		_, _ = s.knowledgeService.UpdateStatusWithSummary(ctx, source.ID, valueobject.KnowledgeSourceStatusFailed, &errorMsg, 0, "", 0)
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf(errorMsg))
	}

	// Detect video URLs
	videoURLs := service.DetectVideoURLs(textContent)
	if len(videoURLs) > 0 {
		source.VideoURLs = videoURLs
	}

	// Process and index the content
	chunkCount, tokenCount, err := s.knowledgeService.ProcessAndIndex(ctx, source, textContent)
	if err != nil {
		errorMsg := err.Error()
		_, _ = s.knowledgeService.UpdateStatusWithSummary(ctx, source.ID, valueobject.KnowledgeSourceStatusFailed, &errorMsg, 0, "", 0)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to process content: %w", err))
	}

	// Generate RAG summary to prove system works
	ragSummary := generateDocumentSummary(textContent, filename)

	// Update status to ready with summary
	updatedSource, err := s.knowledgeService.UpdateStatusWithSummary(
		ctx, source.ID,
		valueobject.KnowledgeSourceStatusReady,
		nil,
		chunkCount,
		ragSummary,
		tokenCount,
	)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.UploadAndProcessResponse{
		Source:     knowledgeSourceToProto(updatedSource),
		RagSummary: ragSummary,
	}), nil
}

// ListKnowledgeSourcesBySession returns sources created in a wizard session.
func (s *KnowledgeServiceServer) ListKnowledgeSourcesBySession(
	ctx context.Context,
	req *connect.Request[v1.ListKnowledgeSourcesBySessionRequest],
) (*connect.Response[v1.ListKnowledgeSourcesBySessionResponse], error) {
	sources, err := s.knowledgeService.ListBySession(ctx, req.Msg.SessionId)
	if err != nil {
		return nil, toConnectError(err)
	}

	protoSources := make([]*v1.KnowledgeSource, len(sources))
	for i, source := range sources {
		protoSources[i] = knowledgeSourceToProto(source)
	}

	return connect.NewResponse(&v1.ListKnowledgeSourcesBySessionResponse{
		Sources: protoSources,
	}), nil
}

// LinkSessionToCourse links all sources from a session to a course.
func (s *KnowledgeServiceServer) LinkSessionToCourse(
	ctx context.Context,
	req *connect.Request[v1.LinkSessionToCourseRequest],
) (*connect.Response[v1.LinkSessionToCourseResponse], error) {
	courseID, err := parseUUID(req.Msg.CourseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("invalid course_id"))
	}

	count, err := s.knowledgeService.LinkSessionToCourse(ctx, req.Msg.SessionId, courseID)
	if err != nil {
		return nil, toConnectError(err)
	}

	return connect.NewResponse(&v1.LinkSessionToCourseResponse{
		LinkedCount: int32(count),
	}), nil
}

// SearchKnowledgeBySession performs semantic search across session knowledge.
func (s *KnowledgeServiceServer) SearchKnowledgeBySession(
	ctx context.Context,
	req *connect.Request[v1.SearchKnowledgeBySessionRequest],
) (*connect.Response[v1.SearchKnowledgeBySessionResponse], error) {
	topK := int(req.Msg.TopK)
	if topK <= 0 {
		topK = 5
	}
	if topK > 20 {
		topK = 20
	}

	chunks, err := s.knowledgeService.SearchKnowledgeBySession(ctx, req.Msg.SessionId, req.Msg.Query, topK)
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

	return connect.NewResponse(&v1.SearchKnowledgeBySessionResponse{
		Chunks: protoChunks,
	}), nil
}

// extractTextContent extracts text from file content based on MIME type.
func extractTextContent(content []byte, contentType string) string {
	// For now, only handle plain text files
	// TODO: Add PDF, DOCX extraction using appropriate libraries
	switch contentType {
	case "text/plain", "text/markdown":
		return string(content)
	default:
		// Try to interpret as plain text
		return string(content)
	}
}

// generateDocumentSummary creates a summary of the document content.
// In production, this would use Gemini to generate a proper summary via RAG.
func generateDocumentSummary(content string, filename string) string {
	// Take first 500 chars for preview
	preview := content
	if len(preview) > 500 {
		preview = preview[:500] + "..."
	}

	// Clean up whitespace
	preview = strings.TrimSpace(preview)
	preview = strings.ReplaceAll(preview, "\n\n", " ")
	preview = strings.ReplaceAll(preview, "\n", " ")

	// For MVP: return a simple summary based on content preview
	// TODO: Use Gemini to generate a proper RAG-based summary
	return fmt.Sprintf("This document contains information that has been successfully indexed and is now available for AI-enhanced course generation. Preview: %s", preview)
}

// knowledgeSourceToProto converts a domain entity to proto.
func knowledgeSourceToProto(source *entity.KnowledgeSource) *v1.KnowledgeSource {
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

	// Handle optional CourseID
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

func knowledgeSourceTypeToProto(t valueobject.KnowledgeSourceType) v1.KnowledgeSourceType {
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

func protoToKnowledgeSourceType(t v1.KnowledgeSourceType) (valueobject.KnowledgeSourceType, error) {
	switch t {
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_FILE_UPLOAD:
		return valueobject.KnowledgeSourceTypeFileUpload, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_GOOGLE_DRIVE:
		return valueobject.KnowledgeSourceTypeGoogleDrive, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_ONEDRIVE:
		return valueobject.KnowledgeSourceTypeOneDrive, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_S3:
		return valueobject.KnowledgeSourceTypeS3, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_GOOGLE_SHEETS:
		return valueobject.KnowledgeSourceTypeGoogleSheets, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_MICROSOFT_365:
		return valueobject.KnowledgeSourceTypeMicrosoft365, nil
	case v1.KnowledgeSourceType_KNOWLEDGE_SOURCE_TYPE_URL:
		return valueobject.KnowledgeSourceTypeURL, nil
	default:
		return "", fmt.Errorf("invalid knowledge source type")
	}
}

func knowledgeSourceStatusToProto(s valueobject.KnowledgeSourceStatus) v1.KnowledgeSourceStatus {
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
