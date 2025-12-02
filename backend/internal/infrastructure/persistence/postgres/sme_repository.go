package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// SMERepository implements repository.SMERepository using PostgreSQL.
type SMERepository struct {
	db *sql.DB
}

// NewSMERepository creates a new PostgreSQL SME repository.
func NewSMERepository(db *sql.DB) repository.SMERepository {
	return &SMERepository{db: db}
}

// Create creates a new SME.
func (r *SMERepository) Create(ctx context.Context, sme *entity.SubjectMatterExpert) error {
	query := `
		INSERT INTO subject_matter_experts (tenant_id, company_id, name, description, domain, scope, status, knowledge_summary, knowledge_content_path, created_by_user_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		sme.TenantID,
		sme.CompanyID,
		sme.Name,
		sme.Description,
		sme.Domain,
		sme.Scope.String(),
		sme.Status.String(),
		sme.KnowledgeSummary,
		sme.KnowledgeContentPath,
		sme.CreatedByUserID,
	).Scan(&sme.ID, &sme.CreatedAt, &sme.UpdatedAt)
}

// GetByID retrieves an SME by its ID.
func (r *SMERepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SubjectMatterExpert, error) {
	query := `
		SELECT id, tenant_id, company_id, name, description, domain, scope, status, knowledge_summary, knowledge_content_path, created_by_user_id, created_at, updated_at
		FROM subject_matter_experts
		WHERE id = $1
	`
	sme := &entity.SubjectMatterExpert{}
	var scopeStr, statusStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&sme.ID,
		&sme.TenantID,
		&sme.CompanyID,
		&sme.Name,
		&sme.Description,
		&sme.Domain,
		&scopeStr,
		&statusStr,
		&sme.KnowledgeSummary,
		&sme.KnowledgeContentPath,
		&sme.CreatedByUserID,
		&sme.CreatedAt,
		&sme.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get SME: %w", err)
	}
	sme.Scope, _ = valueobject.ParseSMEScope(scopeStr)
	sme.Status, _ = valueobject.ParseSMEStatus(statusStr)

	// Load team IDs if team-scoped
	if sme.Scope == valueobject.SMEScopeTeam {
		teamIDs, err := r.getTeamIDs(ctx, sme.ID)
		if err != nil {
			return nil, err
		}
		sme.TeamIDs = teamIDs
	}

	return sme, nil
}

func (r *SMERepository) getTeamIDs(ctx context.Context, smeID uuid.UUID) ([]uuid.UUID, error) {
	query := `SELECT team_id FROM sme_team_access WHERE sme_id = $1`
	rows, err := r.db.QueryContext(ctx, query, smeID)
	if err != nil {
		return nil, fmt.Errorf("failed to get team IDs: %w", err)
	}
	defer rows.Close()

	var teamIDs []uuid.UUID
	for rows.Next() {
		var teamID uuid.UUID
		if err := rows.Scan(&teamID); err != nil {
			return nil, fmt.Errorf("failed to scan team ID: %w", err)
		}
		teamIDs = append(teamIDs, teamID)
	}
	return teamIDs, nil
}

// List retrieves SMEs with optional filtering.
func (r *SMERepository) List(ctx context.Context, opts entity.SMEListOptions) ([]*entity.SubjectMatterExpert, error) {
	query := `
		SELECT DISTINCT s.id, s.tenant_id, s.company_id, s.name, s.description, s.domain, s.scope, s.status, s.knowledge_summary, s.knowledge_content_path, s.created_by_user_id, s.created_at, s.updated_at
		FROM subject_matter_experts s
	`
	args := []interface{}{}
	argIndex := 1

	// Join for team filtering
	if opts.TeamID != nil {
		query += " LEFT JOIN sme_team_access sta ON s.id = sta.sme_id"
	}

	query += " WHERE 1=1"

	if opts.Scope != nil {
		query += fmt.Sprintf(" AND s.scope = $%d", argIndex)
		args = append(args, opts.Scope.String())
		argIndex++
	}

	if opts.Status != nil {
		query += fmt.Sprintf(" AND s.status = $%d", argIndex)
		args = append(args, opts.Status.String())
		argIndex++
	}

	if opts.TeamID != nil {
		query += fmt.Sprintf(" AND (s.scope = 'global' OR sta.team_id = $%d)", argIndex)
		args = append(args, *opts.TeamID)
		argIndex++
	}

	query += " ORDER BY s.created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list SMEs: %w", err)
	}
	defer rows.Close()

	var smes []*entity.SubjectMatterExpert
	for rows.Next() {
		sme := &entity.SubjectMatterExpert{}
		var scopeStr, statusStr string
		if err := rows.Scan(
			&sme.ID,
			&sme.TenantID,
			&sme.CompanyID,
			&sme.Name,
			&sme.Description,
			&sme.Domain,
			&scopeStr,
			&statusStr,
			&sme.KnowledgeSummary,
			&sme.KnowledgeContentPath,
			&sme.CreatedByUserID,
			&sme.CreatedAt,
			&sme.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan SME: %w", err)
		}
		sme.Scope, _ = valueobject.ParseSMEScope(scopeStr)
		sme.Status, _ = valueobject.ParseSMEStatus(statusStr)
		smes = append(smes, sme)
	}
	return smes, nil
}

// Update updates an SME.
func (r *SMERepository) Update(ctx context.Context, sme *entity.SubjectMatterExpert) error {
	query := `
		UPDATE subject_matter_experts
		SET name = $1, description = $2, domain = $3, scope = $4, status = $5, knowledge_summary = $6, knowledge_content_path = $7, updated_at = NOW()
		WHERE id = $8
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		sme.Name,
		sme.Description,
		sme.Domain,
		sme.Scope.String(),
		sme.Status.String(),
		sme.KnowledgeSummary,
		sme.KnowledgeContentPath,
		sme.ID,
	).Scan(&sme.UpdatedAt)
}

