package valueobject

import "fmt"

// InvitationStatus represents the status of an invitation.
type InvitationStatus string

const (
	InvitationStatusPending  InvitationStatus = "pending"
	InvitationStatusAccepted InvitationStatus = "accepted"
	InvitationStatusExpired  InvitationStatus = "expired"
	InvitationStatusRevoked  InvitationStatus = "revoked"
)

// String returns the string representation of the status.
func (s InvitationStatus) String() string {
	return string(s)
}

// IsValid checks if the status is valid.
func (s InvitationStatus) IsValid() bool {
	switch s {
	case InvitationStatusPending, InvitationStatusAccepted,
		InvitationStatusExpired, InvitationStatusRevoked:
		return true
	}
	return false
}

// IsPending returns true if the status is pending.
func (s InvitationStatus) IsPending() bool {
	return s == InvitationStatusPending
}

// IsTerminal returns true if the status is a terminal state.
func (s InvitationStatus) IsTerminal() bool {
	return s == InvitationStatusAccepted || s == InvitationStatusExpired || s == InvitationStatusRevoked
}

// ParseInvitationStatus parses a string into an InvitationStatus.
func ParseInvitationStatus(s string) (InvitationStatus, error) {
	status := InvitationStatus(s)
	if !status.IsValid() {
		return "", fmt.Errorf("invalid invitation status: %s", s)
	}
	return status, nil
}
