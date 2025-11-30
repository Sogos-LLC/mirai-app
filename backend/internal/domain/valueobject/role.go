package valueobject

import "fmt"

// Role represents a user's role within a company.
type Role string

const (
	RoleOwner  Role = "owner"
	RoleAdmin  Role = "admin"
	RoleMember Role = "member"
)

// String returns the string representation of the role.
func (r Role) String() string {
	return string(r)
}

// IsValid checks if the role is a valid value.
func (r Role) IsValid() bool {
	switch r {
	case RoleOwner, RoleAdmin, RoleMember:
		return true
	}
	return false
}

// CanManageBilling returns true if this role can manage billing.
func (r Role) CanManageBilling() bool {
	return r == RoleOwner
}

// CanManageCompany returns true if this role can update company settings.
func (r Role) CanManageCompany() bool {
	return r == RoleOwner || r == RoleAdmin
}

// CanManageTeams returns true if this role can create/update/delete teams.
func (r Role) CanManageTeams() bool {
	return r == RoleOwner || r == RoleAdmin
}

// CanInviteUsers returns true if this role can invite users to the company.
func (r Role) CanInviteUsers() bool {
	return r == RoleOwner || r == RoleAdmin
}

// ParseRole converts a string to a Role, returning an error if invalid.
func ParseRole(s string) (Role, error) {
	r := Role(s)
	if !r.IsValid() {
		return "", fmt.Errorf("invalid role: %s", s)
	}
	return r, nil
}

// AllRoles returns all valid role values.
func AllRoles() []Role {
	return []Role{RoleOwner, RoleAdmin, RoleMember}
}

// TeamRole represents a user's role within a team.
type TeamRole string

const (
	TeamRoleLead   TeamRole = "lead"
	TeamRoleMember TeamRole = "member"
)

// String returns the string representation of the team role.
func (r TeamRole) String() string {
	return string(r)
}

// IsValid checks if the team role is a valid value.
func (r TeamRole) IsValid() bool {
	switch r {
	case TeamRoleLead, TeamRoleMember:
		return true
	}
	return false
}

// CanManageTeam returns true if this role can manage team settings and members.
func (r TeamRole) CanManageTeam() bool {
	return r == TeamRoleLead
}

// ParseTeamRole converts a string to a TeamRole, returning an error if invalid.
func ParseTeamRole(s string) (TeamRole, error) {
	r := TeamRole(s)
	if !r.IsValid() {
		return "", fmt.Errorf("invalid team role: %s", s)
	}
	return r, nil
}
