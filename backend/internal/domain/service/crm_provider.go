package service

import "context"

// CRMProvider abstracts CRM operations for feedback sync.
type CRMProvider interface {
	// FindOrCreateContact finds an existing contact by email or creates a new one.
	// Returns the contact ID.
	FindOrCreateContact(ctx context.Context, email, firstName, lastName string) (contactID string, err error)

	// CreateFeedbackNote creates a note linked to a contact with feedback details.
	CreateFeedbackNote(ctx context.Context, req CreateFeedbackNoteRequest) error
}

// CreateFeedbackNoteRequest contains data for creating a feedback note in CRM.
type CreateFeedbackNoteRequest struct {
	ContactID    string
	FeedbackType string // bug_report, feature_request, general
	Message      string
	PageURL      string
	UserAgent    string
}
