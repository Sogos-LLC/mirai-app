package activities

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"
	"golang.org/x/sync/errgroup"

	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
	"github.com/sogos/mirai-backend/internal/infrastructure/rag"
)

const (
	embedBatchSize  = 20  // Gemini batchEmbedContents max
	embedConcurrency = 5  // concurrent embedding API calls
	upsertBatchSize = 100 // Qdrant upsert batch size
	upsertConcurrency = 3 // concurrent Qdrant upserts
	vectorDimensions = 3072 // Gemini embedding-001 output dimensions
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
	Collection string            `json:"collection"`
}

// IngestDocumentOutput is the output from the IngestDocument activity.
type IngestDocumentOutput struct {
	ChunkCount int32 `json:"chunk_count"`
	TokenCount int32 `json:"token_count"`
}

// IngestDocument chunks a document, generates embeddings via Gemini, and stores in Qdrant.
// This is a single combined activity to avoid passing large embedding vectors through Temporal payloads.
func (a *GoActivities) IngestDocument(ctx context.Context, input IngestDocumentInput) (*IngestDocumentOutput, error) {
	logger := activity.GetLogger(ctx)

	// Step 1: Chunk the document
	activity.RecordHeartbeat(ctx, "chunking document")
	chunks := rag.ChunkDocument(input.Text, input.MimeType, input.Filename)
	if len(chunks) == 0 {
		logger.Warn("no chunks produced from document", "sourceID", input.SourceID)
		return &IngestDocumentOutput{ChunkCount: 0, TokenCount: 0}, nil
	}
	logger.Info("chunked document", "sourceID", input.SourceID, "chunks", len(chunks))

	// Step 2: Ensure Qdrant collection exists
	activity.RecordHeartbeat(ctx, "ensuring vector collection")
	if err := a.QdrantClient.EnsureCollection(ctx, input.Collection, vectorDimensions); err != nil {
		return nil, fmt.Errorf("ensure collection: %w", err)
	}

	// Step 3: Generate embeddings concurrently in batches of 20
	activity.RecordHeartbeat(ctx, "generating embeddings")
	chunkTexts := make([]string, len(chunks))
	for i, c := range chunks {
		chunkTexts[i] = c.Content
	}

	allEmbeddings := make([][]float32, len(chunks))
	g, gctx := errgroup.WithContext(ctx)
	g.SetLimit(embedConcurrency)

	for batchStart := 0; batchStart < len(chunkTexts); batchStart += embedBatchSize {
		batchStart := batchStart
		batchEnd := batchStart + embedBatchSize
		if batchEnd > len(chunkTexts) {
			batchEnd = len(chunkTexts)
		}

		g.Go(func() error {
			batch := chunkTexts[batchStart:batchEnd]
			embeddings, err := a.EmbeddingClient.EmbedDocuments(gctx, input.APIKey, batch)
			if err != nil {
				return fmt.Errorf("embed batch %d-%d: %w", batchStart, batchEnd, err)
			}
			copy(allEmbeddings[batchStart:batchEnd], embeddings)
			activity.RecordHeartbeat(ctx, fmt.Sprintf("embedded chunks %d-%d/%d", batchStart+1, batchEnd, len(chunkTexts)))
			return nil
		})
	}
	if err := g.Wait(); err != nil {
		return nil, fmt.Errorf("embed documents: %w", err)
	}

	// Step 4: Build Qdrant points with UUID5 IDs (compatible with Python's uuid.uuid5)
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
	}

	// Step 5: Upsert to Qdrant concurrently in batches of 100
	activity.RecordHeartbeat(ctx, "storing in vector database")
	g2, gctx2 := errgroup.WithContext(ctx)
	g2.SetLimit(upsertConcurrency)

	for batchStart := 0; batchStart < len(points); batchStart += upsertBatchSize {
		batchStart := batchStart
		batchEnd := batchStart + upsertBatchSize
		if batchEnd > len(points) {
			batchEnd = len(points)
		}

		g2.Go(func() error {
			batch := points[batchStart:batchEnd]
			if err := a.QdrantClient.Upsert(gctx2, input.Collection, batch); err != nil {
				return fmt.Errorf("upsert batch %d-%d: %w", batchStart, batchEnd, err)
			}
			activity.RecordHeartbeat(ctx, fmt.Sprintf("stored chunks %d-%d/%d", batchStart+1, batchEnd, len(points)))
			return nil
		})
	}
	if err := g2.Wait(); err != nil {
		return nil, fmt.Errorf("upsert points: %w", err)
	}

	tokenCount := int32(len(input.Text) / 4)
	logger.Info("document ingested",
		"sourceID", input.SourceID,
		"chunks", len(chunks),
		"tokens", tokenCount,
	)

	return &IngestDocumentOutput{
		ChunkCount: int32(len(chunks)),
		TokenCount: tokenCount,
	}, nil
}