// Delete deletes an SME.
func (r *SMERepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM subject_matter_experts WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete SME: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("SME not found")
	}
	return nil
}

// AddTeamAccess adds team access for a team-scoped SME.
func (r *SMERepository) AddTeamAccess(ctx context.Context, access *entity.SMETeamAccess) error {
	query := `
		INSERT INTO sme_team_access (tenant_id, sme_id, team_id)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query,
		access.TenantID,
		access.SMEID,
		access.TeamID,
	).Scan(&access.ID, &access.CreatedAt)
}

// RemoveTeamAccess removes team access.
func (r *SMERepository) RemoveTeamAccess(ctx context.Context, smeID, teamID uuid.UUID) error {
	query := `DELETE FROM sme_team_access WHERE sme_id = $1 AND team_id = $2`
	_, err := r.db.ExecContext(ctx, query, smeID, teamID)
	return err
}

// ListTeamAccess lists team access for an SME.
func (r *SMERepository) ListTeamAccess(ctx context.Context, smeID uuid.UUID) ([]*entity.SMETeamAccess, error) {
	query := `SELECT id, tenant_id, sme_id, team_id, created_at FROM sme_team_access WHERE sme_id = $1`
	rows, err := r.db.QueryContext(ctx, query, smeID)
	if err != nil {
		return nil, fmt.Errorf("failed to list team access: %w", err)
	}
	defer rows.Close()

	var accesses []*entity.SMETeamAccess
	for rows.Next() {
		access := &entity.SMETeamAccess{}
		if err := rows.Scan(&access.ID, &access.TenantID, &access.SMEID, &access.TeamID, &access.CreatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan team access: %w", err)
		}
		accesses = append(accesses, access)
	}
	return accesses, nil
}

// SMETaskRepository implements repository.SMETaskRepository using PostgreSQL.
type SMETaskRepository struct {
	db *sql.DB
}

// NewSMETaskRepository creates a new PostgreSQL SME task repository.
func NewSMETaskRepository(db *sql.DB) repository.SMETaskRepository {
	return &SMETaskRepository{db: db}
}

// Create creates a new task.
func (r *SMETaskRepository) Create(ctx context.Context, task *entity.SMETask) error {
	query := `
		INSERT INTO sme_tasks (tenant_id, sme_id, title, description, expected_content_type, assigned_to_user_id, assigned_by_user_id, team_id, status, due_date)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at
	`
	var contentType *string
	if task.ExpectedContentType != nil {
		ct := task.ExpectedContentType.String()
		contentType = &ct
	}
	return r.db.QueryRowContext(ctx, query,
		task.TenantID,
		task.SMEID,
		task.Title,
		task.Description,
		contentType,
		task.AssignedToUserID,
		task.AssignedByUserID,
		task.TeamID,
		task.Status.String(),
		task.DueDate,
	).Scan(&task.ID, &task.CreatedAt, &task.UpdatedAt)
}

// GetByID retrieves a task by its ID.
func (r *SMETaskRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETask, error) {
	query := `
		SELECT id, tenant_id, sme_id, title, description, expected_content_type, assigned_to_user_id, assigned_by_user_id, team_id, status, due_date, created_at, updated_at, completed_at
		FROM sme_tasks
		WHERE id = $1
	`
	task := &entity.SMETask{}
	var statusStr string
	var contentTypeStr *string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&task.ID,
		&task.TenantID,
		&task.SMEID,
		&task.Title,
		&task.Description,
		&contentTypeStr,
		&task.AssignedToUserID,
		&task.AssignedByUserID,
		&task.TeamID,
		&statusStr,
		&task.DueDate,
		&task.CreatedAt,
		&task.UpdatedAt,
		&task.CompletedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get task: %w", err)
	}
	task.Status, _ = valueobject.ParseSMETaskStatus(statusStr)
	if contentTypeStr != nil {
		ct, _ := valueobject.ParseContentType(*contentTypeStr)
		task.ExpectedContentType = &ct
	}
	return task, nil
}

// List retrieves tasks with optional filtering.
func (r *SMETaskRepository) List(ctx context.Context, opts entity.SMETaskListOptions) ([]*entity.SMETask, error) {
	query := `
		SELECT id, tenant_id, sme_id, title, description, expected_content_type, assigned_to_user_id, assigned_by_user_id, team_id, status, due_date, created_at, updated_at, completed_at
		FROM sme_tasks
		WHERE 1=1
	`
	args := []interface{}{}
	argIndex := 1

	if opts.SMEID != nil {
		query += fmt.Sprintf(" AND sme_id = $%d", argIndex)
		args = append(args, *opts.SMEID)
		argIndex++
	}

	if opts.AssignedToUserID != nil {
		query += fmt.Sprintf(" AND assigned_to_user_id = $%d", argIndex)
		args = append(args, *opts.AssignedToUserID)
		argIndex++
	}

	if opts.Status != nil {
		query += fmt.Sprintf(" AND status = $%d", argIndex)
		args = append(args, opts.Status.String())
		argIndex++
	}

	query += " ORDER BY created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list tasks: %w", err)
	}
	defer rows.Close()

	var tasks []*entity.SMETask
	for rows.Next() {
		task := &entity.SMETask{}
		var statusStr string
		var contentTypeStr *string
		if err := rows.Scan(
			&task.ID,
			&task.TenantID,
			&task.SMEID,
			&task.Title,
			&task.Description,
			&contentTypeStr,
			&task.AssignedToUserID,
			&task.AssignedByUserID,
			&task.TeamID,
			&statusStr,
			&task.DueDate,
			&task.CreatedAt,
			&task.UpdatedAt,
			&task.CompletedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan task: %w", err)
		}
		task.Status, _ = valueobject.ParseSMETaskStatus(statusStr)
		if contentTypeStr != nil {
			ct, _ := valueobject.ParseContentType(*contentTypeStr)
			task.ExpectedContentType = &ct
		}
		tasks = append(tasks, task)
	}
	return tasks, nil
}

// Update updates a task.
func (r *SMETaskRepository) Update(ctx context.Context, task *entity.SMETask) error {
	query := `
		UPDATE sme_tasks
		SET title = $1, description = $2, expected_content_type = $3, due_date = $4, status = $5, completed_at = $6, updated_at = NOW()
		WHERE id = $7
		RETURNING updated_at
	`
	var contentType *string
	if task.ExpectedContentType != nil {
		ct := task.ExpectedContentType.String()
		contentType = &ct
	}
	return r.db.QueryRowContext(ctx, query,
		task.Title,
		task.Description,
		contentType,
		task.DueDate,
		task.Status.String(),
		task.CompletedAt,
		task.ID,
	).Scan(&task.UpdatedAt)
}

// Cancel cancels a pending task.
func (r *SMETaskRepository) Cancel(ctx context.Context, id uuid.UUID) error {
	query := `UPDATE sme_tasks SET status = 'cancelled', updated_at = NOW() WHERE id = $1 AND status = 'pending'`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to cancel task: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("task not found or not in pending status")
	}
	return nil
}

// Delete permanently deletes a task.
func (r *SMETaskRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM sme_tasks WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete task: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("task not found")
	}
	return nil
}

// SMESubmissionRepository implements repository.SMESubmissionRepository using PostgreSQL.
type SMESubmissionRepository struct {
	db *sql.DB
}

// NewSMESubmissionRepository creates a new PostgreSQL SME submission repository.
func NewSMESubmissionRepository(db *sql.DB) repository.SMESubmissionRepository {
	return &SMESubmissionRepository{db: db}
}

// Create creates a new submission.
func (r *SMESubmissionRepository) Create(ctx context.Context, submission *entity.SMETaskSubmission) error {
	query := `
		INSERT INTO sme_task_submissions (tenant_id, task_id, file_name, file_path, content_type, file_size_bytes, extracted_text, submitted_by_user_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, submitted_at
	`
	return r.db.QueryRowContext(ctx, query,
		submission.TenantID,
		submission.TaskID,
		submission.FileName,
		submission.FilePath,
		submission.ContentType.String(),
		submission.FileSizeBytes,
		submission.ExtractedText,
		submission.SubmittedByUserID,
	).Scan(&submission.ID, &submission.SubmittedAt)
}

// GetByID retrieves a submission by its ID.
func (r *SMESubmissionRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMETaskSubmission, error) {
	query := `
		SELECT id, tenant_id, task_id, file_name, file_path, content_type, file_size_bytes, extracted_text, ai_summary, ingestion_error, submitted_by_user_id, submitted_at, processed_at,
			reviewer_notes, approved_content, is_approved, approved_at, approved_by_user_id
		FROM sme_task_submissions
		WHERE id = $1
	`
	sub := &entity.SMETaskSubmission{}
	var contentTypeStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&sub.ID,
		&sub.TenantID,
		&sub.TaskID,
		&sub.FileName,
		&sub.FilePath,
		&contentTypeStr,
		&sub.FileSizeBytes,
		&sub.ExtractedText,
		&sub.AISummary,
		&sub.IngestionError,
		&sub.SubmittedByUserID,
		&sub.SubmittedAt,
		&sub.ProcessedAt,
		&sub.ReviewerNotes,
		&sub.ApprovedContent,
		&sub.IsApproved,
		&sub.ApprovedAt,
		&sub.ApprovedByUserID,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get submission: %w", err)
	}
	sub.ContentType, _ = valueobject.ParseContentType(contentTypeStr)
	return sub, nil
}

// ListByTaskID retrieves all submissions for a task.
func (r *SMESubmissionRepository) ListByTaskID(ctx context.Context, taskID uuid.UUID) ([]*entity.SMETaskSubmission, error) {
	query := `
		SELECT id, tenant_id, task_id, file_name, file_path, content_type, file_size_bytes, extracted_text, ai_summary, ingestion_error, submitted_by_user_id, submitted_at, processed_at,
			reviewer_notes, approved_content, is_approved, approved_at, approved_by_user_id
		FROM sme_task_submissions
		WHERE task_id = $1
		ORDER BY submitted_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, taskID)
	if err != nil {
		return nil, fmt.Errorf("failed to list submissions: %w", err)
	}
	defer rows.Close()

	var submissions []*entity.SMETaskSubmission
	for rows.Next() {
		sub := &entity.SMETaskSubmission{}
		var contentTypeStr string
		if err := rows.Scan(
			&sub.ID,
			&sub.TenantID,
			&sub.TaskID,
			&sub.FileName,
			&sub.FilePath,
			&contentTypeStr,
			&sub.FileSizeBytes,
			&sub.ExtractedText,
			&sub.AISummary,
			&sub.IngestionError,
			&sub.SubmittedByUserID,
			&sub.SubmittedAt,
			&sub.ProcessedAt,
			&sub.ReviewerNotes,
			&sub.ApprovedContent,
			&sub.IsApproved,
			&sub.ApprovedAt,
			&sub.ApprovedByUserID,
		); err != nil {
			return nil, fmt.Errorf("failed to scan submission: %w", err)
		}
		sub.ContentType, _ = valueobject.ParseContentType(contentTypeStr)
		submissions = append(submissions, sub)
	}
	return submissions, nil
}

