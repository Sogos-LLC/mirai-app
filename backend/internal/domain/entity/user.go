package entity

import (
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// User represents a user in the system linked to a Kratos identity.
type User struct {
	ID        uuid.UUID
	KratosID  uuid.UUID
	CompanyID *uuid.UUID
	Role      valueobject.Role
	CreatedAt time.Time
	UpdatedAt time.Time
}

// IsOwner returns true if the user is a company owner.
func (u *User) IsOwner() bool {
	return u.Role == valueobject.RoleOwner
}

// IsAdmin returns true if the user is a company admin.
func (u *User) IsAdmin() bool {
	return u.Role == valueobject.RoleAdmin
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

// UserWithCompany combines a user with their company data.
type UserWithCompany struct {
	User    *User
	Company *Company
}
