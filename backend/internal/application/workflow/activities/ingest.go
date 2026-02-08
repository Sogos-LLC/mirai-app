package activities

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"

	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
	"github.com/sogos/mirai-backend/internal/infrastructure/rag"
)

// IngestDocumentInput is the input for the IngestDocument activity.
type IngestDocumentInput struct {
	Text       string            `json:"text"`
	SourceID   string            `json:"source_id"`
	SourceName string            `json:"source_name"`
	APIKey     string            `json:"api_key"`
	MimeType   string            `json:"mime_type"`
	Filename   string            `json:"filename"`
	Metadata   map[string]string `json:"metadata"`
}

// IngestDocumentOutput is the output from the IngestDocument activity.
type IngestDocumentOutput struct {
	ChunkCount int32 `json:"chunk_count"`
	TokenCount int32 `json:"token_count"`
}

// IngestDocument chunks a document, generates embeddings via Gemini, and upserts to Qdrant.
func (a *GoActivities) IngestDocument(ctx context.Context, input IngestDocumentInput) (*IngestDocumentOutput, error) {
	activity.RecordHeartbeat(ctx, "starting ingestion")
	logger := activity.GetLogger(ctx)

	if a.EmbeddingClient == nil {
		return nil, fmt.Errorf("embedding client not configured")
	}
	if a.QdrantClient == nil {
		return nil, fmt.Errorf("qdrant client not configured")
	}

	// Step 1: Structure-aware chunking
	activity.RecordHeartbeat(ctx, "chunking document")
	chunks := rag.ChunkDocument(input.Text, input.MimeType, input.Filename)
	if len(chunks) == 0 {
		logger.Warn("no chunks produced from document", "sourceID", input.SourceID)
		return &IngestDocumentOutput{ChunkCount: 0, TokenCount: 0}, nil
	}

	logger.Info("chunked document",
		"sourceID", input.SourceID,
		"sourceName", input.SourceName,
		"chunkCount", len(chunks),
	)

	// Step 2: Generate embeddings in batches with heartbeats
	batchSize := a.EmbeddingClient.BatchSize()
	allEmbeddings := make([][]float32, 0, len(chunks))

	for batchStart := 0; batchStart < len(chunks); batchStart += batchSize {
		batchEnd := batchStart + batchSize
		if batchEnd > len(chunks) {
			batchEnd = len(chunks)
		}

		activity.RecordHeartbeat(ctx, fmt.Sprintf("embedding chunks %d-%d/%d", batchStart+1, batchEnd, len(chunks)))

		texts := make([]string, batchEnd-batchStart)
		for i, chunk := range chunks[batchStart:batchEnd] {
			texts[i] = chunk.Content
		}

		embeddings, err := a.EmbeddingClient.EmbedDocuments(ctx, input.APIKey, texts)
		if err != nil {
			return nil, fmt.Errorf("embed batch %d-%d: %w", batchStart, batchEnd, err)
		}
		allEmbeddings = append(allEmbeddings, embeddings...)
	}

	// Step 3: Build Qdrant points with UUID5 IDs
	points := make([]vectordb.Point, len(chunks))
	for i, chunk := range chunks {
		pointID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(fmt.Sprintf("%s:%d", input.SourceID, i)))

		payload := map[string]interface{}{
			"content":         chunk.Content,
			"source_id":       input.SourceID,
			"source_name":     input.SourceName,
			"chunk_index":     i,
			"section_heading": chunk.SectionHeading,
		}
		for k, v := range input.Metadata {
			payload[k] = v
		}

		points[i] = vectordb.Point{
			ID:      pointID.String(),
			Vector:  allEmbeddings[i],
			Payload: payload,
		}

		if i > 0 && i%50 == 0 {
			activity.RecordHeartbeat(ctx, fmt.Sprintf("prepared %d/%d chunks", i, len(chunks)))
		}
	}

	// Step 4: Upsert to Qdrant in batches of 100
	activity.RecordHeartbeat(ctx, "storing in vector database")

	if err := a.QdrantClient.EnsureCollection(ctx, a.QdrantCollection, len(allEmbeddings[0])); err != nil {
		return nil, fmt.Errorf("ensure collection: %w", err)
	}

	upsertBatchSize := 100
	for batchStart := 0; batchStart < len(points); batchStart += upsertBatchSize {
		batchEnd := batchStart + upsertBatchSize
		if batchEnd > len(points) {
			batchEnd = len(points)
		}

		if err := a.QdrantClient.Upsert(ctx, a.QdrantCollection, points[batchStart:batchEnd]); err != nil {
			return nil, fmt.Errorf("upsert batch %d-%d: %w", batchStart, batchEnd, err)
		}

		activity.RecordHeartbeat(ctx, fmt.Sprintf("upserted %d/%d points", batchEnd, len(points)))
	}

	// Estimate token count (chars / 4 is a reasonable approximation)
	tokenCount := int32(len(input.Text) / 4)

	logger.Info("document ingested",
		"sourceID", input.SourceID,
		"chunks", len(chunks),
		"tokenCount", tokenCount,
	)

	return &IngestDocumentOutput{
		ChunkCount: int32(len(chunks)),
		TokenCount: tokenCount,
	}, nil
}
