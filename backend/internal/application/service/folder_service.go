package service

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
)

// GetFolderHierarchy returns the folder structure.
func (s *CourseService) GetFolderHierarchy(ctx context.Context, kratosID uuid.UUID, includeCounts bool) ([]Folder, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrInternal.WithMessage("user has no tenant")
	}

	// Ensure default folders exist (Shared and user's Private folder)
	if err := s.ensureDefaultFolders(ctx, user); err != nil {
		s.logger.Error("failed to ensure default folders", "error", err)
		// Continue even if folder creation fails
	}

	// Pass user ID to filter PERSONAL folders - users only see their own private folder
	folders, err := s.folderRepo.GetHierarchy(ctx, user.ID)
	if err != nil {
		s.logger.Error("failed to get folder hierarchy", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Build parent-child map
	childrenMap := make(map[string][]string)
	for _, f := range folders {
		if f.ParentID != nil {
			parentStr := f.ParentID.String()
			childrenMap[parentStr] = append(childrenMap[parentStr], f.ID.String())
		}
	}

	result := make([]Folder, 0, len(folders))
	for _, f := range folders {
		var parentStr string
		if f.ParentID != nil {
			parentStr = f.ParentID.String()
		}

		result = append(result, Folder{
			ID:       f.ID.String(),
			Name:     f.Name,
			Parent:   parentStr,
			Type:     f.Type.String(),
			Children: childrenMap[f.ID.String()],
		})
	}

	return result, nil
}

// ensureDefaultFolders creates default folders (Shared and user's Private) if they don't exist.
func (s *CourseService) ensureDefaultFolders(ctx context.Context, user *entity.User) error {
	if user.TenantID == nil {
		return nil
	}

	// Check for Shared folder
	sharedFolder, err := s.folderRepo.GetSharedFolder(ctx, *user.TenantID)
	if err != nil {
		return err
	}

	if sharedFolder == nil {
		// Create Shared folder
		sharedFolder = &entity.Folder{
			TenantID: *user.TenantID,
			Name:     "Shared",
			Type:     entity.FolderTypeLibrary,
		}
		if err := s.folderRepo.Create(ctx, sharedFolder); err != nil {
			s.logger.Error("failed to create shared folder", "error", err)
		} else {
			s.logger.Info("created shared folder", "folderID", sharedFolder.ID)
		}
	}

	// Check for user's Private folder
	privateFolder, err := s.folderRepo.GetByUserID(ctx, user.ID)
	if err != nil {
		return err
	}

	if privateFolder == nil {
		// Create Private folder for this user
		privateFolder = &entity.Folder{
			TenantID: *user.TenantID,
			Name:     "Private",
			Type:     entity.FolderTypePersonal,
			UserID:   &user.ID,
		}
		if err := s.folderRepo.Create(ctx, privateFolder); err != nil {
			s.logger.Error("failed to create private folder", "error", err, "userID", user.ID)
		} else {
			s.logger.Info("created private folder", "folderID", privateFolder.ID, "userID", user.ID)
		}
	}

	return nil
}

// GetLibrary returns the full library.
func (s *CourseService) GetLibrary(ctx context.Context, kratosID uuid.UUID, includeCounts bool) (*Library, error) {
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	// Get courses
	courses, err := s.courseRepo.List(ctx, entity.CourseListOptions{Limit: 1000})
	if err != nil {
		s.logger.Error("failed to list courses", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Get folders - pass user ID to filter PERSONAL folders
	folders, err := s.folderRepo.GetHierarchy(ctx, user.ID)
	if err != nil {
		s.logger.Error("failed to get folder hierarchy", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	// Convert courses to library entries
	entries := make([]LibraryEntry, 0, len(courses))
	for _, c := range courses {
		var folderStr string
		if c.FolderID != nil {
			folderStr = c.FolderID.String()
		}
		var thumbPath string
		if c.ThumbnailPath != nil {
			thumbPath = *c.ThumbnailPath
		}

		entries = append(entries, LibraryEntry{
			ID:            c.ID.String(),
			Title:         c.Title,
			Status:        CourseStatus(c.Status.String()),
			Folder:        folderStr,
			Tags:          c.CategoryTags,
			CreatedAt:     c.CreatedAt,
			ModifiedAt:    c.UpdatedAt,
			CreatedBy:     c.CreatedByUserID.String(),
			ThumbnailPath: thumbPath,
		})
	}

	// Build parent-child map for folders
	childrenMap := make(map[string][]string)
	for _, f := range folders {
		if f.ParentID != nil {
			parentStr := f.ParentID.String()
			childrenMap[parentStr] = append(childrenMap[parentStr], f.ID.String())
		}
	}

	// Convert folders
	folderList := make([]Folder, 0, len(folders))
	for _, f := range folders {
		var parentStr string
		if f.ParentID != nil {
			parentStr = f.ParentID.String()
		}

		folderList = append(folderList, Folder{
			ID:       f.ID.String(),
			Name:     f.Name,
			Parent:   parentStr,
			Type:     f.Type.String(),
			Children: childrenMap[f.ID.String()],
		})
	}

	return &Library{
		Version:     "1.0",
		LastUpdated: time.Now(),
		Courses:     entries,
		Folders:     folderList,
	}, nil
}

// CreateFolder creates a new folder.
func (s *CourseService) CreateFolder(ctx context.Context, kratosID uuid.UUID, name string, parentID *string, folderType string) (*entity.Folder, error) {
	log := s.logger.With("kratosID", kratosID, "folderName", name)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, domainerrors.ErrUserNotFound
	}

	if user.TenantID == nil {
		return nil, domainerrors.ErrInternal.WithMessage("user has no tenant")
	}

	folder := &entity.Folder{
		TenantID: *user.TenantID,
		Name:     name,
		Type:     entity.ParseFolderType(folderType),
	}

	if parentID != nil && *parentID != "" {
		pID, err := uuid.Parse(*parentID)
		if err == nil {
			folder.ParentID = &pID
		}
	}

	if err := s.folderRepo.Create(ctx, folder); err != nil {
		log.Error("failed to create folder", "error", err)
		return nil, domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("folder created", "folderID", folder.ID)
	return folder, nil
}

// DeleteFolder deletes a folder.
func (s *CourseService) DeleteFolder(ctx context.Context, kratosID uuid.UUID, id string) error {
	log := s.logger.With("kratosID", kratosID, "folderID", id)

	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return domainerrors.ErrUserNotFound
	}

	folderID, err := uuid.Parse(id)
	if err != nil {
		return domainerrors.ErrInvalidInput.WithMessage("invalid folder ID")
	}

	// Check if folder has courses
	count, err := s.courseRepo.CountByFolder(ctx, folderID)
	if err != nil {
		log.Error("failed to count courses in folder", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
	if count > 0 {
		return domainerrors.ErrBadRequest.WithMessage(fmt.Sprintf("folder contains %d courses, move or delete them first", count))
	}

	// Check if folder has child folders
	children, err := s.folderRepo.ListByParent(ctx, &folderID)
	if err != nil {
		log.Error("failed to list child folders", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}
	if len(children) > 0 {
		return domainerrors.ErrBadRequest.WithMessage("folder contains subfolders, delete them first")
	}

	if err := s.folderRepo.Delete(ctx, folderID); err != nil {
		log.Error("failed to delete folder", "error", err)
		return domainerrors.ErrInternal.WithCause(err)
	}

	log.Info("folder deleted")
	return nil
}