// Update updates a submission.
func (r *SMESubmissionRepository) Update(ctx context.Context, submission *entity.SMETaskSubmission) error {
	query := `
		UPDATE sme_task_submissions
		SET extracted_text = $1, ai_summary = $2, ingestion_error = $3, processed_at = $4,
			reviewer_notes = $5, approved_content = $6, is_approved = $7, approved_at = $8, approved_by_user_id = $9
		WHERE id = $10
	`
	_, err := r.db.ExecContext(ctx, query,
		submission.ExtractedText,
		submission.AISummary,
		submission.IngestionError,
		submission.ProcessedAt,
		submission.ReviewerNotes,
		submission.ApprovedContent,
		submission.IsApproved,
		submission.ApprovedAt,
		submission.ApprovedByUserID,
		submission.ID,
	)
	return err
}

// SMEKnowledgeRepository implements repository.SMEKnowledgeRepository using PostgreSQL.
type SMEKnowledgeRepository struct {
	db *sql.DB
}

// NewSMEKnowledgeRepository creates a new PostgreSQL SME knowledge repository.
func NewSMEKnowledgeRepository(db *sql.DB) repository.SMEKnowledgeRepository {
	return &SMEKnowledgeRepository{db: db}
}

// Create creates a new knowledge chunk.
func (r *SMEKnowledgeRepository) Create(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error {
	query := `
		INSERT INTO sme_knowledge_chunks (tenant_id, sme_id, submission_id, content, topic, keywords, relevance_score)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query,
		chunk.TenantID,
		chunk.SMEID,
		chunk.SubmissionID,
		chunk.Content,
		chunk.Topic,
		pq.Array(chunk.Keywords),
		chunk.RelevanceScore,
	).Scan(&chunk.ID, &chunk.CreatedAt)
}

// GetByID retrieves a chunk by its ID.
func (r *SMEKnowledgeRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.SMEKnowledgeChunk, error) {
	query := `
		SELECT id, tenant_id, sme_id, submission_id, content, topic, keywords, relevance_score, created_at
		FROM sme_knowledge_chunks
		WHERE id = $1
	`
	chunk := &entity.SMEKnowledgeChunk{}
	var keywords pq.StringArray
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&chunk.ID,
		&chunk.TenantID,
		&chunk.SMEID,
		&chunk.SubmissionID,
		&chunk.Content,
		&chunk.Topic,
		&keywords,
		&chunk.RelevanceScore,
		&chunk.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get chunk: %w", err)
	}
	chunk.Keywords = []string(keywords)
	return chunk, nil
}

// ListBySMEID retrieves all chunks for an SME.
func (r *SMEKnowledgeRepository) ListBySMEID(ctx context.Context, smeID uuid.UUID) ([]*entity.SMEKnowledgeChunk, error) {
	query := `
		SELECT id, tenant_id, sme_id, submission_id, content, topic, keywords, relevance_score, created_at
		FROM sme_knowledge_chunks
		WHERE sme_id = $1
		ORDER BY relevance_score DESC
	`
	rows, err := r.db.QueryContext(ctx, query, smeID)
	if err != nil {
		return nil, fmt.Errorf("failed to list chunks: %w", err)
	}
	defer rows.Close()

	var chunks []*entity.SMEKnowledgeChunk
	for rows.Next() {
		chunk := &entity.SMEKnowledgeChunk{}
		var keywords pq.StringArray
		if err := rows.Scan(
			&chunk.ID,
			&chunk.TenantID,
			&chunk.SMEID,
			&chunk.SubmissionID,
			&chunk.Content,
			&chunk.Topic,
			&keywords,
			&chunk.RelevanceScore,
			&chunk.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan chunk: %w", err)
		}
		chunk.Keywords = []string(keywords)
		chunks = append(chunks, chunk)
	}
	return chunks, nil
}

// Search searches knowledge across SMEs.
func (r *SMEKnowledgeRepository) Search(ctx context.Context, smeIDs []uuid.UUID, query string, limit int) ([]*entity.SMEKnowledgeChunk, error) {
	sqlQuery := `
		SELECT id, tenant_id, sme_id, submission_id, content, topic, keywords, relevance_score, created_at
		FROM sme_knowledge_chunks
		WHERE sme_id = ANY($1)
		AND (content ILIKE '%' || $2 || '%' OR topic ILIKE '%' || $2 || '%' OR $2 = ANY(keywords))
		ORDER BY relevance_score DESC
		LIMIT $3
	`
	rows, err := r.db.QueryContext(ctx, sqlQuery, pq.Array(smeIDs), query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to search chunks: %w", err)
	}
	defer rows.Close()

	var chunks []*entity.SMEKnowledgeChunk
	for rows.Next() {
		chunk := &entity.SMEKnowledgeChunk{}
		var keywords pq.StringArray
		if err := rows.Scan(
			&chunk.ID,
			&chunk.TenantID,
			&chunk.SMEID,
			&chunk.SubmissionID,
			&chunk.Content,
			&chunk.Topic,
			&keywords,
			&chunk.RelevanceScore,
			&chunk.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan chunk: %w", err)
		}
		chunk.Keywords = []string(keywords)
		chunks = append(chunks, chunk)
	}
	return chunks, nil
}

// DeleteBySMEID deletes all chunks for an SME.
func (r *SMEKnowledgeRepository) DeleteBySMEID(ctx context.Context, smeID uuid.UUID) error {
	query := `DELETE FROM sme_knowledge_chunks WHERE sme_id = $1`
	_, err := r.db.ExecContext(ctx, query, smeID)
	return err
}

// Update updates a knowledge chunk.
func (r *SMEKnowledgeRepository) Update(ctx context.Context, chunk *entity.SMEKnowledgeChunk) error {
	query := `
		UPDATE sme_knowledge_chunks
		SET content = $1, topic = $2, keywords = $3
		WHERE id = $4
	`
	_, err := r.db.ExecContext(ctx, query,
		chunk.Content,
		chunk.Topic,
		pq.Array(chunk.Keywords),
		chunk.ID,
	)
	return err
}

// Delete deletes a knowledge chunk by ID.
func (r *SMEKnowledgeRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM sme_knowledge_chunks WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete chunk: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("chunk not found")
	}
	return nil
}
