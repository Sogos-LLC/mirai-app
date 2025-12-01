package service

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SMEIngestionService handles background processing of SME content submissions.
type SMEIngestionService struct {
	smeRepo          repository.SMERepository
	taskRepo         repository.SMETaskRepository
	submissionRepo   repository.SMESubmissionRepository
	knowledgeRepo    repository.SMEKnowledgeRepository
	jobRepo          repository.GenerationJobRepository
	aiSettingsRepo   repository.TenantAISettingsRepository
	storage          ContentStorage
	aiProvider       service.AIProvider
	notifier         NotificationSender
	logger           service.Logger
}

// ContentStorage abstracts file storage operations.
type ContentStorage interface {
	// GetContent retrieves file content from storage.
	GetContent(ctx context.Context, path string) ([]byte, error)

	// PutContent stores content to storage.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
}

// NotificationSender abstracts notification sending.
type NotificationSender interface {
	// SendNotification sends an in-app notification.
	SendNotification(ctx context.Context, notification *entity.Notification) error

	// SendEmail sends an email notification.
	SendEmail(ctx context.Context, to, subject, body string) error
}

// NewSMEIngestionService creates a new SME ingestion service.
func NewSMEIngestionService(
	smeRepo repository.SMERepository,
	taskRepo repository.SMETaskRepository,
	submissionRepo repository.SMESubmissionRepository,
	knowledgeRepo repository.SMEKnowledgeRepository,
	jobRepo repository.GenerationJobRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	storage ContentStorage,
	aiProvider service.AIProvider,
	notifier NotificationSender,
	logger service.Logger,
) *SMEIngestionService {
	return &SMEIngestionService{
		smeRepo:        smeRepo,
		taskRepo:       taskRepo,
		submissionRepo: submissionRepo,
		knowledgeRepo:  knowledgeRepo,
		jobRepo:        jobRepo,
		aiSettingsRepo: aiSettingsRepo,
		storage:        storage,
		aiProvider:     aiProvider,
		notifier:       notifier,
		logger:         logger,
	}
}

// ProcessNextJob polls for and processes the next pending ingestion job.
// Returns true if a job was processed, false if no jobs are pending.
func (s *SMEIngestionService) ProcessNextJob(ctx context.Context) (bool, error) {
	// Get next queued job
	job, err := s.jobRepo.GetNextQueued(ctx)
	if err != nil {
		return false, fmt.Errorf("failed to get next job: %w", err)
	}

	if job == nil {
		return false, nil
	}

	// Only process SME ingestion jobs
	if job.Type != valueobject.GenerationJobTypeSMEIngestion {
		return false, nil
	}

	// Process the job
	if err := s.processIngestionJob(ctx, job); err != nil {
		s.logger.Error("failed to process ingestion job", "jobID", job.ID, "error", err)
		return true, err
	}

	return true, nil
}

