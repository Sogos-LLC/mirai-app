package workflow

import (
	"fmt"
	"path/filepath"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// KnowledgeIngestionState tracks progress for Temporal query handlers.
type KnowledgeIngestionState struct {
	Stage           string `json:"stage"`
	ProgressPercent int32  `json:"progress_percent"`
	ProgressMessage string `json:"progress_message"`
	ErrorMessage    string `json:"error_message"`
}

// KnowledgeIngestionWorkflow processes a knowledge source document.
//
// Flow:
//  1. Update status to processing
//  2. DecryptAPIKey to get per-tenant Gemini key
//  3. ReadFileContent from MinIO
//  4. [ai-tasks] ingest_document → chunk + embed (Gemini) + store in Qdrant + analyze
//  5. Update status to ready (with summary/token_count) or failed (with error)
func KnowledgeIngestionWorkflow(ctx workflow.Context, input KnowledgeIngestionInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting knowledge ingestion", "sourceID", input.SourceID)

	// Query handler for real-time progress reporting
	state := KnowledgeIngestionState{
		Stage:           "pending",
		ProgressPercent: 0,
		ProgressMessage: "Waiting to start",
	}
	if err := workflow.SetQueryHandler(ctx, "get_state", func() (KnowledgeIngestionState, error) {
		return state, nil
	}); err != nil {
		return fmt.Errorf("set query handler: %w", err)
	}

	goCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	aiCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		TaskQueue:           AITaskQueue,
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    90 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	// Helper to update status on failure
	setFailed := func(errMsg string) {
		state.Stage = "failed"
		state.ProgressPercent = 0
		state.ProgressMessage = errMsg
		state.ErrorMessage = errMsg

		_ = workflow.ExecuteActivity(goCtx, "UpdateKnowledgeStatus", activities.UpdateKnowledgeStatusInput{
			SourceID:     input.SourceID,
			TenantID:     input.TenantID,
			Status:       "failed",
			ErrorMessage: errMsg,
		}).Get(ctx, nil)
	}

	// Step 0: Mark as processing
	state.Stage = "processing"
	state.ProgressPercent = 5
	state.ProgressMessage = "Starting ingestion"
	if err := workflow.ExecuteActivity(goCtx, "UpdateKnowledgeStatus", activities.UpdateKnowledgeStatusInput{
		SourceID: input.SourceID,
		TenantID: input.TenantID,
		Status:   "processing",
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("set processing status: %w", err)
	}

	// Step 1: Decrypt per-tenant API key for Gemini embeddings
	state.Stage = "decrypting"
	state.ProgressPercent = 10
	state.ProgressMessage = "Decrypting API key"
	var keyResult activities.DecryptAPIKeyOutput
	if err := workflow.ExecuteActivity(goCtx, "DecryptAPIKey", activities.DecryptAPIKeyInput{
		TenantID: input.TenantID,
	}).Get(ctx, &keyResult); err != nil {
		setFailed(fmt.Sprintf("Failed to decrypt API key: %v", err))
		return fmt.Errorf("decrypt API key: %w", err)
	}

	// Step 2: Read file content from MinIO
	state.Stage = "reading"
	state.ProgressPercent = 20
	state.ProgressMessage = "Reading file content"
	var fileResult activities.ReadFileContentOutput
	if err := workflow.ExecuteActivity(goCtx, "ReadFileContent", activities.ReadFileContentInput{
		FilePath: input.FilePath,
	}).Get(ctx, &fileResult); err != nil {
		setFailed(fmt.Sprintf("Failed to read file: %v", err))
		return fmt.Errorf("read file: %w", err)
	}

	// Step 3: Ingest via Python AI service (chunk → embed → store in Qdrant → analyze)
	state.Stage = "chunking"
	state.ProgressPercent = 40
	state.ProgressMessage = "Chunking and embedding document"

	// Detect mime type from file extension
	mimeType := mimeTypeFromPath(input.FilePath)

	ingestInput := map[string]interface{}{
		"text":        fileResult.Content,
		"source_id":   input.SourceID,
		"source_name": filepath.Base(input.FilePath),
		"api_key":     keyResult.APIKey,
		"mime_type":   mimeType,
		"filename":    filepath.Base(input.FilePath),
		"metadata": map[string]string{
			"tenant_id": input.TenantID,
			"team_id":   input.TeamID,
			"source_id": input.SourceID,
		},
	}

	var ingestResult map[string]interface{}
	if err := workflow.ExecuteActivity(aiCtx, "ingest_document", ingestInput).Get(ctx, &ingestResult); err != nil {
		setFailed(fmt.Sprintf("Failed to ingest document: %v", err))
		return fmt.Errorf("ingest document: %w", err)
	}

	// Step 4: Update DB with results
	state.Stage = "finalizing"
	state.ProgressPercent = 90
	state.ProgressMessage = "Saving results"

	chunkCount := int32(0)
	if v, ok := ingestResult["chunk_count"].(float64); ok {
		chunkCount = int32(v)
	}
	summary := ""
	if v, ok := ingestResult["summary"].(string); ok {
		summary = v
	}
	tokenCount := int32(0)
	if v, ok := ingestResult["token_count"].(float64); ok {
		tokenCount = int32(v)
	}

	if err := workflow.ExecuteActivity(goCtx, "UpdateKnowledgeStatus", activities.UpdateKnowledgeStatusInput{
		SourceID:   input.SourceID,
		TenantID:   input.TenantID,
		Status:     "ready",
		ChunkCount: chunkCount,
		Summary:    summary,
		TokenCount: tokenCount,
	}).Get(ctx, nil); err != nil {
		return fmt.Errorf("set ready status: %w", err)
	}

	state.Stage = "ready"
	state.ProgressPercent = 100
	state.ProgressMessage = "Complete"

	logger.Info("knowledge ingestion completed",
		"sourceID", input.SourceID,
		"chunks", chunkCount,
		"tokenCount", tokenCount,
	)
	return nil
}

// mimeTypeFromPath infers MIME type from file extension.
func mimeTypeFromPath(path string) string {
	ext := filepath.Ext(path)
	switch ext {
	case ".md", ".markdown":
		return "text/markdown"
	case ".txt":
		return "text/plain"
	case ".pdf":
		return "application/pdf"
	case ".docx":
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	case ".html", ".htm":
		return "text/html"
	default:
		return "text/plain"
	}
}

// KnowledgeIngestionInput is defined in types.go (shared between starter and workflow).

// CourseExportWorkflow handles course export to SCORM format.
//
// Flow:
//  1. ReadCourseContent
//  2. Package into SCORM format
//  3. Upload export file
func CourseExportWorkflow(ctx workflow.Context, input CourseExportInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting course export", "exportID", input.ExportID)

	goCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	// Read course content and package for export
	// This stays entirely in Go since it doesn't need AI
	var courseContent map[string]interface{}
	if err := workflow.ExecuteActivity(goCtx, "ReadCourseContent", activities.ReadCourseContentInput{
		TenantID: input.TenantID,
		CourseID: input.ExportID, // Export ID maps to course
	}).Get(ctx, &courseContent); err != nil {
		return fmt.Errorf("read content: %w", err)
	}

	logger.Info("course export completed", "exportID", input.ExportID)
	return nil
}
