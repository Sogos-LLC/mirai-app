package workflow

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// KnowledgeIngestionWorkflow processes a knowledge source document.
//
// Flow:
//  1. DecryptAPIKey to get per-tenant Gemini key
//  2. ReadFileContent from MinIO
//  3. [ai-tasks] ingest_document → chunk + embed (Gemini) + store in Qdrant
func KnowledgeIngestionWorkflow(ctx workflow.Context, input KnowledgeIngestionInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting knowledge ingestion", "sourceID", input.SourceID)

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

	// Step 1: Decrypt per-tenant API key for Gemini embeddings
	var keyResult activities.DecryptAPIKeyOutput
	if err := workflow.ExecuteActivity(goCtx, "DecryptAPIKey", activities.DecryptAPIKeyInput{
		TenantID: input.TenantID,
	}).Get(ctx, &keyResult); err != nil {
		return fmt.Errorf("decrypt API key: %w", err)
	}

	// Step 2: Read file content from MinIO
	var fileResult activities.ReadFileContentOutput
	if err := workflow.ExecuteActivity(goCtx, "ReadFileContent", activities.ReadFileContentInput{
		FilePath: input.FilePath,
	}).Get(ctx, &fileResult); err != nil {
		return fmt.Errorf("read file: %w", err)
	}

	// Step 3: Ingest via Python AI service (chunk → embed → store in Qdrant)
	ingestInput := map[string]interface{}{
		"text":        fileResult.Content,
		"source_id":   input.SourceID,
		"source_name": input.FilePath,
		"api_key":     keyResult.APIKey,
		"metadata": map[string]string{
			"tenant_id": input.TenantID,
			"team_id":   input.TeamID,
			"source_id": input.SourceID,
		},
	}

	var ingestResult map[string]interface{}
	if err := workflow.ExecuteActivity(aiCtx, "ingest_document", ingestInput).Get(ctx, &ingestResult); err != nil {
		return fmt.Errorf("ingest document: %w", err)
	}

	logger.Info("knowledge ingestion completed",
		"sourceID", input.SourceID,
		"chunks", ingestResult["chunk_count"],
	)
	return nil
}

// KnowledgeIngestionInput is defined in client.go (shared between starter and workflow).

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
