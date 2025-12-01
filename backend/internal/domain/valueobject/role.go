package valueobject

import "fmt"

// Role represents a user's role within a company.
// LMS roles: Admin manages company, Instructor creates content, SME reviews.
type Role string

const (
	// RoleAdmin has full access to manage company, billing, and users.
	RoleAdmin Role = "admin"
	// RoleInstructor can create and manage course content.
	RoleInstructor Role = "instructor"
	// RoleSME (Subject Matter Expert) can review and contribute to content.
	RoleSME Role = "sme"

	// Deprecated: Use RoleAdmin instead.
	RoleOwner Role = "owner"
	// Deprecated: Use RoleSME instead.
	RoleMember Role = "member"
)

// String returns the string representation of the role.
func (r Role) String() string {
	return string(r)
}

// IsValid checks if the role is a valid value.
func (r Role) IsValid() bool {
	switch r {
	case RoleAdmin, RoleInstructor, RoleSME:
		return true
	// Accept deprecated roles for backward compatibility during migration
	case RoleOwner, RoleMember:
		return true
	}
	return false
}

// Normalize converts deprecated roles to their new equivalents.
func (r Role) Normalize() Role {
	switch r {
	case RoleOwner:
		return RoleAdmin
	case RoleMember:
		return RoleSME
	default:
		return r
	}
}

// CanManageBilling returns true if this role can manage billing.
func (r Role) CanManageBilling() bool {
	return r.Normalize() == RoleAdmin
}

// CanManageCompany returns true if this role can update company settings.
func (r Role) CanManageCompany() bool {
	return r.Normalize() == RoleAdmin
}

// CanManageTeams returns true if this role can create/update/delete teams.
func (r Role) CanManageTeams() bool {
	return r.Normalize() == RoleAdmin
}

// CanInviteUsers returns true if this role can invite users to the company.
func (r Role) CanInviteUsers() bool {
	return r.Normalize() == RoleAdmin
}

// CanManageSettings returns true if this role can manage tenant settings (AI config, etc.).
func (r Role) CanManageSettings() bool {
	return r.Normalize() == RoleAdmin
}

// CanManageSME returns true if this role can manage SME entities.
func (r Role) CanManageSME() bool {
	normalized := r.Normalize()
	return normalized == RoleAdmin || normalized == RoleInstructor
}

// CanCreateCourses returns true if this role can create courses.
func (r Role) CanCreateCourses() bool {
	normalized := r.Normalize()
	return normalized == RoleAdmin || normalized == RoleInstructor
}

// CanEditCourses returns true if this role can edit courses.
func (r Role) CanEditCourses() bool {
	normalized := r.Normalize()
	return normalized == RoleAdmin || normalized == RoleInstructor || normalized == RoleSME
}

// CanPublishCourses returns true if this role can publish courses.
func (r Role) CanPublishCourses() bool {
	normalized := r.Normalize()
	return normalized == RoleAdmin || normalized == RoleInstructor
}

// CanExportCourses returns true if this role can export courses to SCORM.
func (r Role) CanExportCourses() bool {
	normalized := r.Normalize()
	return normalized == RoleAdmin || normalized == RoleInstructor
}

// ParseRole converts a string to a Role, returning an error if invalid.
func ParseRole(s string) (Role, error) {
	r := Role(s)
	if !r.IsValid() {
		return "", fmt.Errorf("invalid role: %s", s)
	}
	return r, nil
}

// AllRoles returns all valid role values (excluding deprecated).
func AllRoles() []Role {
	return []Role{RoleAdmin, RoleInstructor, RoleSME}
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
