package entity

import (
	"time"

	"github.com/google/uuid"
)

// FolderType represents the type of folder in the course library.
type FolderType string

const (
	FolderTypeLibrary  FolderType = "LIBRARY"
	FolderTypeTeam     FolderType = "TEAM"
	FolderTypePersonal FolderType = "PERSONAL"
	FolderTypeFolder   FolderType = "FOLDER"
)

// String returns the string representation of the folder type.
func (t FolderType) String() string {
	return string(t)
}

// ParseFolderType parses a string into a FolderType.
func ParseFolderType(s string) FolderType {
	switch s {
	case "LIBRARY":
		return FolderTypeLibrary
	case "TEAM":
		return FolderTypeTeam
	case "PERSONAL":
		return FolderTypePersonal
	case "FOLDER":
		return FolderTypeFolder
	default:
		return FolderTypeFolder
	}
}

// Folder represents a folder in the course library hierarchy.
type Folder struct {
	ID        uuid.UUID
	TenantID  uuid.UUID  // Tenant for RLS isolation
	Name      string
	ParentID  *uuid.UUID // nil for root folders
	Type      FolderType
	TeamID    *uuid.UUID // For TEAM folders - associates with a team
	UserID    *uuid.UUID // For PERSONAL folders - associates with a user
	CreatedAt time.Time
	UpdatedAt time.Time
}