// processIngestionJob processes a single SME content ingestion job.
func (s *SMEIngestionService) processIngestionJob(ctx context.Context, job *entity.GenerationJob) error {
	log := s.logger.With("jobID", job.ID, "submissionID", job.SubmissionID)

	// Mark job as processing
	now := time.Now()
	job.Status = valueobject.GenerationJobStatusProcessing
	job.StartedAt = &now
	progressMsg := "Loading submission..."
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		return fmt.Errorf("failed to update job status: %w", err)
	}

	// Get submission
	if job.SubmissionID == nil {
		return s.failJob(ctx, job, "no submission ID")
	}

	submission, err := s.submissionRepo.GetByID(ctx, *job.SubmissionID)
	if err != nil || submission == nil {
		return s.failJob(ctx, job, "submission not found")
	}

	// Get task to find SME
	task, err := s.taskRepo.GetByID(ctx, submission.TaskID)
	if err != nil || task == nil {
		return s.failJob(ctx, job, "task not found")
	}

	// Get SME
	sme, err := s.smeRepo.GetByID(ctx, task.SMEID)
	if err != nil || sme == nil {
		return s.failJob(ctx, job, "SME not found")
	}

	// Update progress
	job.ProgressPercent = 10
	progressMsg = "Extracting content..."
	job.ProgressMessage = &progressMsg
	_ = s.jobRepo.Update(ctx, job)

	// Get file content from storage
	content, err := s.storage.GetContent(ctx, submission.FilePath)
	if err != nil {
		log.Error("failed to get file content", "path", submission.FilePath, "error", err)
		return s.failJob(ctx, job, "failed to retrieve file content")
	}

	// Extract text based on content type
	extractedText, err := s.extractText(submission.ContentType, content)
	if err != nil {
		log.Error("failed to extract text", "contentType", submission.ContentType, "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("failed to extract text: %v", err))
	}

	// Update submission with extracted text
	submission.ExtractedText = &extractedText
	if err := s.submissionRepo.Update(ctx, submission); err != nil {
		log.Warn("failed to save extracted text", "error", err)
	}

	// Update progress
	job.ProgressPercent = 30
	progressMsg = "Processing with AI..."
	job.ProgressMessage = &progressMsg
	_ = s.jobRepo.Update(ctx, job)

	// Process with AI
	result, err := s.aiProvider.ProcessSMEContent(ctx, service.ProcessSMEContentRequest{
		SMEName:       sme.Name,
		SMEDomain:     sme.Domain,
		ExtractedText: extractedText,
	})
	if err != nil {
		log.Error("AI processing failed", "error", err)
		return s.failJob(ctx, job, fmt.Sprintf("AI processing failed: %v", err))
	}

	job.TokensUsed = result.TokensUsed

	// Update progress
	job.ProgressPercent = 70
	progressMsg = "Storing knowledge..."
	job.ProgressMessage = &progressMsg
	_ = s.jobRepo.Update(ctx, job)

	// Update submission with AI summary
	submission.AISummary = &result.Summary
	processedAt := time.Now()
	submission.ProcessedAt = &processedAt
	if err := s.submissionRepo.Update(ctx, submission); err != nil {
		log.Warn("failed to save AI summary", "error", err)
	}

	// Create knowledge chunks
	for _, chunkResult := range result.Chunks {
		chunk := &entity.SMEKnowledgeChunk{
			ID:             uuid.New(),
			TenantID:       job.TenantID,
			SMEID:          sme.ID,
			SubmissionID:   &submission.ID,
			Content:        chunkResult.Content,
			Topic:          chunkResult.Topic,
			Keywords:       chunkResult.Keywords,
			RelevanceScore: chunkResult.RelevanceScore,
			CreatedAt:      time.Now(),
		}

		if err := s.knowledgeRepo.Create(ctx, chunk); err != nil {
			log.Warn("failed to create knowledge chunk", "error", err)
		}
	}

	// Update SME with aggregated knowledge summary
	if err := s.updateSMEKnowledge(ctx, sme, result.Summary); err != nil {
		log.Warn("failed to update SME knowledge", "error", err)
	}

	// Update task status
	task.Status = valueobject.SMETaskStatusCompleted
	completedAt := time.Now()
	task.CompletedAt = &completedAt
	if err := s.taskRepo.Update(ctx, task); err != nil {
		log.Warn("failed to update task status", "error", err)
	}

	// Update SME status
	sme.Status = valueobject.SMEStatusActive
	if err := s.smeRepo.Update(ctx, sme); err != nil {
		log.Warn("failed to update SME status", "error", err)
	}

	// Update token usage
	_ = s.aiSettingsRepo.IncrementTokenUsage(ctx, job.TenantID, result.TokensUsed)

	// Complete the job
	job.Status = valueobject.GenerationJobStatusCompleted
	job.ProgressPercent = 100
	job.CompletedAt = &processedAt
	progressMsg = "Ingestion complete"
	job.ProgressMessage = &progressMsg
	if err := s.jobRepo.Update(ctx, job); err != nil {
		log.Error("failed to mark job as completed", "error", err)
	}

	// Send notification
	s.sendCompletionNotification(ctx, job, sme, task)

	log.Info("ingestion completed", "tokensUsed", result.TokensUsed, "chunksCreated", len(result.Chunks))
	return nil
}

