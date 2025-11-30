package valueobject

import "fmt"

// SubscriptionStatus represents the status of a company's subscription.
type SubscriptionStatus string

const (
	SubscriptionStatusNone     SubscriptionStatus = "none"
	SubscriptionStatusActive   SubscriptionStatus = "active"
	SubscriptionStatusPastDue  SubscriptionStatus = "past_due"
	SubscriptionStatusCanceled SubscriptionStatus = "canceled"
)

// String returns the string representation of the subscription status.
func (s SubscriptionStatus) String() string {
	return string(s)
}

// IsValid checks if the status is a valid value.
func (s SubscriptionStatus) IsValid() bool {
	switch s {
	case SubscriptionStatusNone, SubscriptionStatusActive, SubscriptionStatusPastDue, SubscriptionStatusCanceled:
		return true
	}
	return false
}

// IsActive returns true if the subscription is in good standing.
func (s SubscriptionStatus) IsActive() bool {
	return s == SubscriptionStatusActive
}

// HasAccess returns true if the user should have access to paid features.
// This includes active and past_due (grace period) statuses.
func (s SubscriptionStatus) HasAccess() bool {
	return s == SubscriptionStatusActive || s == SubscriptionStatusPastDue
}

// ParseSubscriptionStatus converts a string to a SubscriptionStatus, returning an error if invalid.
func ParseSubscriptionStatus(s string) (SubscriptionStatus, error) {
	status := SubscriptionStatus(s)
	if !status.IsValid() {
		return "", fmt.Errorf("invalid subscription status: %s", s)
	}
	return status, nil
}

// AllSubscriptionStatuses returns all valid subscription status values.
func AllSubscriptionStatuses() []SubscriptionStatus {
	return []SubscriptionStatus{
		SubscriptionStatusNone,
		SubscriptionStatusActive,
		SubscriptionStatusPastDue,
		SubscriptionStatusCanceled,
	}
}
