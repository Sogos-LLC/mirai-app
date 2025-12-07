package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SMERepository implements repository.SMERepository using sqlc-generated code.
type SMERepository struct {
	db *sql.DB
}

// NewSMERepository creates a new sqlc-based SME repository.
func NewSMERepository(db *sql.DB) repository.SMERepository {
	return &SMERepository{db: db}
}

// Create creates a new SME.
func (r *SMERepository) Create(ctx context.Context, sme *entity.SubjectMatterExpert) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SubjectMatterExpert, error) {
		return q.CreateSME(ctx, gen.CreateSMEParams{
			TenantID:             sme.TenantID,
			CompanyID:            sme.CompanyID,
			Name:                 sme.Name,
			Description:          stringToNullString(sme.Description),
			Domain:               sme.Domain,
			Scope:                toSmeScope(sme.Scope.String()),
			Status:               toSmeStatus(sme.Status.String()),
			KnowledgeSummary:     toNullString(sme.KnowledgeSummary),
			KnowledgeContentPath: toNullString(sme.KnowledgeContentPath),
			CreatedByUserID:      sme.CreatedByUserID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create SME: %w", err)
	}

	sme.ID = result.ID
	sme.CreatedAt = result.CreatedAt
	sme.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves an SME by its ID.
func (r *SMERepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SubjectMatterExpert, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SubjectMatterExpert, error) {
		return q.GetSMEByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get SME: %w", err)
	}

	sme := toSMEEntity(&result)

	// Load team IDs if team-scoped
	if sme.Scope == valueobject.SMEScopeTeam {
		teamIDs, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]uuid.UUID, error) {
			return q.ListSMETeamIDsBySMEID(ctx, id)
		})
		if err != nil {
			return nil, fmt.Errorf("failed to get team IDs: %w", err)
		}
		sme.TeamIDs = teamIDs
	}

	return sme, nil
}

