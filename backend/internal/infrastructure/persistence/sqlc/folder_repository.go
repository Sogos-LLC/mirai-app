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
)

// FolderRepository implements repository.FolderRepository using sqlc-generated code.
type FolderRepository struct {
	db *sql.DB
}

// NewFolderRepository creates a new sqlc-based folder repository.
func NewFolderRepository(db *sql.DB) repository.FolderRepository {
	return &FolderRepository{db: db}
}

// Create creates a new folder.
func (r *FolderRepository) Create(ctx context.Context, folder *entity.Folder) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.CreateFolder(ctx, gen.CreateFolderParams{
			TenantID: folder.TenantID,
			Name:     folder.Name,
			ParentID: toNullUUID(folder.ParentID),
			Type:     folder.Type.String(),
			TeamID:   toNullUUID(folder.TeamID),
			UserID:   toNullUUID(folder.UserID),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create folder: %w", err)
	}

	folder.ID = result.ID
	folder.CreatedAt = result.CreatedAt
	folder.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a folder by its ID.
func (r *FolderRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Folder, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.GetFolderByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder: %w", err)
	}
	return toFolderEntity(&result), nil
}

// GetByTeamID retrieves a folder by team ID.
func (r *FolderRepository) GetByTeamID(ctx context.Context, teamID uuid.UUID) (*entity.Folder, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.GetFolderByTeamID(ctx, uuid.NullUUID{UUID: teamID, Valid: true})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder by team ID: %w", err)
	}
	return toFolderEntity(&result), nil
}

// GetByUserID retrieves a personal folder by user ID.
func (r *FolderRepository) GetByUserID(ctx context.Context, userID uuid.UUID) (*entity.Folder, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.GetFolderByUserID(ctx, uuid.NullUUID{UUID: userID, Valid: true})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get folder by user ID: %w", err)
	}
	return toFolderEntity(&result), nil
}

// GetSharedFolder retrieves the shared folder for a tenant.
func (r *FolderRepository) GetSharedFolder(ctx context.Context, tenantID uuid.UUID) (*entity.Folder, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.GetSharedFolder(ctx, tenantID)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get shared folder: %w", err)
	}
	return toFolderEntity(&result), nil
}

// Update updates a folder.
func (r *FolderRepository) Update(ctx context.Context, folder *entity.Folder) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Folder, error) {
		return q.UpdateFolder(ctx, gen.UpdateFolderParams{
			Name:     folder.Name,
			ParentID: toNullUUID(folder.ParentID),
			Type:     folder.Type.String(),
			TeamID:   toNullUUID(folder.TeamID),
			UserID:   toNullUUID(folder.UserID),
			ID:       folder.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update folder: %w", err)
	}

	folder.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a folder.
func (r *FolderRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteFolder(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete folder: %w", err)
	}
	return nil
}

// ListByParent retrieves all folders with a given parent.
func (r *FolderRepository) ListByParent(ctx context.Context, parentID *uuid.UUID) ([]*entity.Folder, error) {
	var results []gen.Folder
	var err error

	if parentID == nil {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Folder, error) {
			return q.ListRootFolders(ctx)
		})
	} else {
		results, err = database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Folder, error) {
			return q.ListFoldersByParentID(ctx, uuid.NullUUID{UUID: *parentID, Valid: true})
		})
	}

	if err != nil {
		return nil, fmt.Errorf("failed to list folders: %w", err)
	}

	folders := make([]*entity.Folder, len(results))
	for i := range results {
		folders[i] = toFolderEntity(&results[i])
	}
	return folders, nil
}

// GetHierarchy retrieves all folders visible to a user for building nested tree.
func (r *FolderRepository) GetHierarchy(ctx context.Context, userID uuid.UUID) ([]*entity.Folder, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Folder, error) {
		return q.GetFolderHierarchy(ctx, uuid.NullUUID{UUID: userID, Valid: true})
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get folder hierarchy: %w", err)
	}

	folders := make([]*entity.Folder, len(results))
	for i := range results {
		folders[i] = toFolderEntity(&results[i])
	}
	return folders, nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

func toFolderEntity(f *gen.Folder) *entity.Folder {
	return &entity.Folder{
		ID:        f.ID,
		TenantID:  f.TenantID,
		Name:      f.Name,
		ParentID:  fromNullUUIDPtr(f.ParentID),
		Type:      entity.ParseFolderType(f.Type),
		TeamID:    fromNullUUIDPtr(f.TeamID),
		UserID:    fromNullUUIDPtr(f.UserID),
		CreatedAt: f.CreatedAt,
		UpdatedAt: f.UpdatedAt,
	}
}
