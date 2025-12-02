package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
)

// FolderRepository implements repository.FolderRepository using PostgreSQL.
type FolderRepository struct {
	db *sql.DB
}

// NewFolderRepository creates a new PostgreSQL folder repository.
func NewFolderRepository(db *sql.DB) repository.FolderRepository {
	return &FolderRepository{db: db}
}

// Create creates a new folder.
func (r *FolderRepository) Create(ctx context.Context, folder *entity.Folder) error {
	query := `
		INSERT INTO folders (tenant_id, name, parent_id, type, team_id, user_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		folder.TenantID,
		folder.Name,
		folder.ParentID,
		folder.Type.String(),
		folder.TeamID,
		folder.UserID,
	).Scan(&folder.ID, &folder.CreatedAt, &folder.UpdatedAt)
}

// GetByID retrieves a folder by its ID.
func (r *FolderRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
		FROM folders
		WHERE id = $1
	`
	folder := &entity.Folder{}
	var typeStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&folder.ID,
		&folder.TenantID,
		&folder.Name,
		&folder.ParentID,
		&typeStr,
		&folder.TeamID,
		&folder.UserID,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder: %w", err)
	}
	folder.Type = entity.ParseFolderType(typeStr)
	return folder, nil
}

// GetByTeamID retrieves a folder by team ID.
func (r *FolderRepository) GetByTeamID(ctx context.Context, teamID uuid.UUID) (*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
		FROM folders
		WHERE team_id = $1 AND type = 'TEAM'
	`
	folder := &entity.Folder{}
	var typeStr string
	err := r.db.QueryRowContext(ctx, query, teamID).Scan(
		&folder.ID,
		&folder.TenantID,
		&folder.Name,
		&folder.ParentID,
		&typeStr,
		&folder.TeamID,
		&folder.UserID,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder by team ID: %w", err)
	}
	folder.Type = entity.ParseFolderType(typeStr)
	return folder, nil
}

// GetByUserID retrieves a personal folder by user ID.
func (r *FolderRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
		FROM folders
		WHERE user_id = $1 AND type = 'PERSONAL'
	`
	folder := &entity.Folder{}
	var typeStr string
	err := r.db.QueryRowContext(ctx, query, userID).Scan(
		&folder.ID,
		&folder.TenantID,
		&folder.Name,
		&folder.ParentID,
		&typeStr,
		&folder.TeamID,
		&folder.UserID,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder by user ID: %w", err)
	}
	folder.Type = entity.ParseFolderType(typeStr)
	return folder, nil
}

// GetSharedFolder retrieves the shared folder for a tenant.
func (r *FolderRepository) GetSharedFolder(ctx context.Context, tenantID uuid.UUID) (*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
		FROM folders
		WHERE tenant_id = $1 AND type = 'LIBRARY' AND parent_id IS NULL
		LIMIT 1
	`
	folder := &entity.Folder{}
	var typeStr string
	err := r.db.QueryRowContext(ctx, query, tenantID).Scan(
		&folder.ID,
		&folder.TenantID,
		&folder.Name,
		&folder.ParentID,
		&typeStr,
		&folder.TeamID,
		&folder.UserID,
		&folder.CreatedAt,
		&folder.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shared folder: %w", err)
	}
	folder.Type = entity.ParseFolderType(typeStr)
	return folder, nil
}

// Update updates a folder.
func (r *FolderRepository) Update(ctx context.Context, folder *entity.Folder) error {
	query := `
		UPDATE folders
		SET name = $1, parent_id = $2, type = $3, team_id = $4, user_id = $5, updated_at = NOW()
		WHERE id = $6
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		folder.Name,
		folder.ParentID,
		folder.Type.String(),
		folder.TeamID,
		folder.UserID,
		folder.ID,
	).Scan(&folder.UpdatedAt)
}

// Delete deletes a folder.
func (r *FolderRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM folders WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete folder: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("folder not found")
	}
	return nil
}

// ListByParent retrieves all folders with a given parent.
// Pass nil for parentID to get root folders.
func (r *FolderRepository) ListByParent(ctx context.Context, parentID *uuid.UUID) ([]*entity.Folder, error) {
	var query string
	var args []interface{}

	if parentID == nil {
		query = `
			SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
			FROM folders
			WHERE parent_id IS NULL
			ORDER BY name ASC
		`
	} else {
		query = `
			SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
			FROM folders
			WHERE parent_id = $1
			ORDER BY name ASC
		`
		args = append(args, *parentID)
	}

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list folders: %w", err)
	}
	defer rows.Close()

	var folders []*entity.Folder
	for rows.Next() {
		folder := &entity.Folder{}
		var typeStr string
		if err := rows.Scan(
			&folder.ID,
			&folder.TenantID,
			&folder.Name,
			&folder.ParentID,
			&typeStr,
			&folder.TeamID,
			&folder.UserID,
			&folder.CreatedAt,
			&folder.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan folder: %w", err)
		}
		folder.Type = entity.ParseFolderType(typeStr)
		folders = append(folders, folder)
	}
	return folders, nil
}

// GetHierarchy retrieves all folders visible to a user for building nested tree.
// Filters PERSONAL folders to only show the user's own private folder.
// Other folder types (LIBRARY, TEAM, FOLDER) are visible to all users in the tenant.
func (r *FolderRepository) GetHierarchy(ctx context.Context, userID uuid.UUID) ([]*entity.Folder, error) {
	// Only return:
	// - LIBRARY folders (shared with everyone in tenant)
	// - TEAM folders (shared with team members - TODO: could add team membership filter)
	// - FOLDER folders (regular folders)
	// - PERSONAL folders that belong to this specific user
	query := `
		SELECT id, tenant_id, name, parent_id, type, team_id, user_id, created_at, updated_at
		FROM folders
		WHERE type != 'PERSONAL' OR (type = 'PERSONAL' AND user_id = $1)
		ORDER BY
			CASE type
				WHEN 'LIBRARY' THEN 1
				WHEN 'TEAM' THEN 2
				WHEN 'PERSONAL' THEN 3
				ELSE 4
			END,
			name ASC
	`
	rows, err := r.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get folder hierarchy: %w", err)
	}
	defer rows.Close()

	var folders []*entity.Folder
	for rows.Next() {
		folder := &entity.Folder{}
		var typeStr string
		if err := rows.Scan(
			&folder.ID,
			&folder.TenantID,
			&folder.Name,
			&folder.ParentID,
			&typeStr,
			&folder.TeamID,
			&folder.UserID,
			&folder.CreatedAt,
			&folder.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan folder: %w", err)
		}
		folder.Type = entity.ParseFolderType(typeStr)
		folders = append(folders, folder)
	}
	return folders, nil
}
