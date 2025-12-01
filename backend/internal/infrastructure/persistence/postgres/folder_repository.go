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
		INSERT INTO folders (tenant_id, name, parent_id, type)
		VALUES ($1, $2, $3, $4)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		folder.TenantID,
		folder.Name,
		folder.ParentID,
		folder.Type.String(),
	).Scan(&folder.ID, &folder.CreatedAt, &folder.UpdatedAt)
}

// GetByID retrieves a folder by its ID.
func (r *FolderRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, created_at, updated_at
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

// Update updates a folder.
func (r *FolderRepository) Update(ctx context.Context, folder *entity.Folder) error {
	query := `
		UPDATE folders
		SET name = $1, parent_id = $2, type = $3, updated_at = NOW()
		WHERE id = $4
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		folder.Name,
		folder.ParentID,
		folder.Type.String(),
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
			SELECT id, tenant_id, name, parent_id, type, created_at, updated_at
			FROM folders
			WHERE parent_id IS NULL
			ORDER BY name ASC
		`
	} else {
		query = `
			SELECT id, tenant_id, name, parent_id, type, created_at, updated_at
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

// GetHierarchy retrieves all folders for building nested tree.
func (r *FolderRepository) GetHierarchy(ctx context.Context) ([]*entity.Folder, error) {
	query := `
		SELECT id, tenant_id, name, parent_id, type, created_at, updated_at
		FROM folders
		ORDER BY name ASC
	`
	rows, err := r.db.QueryContext(ctx, query)
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
