package activities

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"

	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
)

// StripeProvisionInput is the input for Stripe provisioning workflows/activities.
type StripeProvisionInput struct {
	SessionID      string `json:"session_id"`
	CustomerID     string `json:"customer_id"`
	SubscriptionID string `json:"subscription_id"`
}

// FeedbackSyncInput is the input for feedback sync workflows/activities.
type FeedbackSyncInput struct {
	UserID       string `json:"user_id"`
	UserEmail    string `json:"user_email"`
	UserName     string `json:"user_name"`
	FeedbackType string `json:"feedback_type"`
	Message      string `json:"message"`
	PageURL      string `json:"page_url"`
	UserAgent    string `json:"user_agent"`
}

// AccountProvisioner abstracts account provisioning logic.
type AccountProvisioner interface {
	ProvisionByCheckoutSession(ctx context.Context, sessionID string) error
}

// CleanupRunner abstracts expired registration cleanup.
type CleanupRunner interface {
	CleanupExpired(ctx context.Context) error
}

// CRMUserRepository is a subset of UserRepository for CRM operations.
type CRMUserRepository interface {
	GetCRMContactID(ctx context.Context, id uuid.UUID) (string, error)
	UpdateCRMContactID(ctx context.Context, id uuid.UUID, crmContactID string) error
}

// OpsActivities holds dependencies for non-AI operational activities.
type OpsActivities struct {
	Provisioner AccountProvisioner
	Cleanup     CleanupRunner
	CRMProvider domainservice.CRMProvider
	UserRepo    CRMUserRepository
}

// ProvisionAccount provisions an account after Stripe checkout.
func (a *OpsActivities) ProvisionAccount(ctx context.Context, input StripeProvisionInput) error {
	if a.Provisioner == nil {
		return fmt.Errorf("provisioner not configured")
	}
	// Use superadmin context for provisioning (worker has no user session)
	adminCtx := tenant.WithSuperAdmin(ctx, true)
	return a.Provisioner.ProvisionByCheckoutSession(adminCtx, input.SessionID)
}

// CleanupExpired cleans up expired pending registrations.
func (a *OpsActivities) CleanupExpired(ctx context.Context) error {
	if a.Cleanup == nil {
		return fmt.Errorf("cleanup runner not configured")
	}
	return a.Cleanup.CleanupExpired(ctx)
}

// SyncFeedback syncs user feedback to the CRM.
func (a *OpsActivities) SyncFeedback(ctx context.Context, input FeedbackSyncInput) error {
	if a.CRMProvider == nil {
		return nil // CRM not configured, skip silently
	}

	// Use superadmin context for cross-tenant operations
	adminCtx := tenant.WithSuperAdmin(ctx, true)

	userID, err := uuid.Parse(input.UserID)
	if err != nil {
		return fmt.Errorf("parse user ID: %w", err)
	}

	// Get user's CRM contact ID from DB
	crmContactID, err := a.UserRepo.GetCRMContactID(adminCtx, userID)
	if err != nil {
		return fmt.Errorf("get CRM contact ID: %w", err)
	}

	// If no CRM contact ID, create/find the contact in CRM
	if crmContactID == "" {
		firstName, lastName := splitName(input.UserName)

		crmContactID, err = a.CRMProvider.FindOrCreateContact(ctx, input.UserEmail, firstName, lastName)
		if err != nil {
			return fmt.Errorf("find/create CRM contact: %w", err)
		}

		// Cache the CRM contact ID
		_ = a.UserRepo.UpdateCRMContactID(adminCtx, userID, crmContactID)
	}

	// Create the Feedback custom object in CRM
	return a.CRMProvider.CreateFeedback(ctx, domainservice.CreateFeedbackRequest{
		PersonID:    crmContactID,
		Category:    feedbackTypeToCategory(input.FeedbackType),
		Content:     input.Message,
		PagePath:    input.PageURL,
		FeatureArea: "",
		AppVersion:  "",
		UserAgent:   input.UserAgent,
	})
}

// splitName splits a full name into first and last name.
func splitName(name string) (firstName, lastName string) {
	parts := strings.SplitN(strings.TrimSpace(name), " ", 2)
	firstName = parts[0]
	if len(parts) > 1 {
		lastName = parts[1]
	}
	return
}

// feedbackTypeToCategory converts feedback type to CRM category enum.
func feedbackTypeToCategory(feedbackType string) string {
	switch feedbackType {
	case "bug_report":
		return "BUG"
	case "feature_request":
		return "FEATURE_REQUEST"
	case "complaint":
		return "COMPLAINT"
	default:
		return "GENERAL"
	}
}
