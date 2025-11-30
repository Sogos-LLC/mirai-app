package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// Team represents a team within a company.
type Team struct {
	ID          uuid.UUID
	CompanyID   uuid.UUID
	Name        string
	Description *string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// TeamMember represents a user's membership in a team.
type TeamMember struct {
	ID        uuid.UUID
	TeamID    uuid.UUID
	UserID    uuid.UUID
	Role      valueobject.TeamRole
	CreatedAt time.Time
}

// IsLead returns true if this member is a team lead.
func (m *TeamMember) IsLead() bool {
	return m.Role == valueobject.TeamRoleLead
}

// CanManageTeam returns true if this member can manage the team.
func (m *TeamMember) CanManageTeam() bool {
	return m.Role.CanManageTeam()
}

// TeamWithMembers combines a team with its members.
type TeamWithMembers struct {
	Team    *Team
	Members []*TeamMember
}
