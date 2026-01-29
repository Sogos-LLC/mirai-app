package service

import "context"

// CRMProvider abstracts CRM operations for feedback sync.
type CRMProvider interface {
	// FindOrCreateContact finds an existing contact by email or creates a new one.
	// Returns the contact ID.
	FindOrCreateContact(ctx context.Context, email, firstName, lastName string) (contactID string, err error)

	// CreateFeedback creates a Feedback custom object linked to a contact.
	CreateFeedback(ctx context.Context, req CreateFeedbackRequest) error
}

// CreateFeedbackRequest contains data for creating a Feedback object in CRM.
type CreateFeedbackRequest struct {
	PersonID     string
	Category     string // BUG, FEATURE_REQUEST, GENERAL, COMPLAINT
	Content      string
	PagePath     string
	FeatureArea  string
	AppVersion   string
	UserAgent    string
}