// List retrieves SMEs with optional filtering.
func (r *SMERepository) List(ctx context.Context, opts entity.SMEListOptions) ([]*entity.SubjectMatterExpert, error) {
	var scopeStr sql.NullString
	var statusStr sql.NullString
	if opts.Scope != nil {
		scopeStr = sql.NullString{String: opts.Scope.String(), Valid: true}
	}
	if opts.Status != nil {
		statusStr = sql.NullString{String: opts.Status.String(), Valid: true}
	}

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SubjectMatterExpert, error) {
		return q.ListSMEs(ctx, gen.ListSMEsParams{
			Scope:  scopeStr,
			Status: statusStr,
			TeamID: toNullUUID(opts.TeamID),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list SMEs: %w", err)
	}

	smes := make([]*entity.SubjectMatterExpert, len(results))
	for i := range results {
		smes[i] = toSMEEntity(&results[i])
	}
	return smes, nil
}

// Update updates an SME.
func (r *SMERepository) Update(ctx context.Context, sme *entity.SubjectMatterExpert) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SubjectMatterExpert, error) {
		return q.UpdateSME(ctx, gen.UpdateSMEParams{
			Name:                 sme.Name,
			Description:          stringToNullString(sme.Description),
			Domain:               sme.Domain,
			Scope:                toSmeScope(sme.Scope.String()),
			Status:               toSmeStatus(sme.Status.String()),
			KnowledgeSummary:     toNullString(sme.KnowledgeSummary),
			KnowledgeContentPath: toNullString(sme.KnowledgeContentPath),
			ID:                   sme.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update SME: %w", err)
	}

	sme.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes an SME.
func (r *SMERepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteSME(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete SME: %w", err)
	}
	return nil
}

// AddTeamAccess adds team access for a team-scoped SME.
func (r *SMERepository) AddTeamAccess(ctx context.Context, access *entity.SMETeamAccess) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTeamAccess, error) {
		return q.AddSMETeamAccess(ctx, gen.AddSMETeamAccessParams{
			TenantID: access.TenantID,
			SmeID:    access.SMEID,
			TeamID:   access.TeamID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to add team access: %w", err)
	}

	access.ID = result.ID
	access.CreatedAt = result.CreatedAt
	return nil
}

// RemoveTeamAccess removes team access.
func (r *SMERepository) RemoveTeamAccess(ctx context.Context, smeID, teamID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.RemoveSMETeamAccess(ctx, gen.RemoveSMETeamAccessParams{
			SmeID:  smeID,
			TeamID: teamID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to remove team access: %w", err)
	}
	return nil
}

// ListTeamAccess lists team access for an SME.
func (r *SMERepository) ListTeamAccess(ctx context.Context, smeID uuid.UUID) ([]*entity.SMETeamAccess, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SmeTeamAccess, error) {
		return q.ListSMETeamAccess(ctx, smeID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list team access: %w", err)
	}

	accesses := make([]*entity.SMETeamAccess, len(results))
	for i := range results {
		accesses[i] = &entity.SMETeamAccess{
			ID:        results[i].ID,
			TenantID:  results[i].TenantID,
			SMEID:     results[i].SmeID,
			TeamID:    results[i].TeamID,
			CreatedAt: results[i].CreatedAt,
		}
	}
	return accesses, nil
}

func toSMEEntity(s *gen.SubjectMatterExpert) *entity.SubjectMatterExpert {
	scope, _ := valueobject.ParseSMEScope(string(s.Scope))
	status, _ := valueobject.ParseSMEStatus(string(s.Status))
	return &entity.SubjectMatterExpert{
		ID:                   s.ID,
		TenantID:             s.TenantID,
		CompanyID:            s.CompanyID,
		Name:                 s.Name,
		Description:          fromNullString(s.Description),
		Domain:               s.Domain,
		Scope:                scope,
		Status:               status,
		KnowledgeSummary:     fromNullStringPtr(s.KnowledgeSummary),
		KnowledgeContentPath: fromNullStringPtr(s.KnowledgeContentPath),
		CreatedByUserID:      s.CreatedByUserID,
		CreatedAt:            s.CreatedAt,
		UpdatedAt:            s.UpdatedAt,
	}
}

// =============================================================================
// SME Task Repository
// =============================================================================

// SMETaskRepository implements repository.SMETaskRepository using sqlc-generated code.
type SMETaskRepository struct {
	db *sql.DB
}

// NewSMETaskRepository creates a new sqlc-based SME task repository.
func NewSMETaskRepository(db *sql.DB) repository.SMETaskRepository {
	return &SMETaskRepository{db: db}
}

// Create creates a new task.
func (r *SMETaskRepository) Create(ctx context.Context, task *entity.SMETask) error {
	var contentType *string
	if task.ExpectedContentType != nil {
		s := task.ExpectedContentType.String()
		contentType = &s
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTask, error) {
		return q.CreateSMETask(ctx, gen.CreateSMETaskParams{
			TenantID:            task.TenantID,
			SmeID:               task.SMEID,
			Title:               task.Title,
			Description:         stringToNullString(task.Description),
			ExpectedContentType: toNullSmeContentType(contentType),
			AssignedToUserID:    task.AssignedToUserID,
			AssignedByUserID:    task.AssignedByUserID,
			TeamID:              toNullUUID(task.TeamID),
			Status:              toSmeTaskStatus(task.Status.String()),
			DueDate:             toDoublePointerTime(task.DueDate),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create task: %w", err)
	}

	task.ID = result.ID
	task.CreatedAt = result.CreatedAt
	task.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a task by its ID.
func (r *SMETaskRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETask, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTask, error) {
		return q.GetSMETaskByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get task: %w", err)
	}
	return toSMETaskEntity(&result), nil
}

// List retrieves tasks with optional filtering.
func (r *SMETaskRepository) List(ctx context.Context, opts entity.SMETaskListOptions) ([]*entity.SMETask, error) {
	var statusStr sql.NullString
	if opts.Status != nil {
		statusStr = sql.NullString{String: opts.Status.String(), Valid: true}
	}

	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SmeTask, error) {
		return q.ListSMETasks(ctx, gen.ListSMETasksParams{
			SmeID:            toNullUUID(opts.SMEID),
			AssignedToUserID: toNullUUID(opts.AssignedToUserID),
			Status:           statusStr,
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list tasks: %w", err)
	}

	tasks := make([]*entity.SMETask, len(results))
	for i := range results {
		tasks[i] = toSMETaskEntity(&results[i])
	}
	return tasks, nil
}

// Update updates a task.
func (r *SMETaskRepository) Update(ctx context.Context, task *entity.SMETask) error {
	var contentType gen.NullSmeContentType
	if task.ExpectedContentType != nil {
		contentType = gen.NullSmeContentType{SmeContentType: toSmeContentType(task.ExpectedContentType.String()), Valid: true}
	}

	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTask, error) {
		return q.UpdateSMETask(ctx, gen.UpdateSMETaskParams{
			Title:               task.Title,
			Description:         stringToNullString(task.Description),
			ExpectedContentType: contentType,
			DueDate:             toDoublePointerTime(task.DueDate),
			Status:              toSmeTaskStatus(task.Status.String()),
			CompletedAt:         toDoublePointerTime(task.CompletedAt),
			ID:                  task.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update task: %w", err)
	}

	task.UpdatedAt = result.UpdatedAt
	return nil
}

// Cancel cancels a pending task.
func (r *SMETaskRepository) Cancel(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.CancelSMETask(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to cancel task: %w", err)
	}
	return nil
}

// Delete permanently deletes a task.
func (r *SMETaskRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteSMETask(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}
	return nil
}

func toSMETaskEntity(t *gen.SmeTask) *entity.SMETask {
	status, _ := valueobject.ParseSMETaskStatus(string(t.Status))
	task := &entity.SMETask{
		ID:               t.ID,
		TenantID:         t.TenantID,
		SMEID:            t.SmeID,
		Title:            t.Title,
		Description:      fromNullString(t.Description),
		AssignedToUserID: t.AssignedToUserID,
		AssignedByUserID: t.AssignedByUserID,
		TeamID:           fromNullUUIDPtr(t.TeamID),
		Status:           status,
		DueDate:          fromDoublePointerTime(t.DueDate),
		CreatedAt:        t.CreatedAt,
		UpdatedAt:        t.UpdatedAt,
		CompletedAt:      fromDoublePointerTime(t.CompletedAt),
	}
	if t.ExpectedContentType.Valid {
		ct, _ := valueobject.ParseContentType(string(t.ExpectedContentType.SmeContentType))
		task.ExpectedContentType = &ct
	}
	return task
}

// =============================================================================
// SME Submission Repository
// =============================================================================

// SMESubmissionRepository implements repository.SMESubmissionRepository using sqlc-generated code.
type SMESubmissionRepository struct {
	db *sql.DB
}

// NewSMESubmissionRepository creates a new sqlc-based SME submission repository.
func NewSMESubmissionRepository(db *sql.DB) repository.SMESubmissionRepository {
	return &SMESubmissionRepository{db: db}
}

// Create creates a new submission.
func (r *SMESubmissionRepository) Create(ctx context.Context, submission *entity.SMETaskSubmission) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTaskSubmission, error) {
		return q.CreateSMESubmission(ctx, gen.CreateSMESubmissionParams{
			TenantID:          submission.TenantID,
			TaskID:            submission.TaskID,
			FileName:          submission.FileName,
			FilePath:          submission.FilePath,
			ContentType:       toSmeContentType(submission.ContentType.String()),
			FileSizeBytes:     submission.FileSizeBytes,
			ExtractedText:     toNullString(submission.ExtractedText),
			SubmittedByUserID: submission.SubmittedByUserID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create submission: %w", err)
	}

	submission.ID = result.ID
	submission.SubmittedAt = result.SubmittedAt
	return nil
}

// GetByID retrieves a submission by its ID.
func (r *SMESubmissionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETaskSubmission, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeTaskSubmission, error) {
		return q.GetSMESubmissionByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get submission: %w", err)
	}
	return toSMESubmissionEntity(&result), nil
}

// ListByTaskID retrieves all submissions for a task.
func (r *SMESubmissionRepository) ListByTaskID(ctx context.Context, taskID uuid.UUID) ([]*entity.SMETaskSubmission, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SmeTaskSubmission, error) {
		return q.ListSMESubmissionsByTaskID(ctx, taskID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list submissions: %w", err)
	}

	submissions := make([]*entity.SMETaskSubmission, len(results))
	for i := range results {
		submissions[i] = toSMESubmissionEntity(&results[i])
	}
	return submissions, nil
}

// Update updates a submission.
func (r *SMESubmissionRepository) Update(ctx context.Context, submission *entity.SMETaskSubmission) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateSMESubmission(ctx, gen.UpdateSMESubmissionParams{
			ExtractedText:    toNullString(submission.ExtractedText),
			AiSummary:        toNullString(submission.AISummary),
			IngestionError:   toNullString(submission.IngestionError),
			ProcessedAt:      toDoublePointerTime(submission.ProcessedAt),
			ReviewerNotes:    toNullString(submission.ReviewerNotes),
			ApprovedContent:  toNullString(submission.ApprovedContent),
			IsApproved:       submission.IsApproved,
			ApprovedAt:       toDoublePointerTime(submission.ApprovedAt),
			ApprovedByUserID: toNullUUID(submission.ApprovedByUserID),
			ID:               submission.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update submission: %w", err)
	}
	return nil
}

func toSMESubmissionEntity(s *gen.SmeTaskSubmission) *entity.SMETaskSubmission {
	contentType, _ := valueobject.ParseContentType(string(s.ContentType))
	return &entity.SMETaskSubmission{
		ID:                s.ID,
		TenantID:          s.TenantID,
		TaskID:            s.TaskID,
		FileName:          s.FileName,
		FilePath:          s.FilePath,
		ContentType:       contentType,
		FileSizeBytes:     s.FileSizeBytes,
		ExtractedText:     fromNullStringPtr(s.ExtractedText),
		AISummary:         fromNullStringPtr(s.AiSummary),
		IngestionError:    fromNullStringPtr(s.IngestionError),
		SubmittedByUserID: s.SubmittedByUserID,
		SubmittedAt:       s.SubmittedAt,
		ProcessedAt:       fromDoublePointerTime(s.ProcessedAt),
		ReviewerNotes:     fromNullStringPtr(s.ReviewerNotes),
		ApprovedContent:   fromNullStringPtr(s.ApprovedContent),
		IsApproved:        s.IsApproved,
		ApprovedAt:        fromDoublePointerTime(s.ApprovedAt),
		ApprovedByUserID:  fromNullUUIDPtr(s.ApprovedByUserID),
	}
}

// =============================================================================
// SME Knowledge Repository
// =============================================================================

// SMEKnowledgeRepository implements repository.SMEKnowledgeRepository using sqlc-generated code.
type SMEKnowledgeRepository struct {
	db *sql.DB
}

// NewSMEKnowledgeRepository creates a new sqlc-based SME knowledge repository.
func NewSMEKnowledgeRepository(db *sql.DB) repository.SMEKnowledgeRepository {
	return &SMEKnowledgeRepository{db: db}
}

// Create creates a new knowledge chunk.
func (r *SMEKnowledgeRepository) Create(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeKnowledgeChunk, error) {
		return q.CreateSMEKnowledgeChunk(ctx, gen.CreateSMEKnowledgeChunkParams{
			TenantID:       chunk.TenantID,
			SmeID:          chunk.SMEID,
			SubmissionID:   toNullUUID(chunk.SubmissionID),
			Content:        chunk.Content,
			Topic:          chunk.Topic,
			Keywords:       chunk.Keywords,
			RelevanceScore: chunk.RelevanceScore,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create knowledge chunk: %w", err)
	}

	chunk.ID = result.ID
	chunk.CreatedAt = result.CreatedAt
	return nil
}

// GetByID retrieves a chunk by its ID.
func (r *SMEKnowledgeRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMEKnowledgeChunk, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.SmeKnowledgeChunk, error) {
		return q.GetSMEKnowledgeChunkByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get knowledge chunk: %w", err)
	}
	return toSMEKnowledgeChunkEntity(&result), nil
}

// ListBySMEID retrieves all chunks for an SME.
func (r *SMEKnowledgeRepository) ListBySMEID(ctx context.Context, smeID uuid.UUID) ([]*entity.SMEKnowledgeChunk, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SmeKnowledgeChunk, error) {
		return q.ListSMEKnowledgeChunksBySMEID(ctx, smeID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list knowledge chunks: %w", err)
	}

	chunks := make([]*entity.SMEKnowledgeChunk, len(results))
	for i := range results {
		chunks[i] = toSMEKnowledgeChunkEntity(&results[i])
	}
	return chunks, nil
}

// Search searches knowledge across SMEs.
func (r *SMEKnowledgeRepository) Search(ctx context.Context, smeIDs []uuid.UUID, query string, limit int) ([]*entity.SMEKnowledgeChunk, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.SmeKnowledgeChunk, error) {
		return q.SearchSMEKnowledgeChunks(ctx, gen.SearchSMEKnowledgeChunksParams{
			SmeIds:     smeIDs,
			Query:      stringToNullString(query),
			LimitCount: int32(limit),
		})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to search knowledge chunks: %w", err)
	}

	chunks := make([]*entity.SMEKnowledgeChunk, len(results))
	for i := range results {
		chunks[i] = toSMEKnowledgeChunkEntity(&results[i])
	}
	return chunks, nil
}

// Update updates a knowledge chunk.
func (r *SMEKnowledgeRepository) Update(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.UpdateSMEKnowledgeChunk(ctx, gen.UpdateSMEKnowledgeChunkParams{
			Content:  chunk.Content,
			Topic:    chunk.Topic,
			Keywords: chunk.Keywords,
			ID:       chunk.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update knowledge chunk: %w", err)
	}
	return nil
}

// DeleteBySMEID deletes all chunks for an SME.
func (r *SMEKnowledgeRepository) DeleteBySMEID(ctx context.Context, smeID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteSMEKnowledgeChunksBySMEID(ctx, smeID)
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge chunks: %w", err)
	}
	return nil
}

// Delete deletes a knowledge chunk by ID.
func (r *SMEKnowledgeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteSMEKnowledgeChunk(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete knowledge chunk: %w", err)
	}
	return nil
}

func toSMEKnowledgeChunkEntity(c *gen.SmeKnowledgeChunk) *entity.SMEKnowledgeChunk {
	return &entity.SMEKnowledgeChunk{
		ID:             c.ID,
		TenantID:       c.TenantID,
		SMEID:          c.SmeID,
		SubmissionID:   fromNullUUIDPtr(c.SubmissionID),
		Content:        c.Content,
		Topic:          c.Topic,
		Keywords:       c.Keywords,
		RelevanceScore: c.RelevanceScore,
		CreatedAt:      c.CreatedAt,
	}
}
