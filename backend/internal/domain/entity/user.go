package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// User represents a user in the system linked to a Kratos identity.
type User struct {
	ID        uuid.UUID
	TenantID  *uuid.UUID // Tenant for RLS isolation
	KratosID  uuid.UUID
	CompanyID *uuid.UUID
	Role      valueobject.Role
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IsOwner returns true if the user is a company owner/admin.
// Deprecated: Use IsAdmin instead.
func (u *User) IsOwner() bool {
	return u.Role.Normalize() == valueobject.RoleAdmin
}

// IsAdmin returns true if the user is a company admin.
func (u *User) IsAdmin() bool {
	return u.Role.Normalize() == valueobject.RoleAdmin
}

// IsInstructor returns true if the user is an instructor.
func (u *User) IsInstructor() bool {
	return u.Role.Normalize() == valueobject.RoleInstructor
}

// IsSME returns true if the user is a subject matter expert.
func (u *User) IsSME() bool {
	return u.Role.Normalize() == valueobject.RoleSME
}

// HasTenant returns true if the user is associated with a tenant.
func (u *User) HasTenant() bool {
	return u.TenantID != nil
}

// HasCompany returns true if the user is associated with a company.
func (u *User) HasCompany() bool {
	return u.CompanyID != nil
}

// CanManageBilling returns true if the user can manage billing.
func (u *User) CanManageBilling() bool {
	return u.Role.CanManageBilling()
}

// CanManageCompany returns true if the user can manage company settings.
func (u *User) CanManageCompany() bool {
	return u.Role.CanManageCompany()
}

// CanManageTeams returns true if the user can manage teams.
func (u *User) CanManageTeams() bool {
	return u.Role.CanManageTeams()
}

// CanInviteUsers returns true if the user can invite users.
func (u *User) CanInviteUsers() bool {
	return u.Role.CanInviteUsers()
}

// CanCreateCourses returns true if the user can create courses.
func (u *User) CanCreateCourses() bool {
	return u.Role.CanCreateCourses()
}

// CanEditCourses returns true if the user can edit courses.
func (u *User) CanEditCourses() bool {
	return u.Role.CanEditCourses()
}

// CanPublishCourses returns true if the user can publish courses.
func (u *User) CanPublishCourses() bool {
	return u.Role.CanPublishCourses()
}

// CanExportCourses returns true if the user can export courses to SCORM.
func (u *User) CanExportCourses() bool {
	return u.Role.CanExportCourses()
}

// UserWithCompany combines a user with their company data.
type UserWithCompany struct {
	User    *User
	Company *Company
}