// CreateIngestionJob creates a new SME content ingestion job.
func (s *SMEIngestionService) CreateIngestionJob(ctx context.Context, tenantID, submissionID, taskID, userID uuid.UUID) (*entity.GenerationJob, error) {
	log := s.logger.With("submissionID", submissionID, "taskID", taskID)

	job := &entity.GenerationJob{
		ID:              uuid.New(),
		TenantID:        tenantID,
		Type:            valueobject.GenerationJobTypeSMEIngestion,
		Status:          valueobject.GenerationJobStatusQueued,
		SubmissionID:    &submissionID,
		SMETaskID:       &taskID,
		ProgressPercent: 0,
		MaxRetries:      3,
		CreatedByUserID: userID,
		CreatedAt:       time.Now(),
	}

	if err := s.jobRepo.Create(ctx, job); err != nil {
		log.Error("failed to create ingestion job", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("ingestion job created", "jobID", job.ID)
	return job, nil
}

// extractText extracts text from various file formats.
func (s *SMEIngestionService) extractText(contentType valueobject.ContentType, content []byte) (string, error) {
	switch contentType {
	case valueobject.ContentTypeText:
		return string(content), nil

	case valueobject.ContentTypeDocument:
		// For MVP, we'll extract raw text. In production, use a PDF/docx library.
		// Check if content looks like PDF by magic bytes
		if len(content) > 4 && string(content[:4]) == "%PDF" {
			return s.extractPDFText(content)
		}
		// Otherwise treat as plain text (docx, txt, etc.)
		return string(content), nil

	case valueobject.ContentTypeAudio, valueobject.ContentTypeVideo:
		// Audio/video would require transcription service
		return "", fmt.Errorf("audio/video transcription not yet supported")

	default:
		// Try to extract as plain text
		return string(content), nil
	}
}

// extractPDFText extracts text from PDF content.
// This is a placeholder - in production, use a proper PDF library.
func (s *SMEIngestionService) extractPDFText(content []byte) (string, error) {
	// For MVP, we'll return an error indicating PDF processing needs implementation
	// In production, use pdfcpu or similar library
	return "", fmt.Errorf("PDF text extraction requires additional implementation")
}

// updateSMEKnowledge updates the SME's aggregated knowledge summary.
func (s *SMEIngestionService) updateSMEKnowledge(ctx context.Context, sme *entity.SubjectMatterExpert, newSummary string) error {
	// For MVP, just append the new summary
	if sme.KnowledgeSummary == nil {
		sme.KnowledgeSummary = &newSummary
	} else {
		combined := *sme.KnowledgeSummary + "\n\n---\n\n" + newSummary
		sme.KnowledgeSummary = &combined
	}

	sme.UpdatedAt = time.Now()
	return s.smeRepo.Update(ctx, sme)
}

// sendCompletionNotification sends notifications when ingestion completes.
func (s *SMEIngestionService) sendCompletionNotification(ctx context.Context, job *entity.GenerationJob, sme *entity.SubjectMatterExpert, task *entity.SMETask) {
	if s.notifier == nil {
		return
	}

	// Create in-app notification
	notification := &entity.Notification{
		ID:       uuid.New(),
		TenantID: job.TenantID,
		UserID:   task.AssignedByUserID,
		Type:     valueobject.NotificationTypeIngestionComplete,
		Priority: valueobject.NotificationPriorityNormal,
		Title:    "Content Ingestion Complete",
		Message:  fmt.Sprintf("Content for '%s' has been processed and added to %s.", task.Title, sme.Name),
		SMEID:    &sme.ID,
		TaskID:   &task.ID,
		Read:     false,
		CreatedAt: time.Now(),
	}

	if err := s.notifier.SendNotification(ctx, notification); err != nil {
		s.logger.Warn("failed to send completion notification", "error", err)
	}
}

// failJob marks a job as failed with an error message.
func (s *SMEIngestionService) failJob(ctx context.Context, job *entity.GenerationJob, errMsg string) error {
	job.Status = valueobject.GenerationJobStatusFailed
	job.ErrorMessage = &errMsg
	now := time.Now()
	job.CompletedAt = &now

	// Retry logic
	if job.RetryCount < job.MaxRetries {
		job.RetryCount++
		job.Status = valueobject.GenerationJobStatusQueued
		job.StartedAt = nil
		job.CompletedAt = nil
		retryMsg := fmt.Sprintf("Retry %d/%d: %s", job.RetryCount, job.MaxRetries, errMsg)
		job.ProgressMessage = &retryMsg
		s.logger.Info("retrying failed job", "jobID", job.ID, "retry", job.RetryCount)
	}

	if err := s.jobRepo.Update(ctx, job); err != nil {
		s.logger.Error("failed to update job status", "jobID", job.ID, "error", err)
	}

	// If final failure, send notification
	if job.Status == valueobject.GenerationJobStatusFailed {
		s.sendFailureNotification(ctx, job, errMsg)
	}

	return fmt.Errorf(errMsg)
}

// sendFailureNotification sends notifications when ingestion fails.
func (s *SMEIngestionService) sendFailureNotification(ctx context.Context, job *entity.GenerationJob, errMsg string) {
	if s.notifier == nil {
		return
	}

	notification := &entity.Notification{
		ID:       uuid.New(),
		TenantID: job.TenantID,
		UserID:   job.CreatedByUserID,
		Type:     valueobject.NotificationTypeIngestionFailed,
		Priority: valueobject.NotificationPriorityHigh,
		Title:    "Content Ingestion Failed",
		Message:  fmt.Sprintf("Content ingestion failed: %s", errMsg),
		JobID:    &job.ID,
		Read:     false,
		CreatedAt: time.Now(),
	}

	if err := s.notifier.SendNotification(ctx, notification); err != nil {
		s.logger.Warn("failed to send failure notification", "error", err)
	}
}

// Worker runs the ingestion worker loop.
type IngestionWorker struct {
	service      *SMEIngestionService
	pollInterval time.Duration
	logger       service.Logger
}

// NewIngestionWorker creates a new ingestion worker.
func NewIngestionWorker(service *SMEIngestionService, pollInterval time.Duration, logger service.Logger) *IngestionWorker {
	return &IngestionWorker{
		service:      service,
		pollInterval: pollInterval,
		logger:       logger,
	}
}

// Run starts the worker loop.
func (w *IngestionWorker) Run(ctx context.Context) {
	w.logger.Info("starting ingestion worker", "pollInterval", w.pollInterval)

	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			w.logger.Info("ingestion worker stopped")
			return
		case <-ticker.C:
			processed, err := w.service.ProcessNextJob(ctx)
			if err != nil {
				w.logger.Error("error processing job", "error", err)
			}
			if processed {
				w.logger.Debug("processed ingestion job")
			}
		}
	}
}

// StoredKnowledge represents knowledge stored in S3.
type StoredKnowledge struct {
	Summary string                `json:"summary"`
	Chunks  []StoredKnowledgeChunk `json:"chunks"`
}

// StoredKnowledgeChunk represents a knowledge chunk in storage.
type StoredKnowledgeChunk struct {
	ID             string   `json:"id"`
	Content        string   `json:"content"`
	Topic          string   `json:"topic"`
	Keywords       []string `json:"keywords"`
	RelevanceScore float32  `json:"relevance_score"`
}

// StoreKnowledgeToS3 stores processed knowledge to S3.
func (s *SMEIngestionService) StoreKnowledgeToS3(ctx context.Context, sme *entity.SubjectMatterExpert, summary string, chunks []service.SMEChunkResult) error {
	stored := StoredKnowledge{
		Summary: summary,
		Chunks:  make([]StoredKnowledgeChunk, len(chunks)),
	}

	for i, chunk := range chunks {
		stored.Chunks[i] = StoredKnowledgeChunk{
			ID:             uuid.New().String(),
			Content:        chunk.Content,
			Topic:          chunk.Topic,
			Keywords:       chunk.Keywords,
			RelevanceScore: chunk.RelevanceScore,
		}
	}

	data, err := json.Marshal(stored)
	if err != nil {
		return fmt.Errorf("failed to marshal knowledge: %w", err)
	}

	path := fmt.Sprintf("tenants/%s/sme/%s/processed/knowledge.json", sme.TenantID, sme.ID)
	if err := s.storage.PutContent(ctx, path, data, "application/json"); err != nil {
		return fmt.Errorf("failed to store knowledge: %w", err)
	}

	// Update SME with storage path
	sme.KnowledgeContentPath = &path
	return s.smeRepo.Update(ctx, sme)
}
