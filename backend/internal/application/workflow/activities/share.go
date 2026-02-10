package activities

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"go.temporal.io/sdk/activity"

	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
)

// SnapshotShareContentInput is the input for the SnapshotShareContent activity.
type SnapshotShareContentInput struct {
	TenantID    string `json:"tenant_id"`
	CourseID    string `json:"course_id"`
	ShareLinkID string `json:"share_link_id"`
}

// SnapshotShareContentOutput is the output from the SnapshotShareContent activity.
type SnapshotShareContentOutput struct {
	SnapshotPath string `json:"snapshot_path"`
}

// SnapshotShareContent copies course content.json to a snapshot path for the share link.
func (a *GoActivities) SnapshotShareContent(ctx context.Context, input SnapshotShareContentInput) (*SnapshotShareContentOutput, error) {
	sourcePath := fmt.Sprintf("tenants/%s/courses/%s/content.json", input.TenantID, input.CourseID)
	snapshotPath := fmt.Sprintf("tenants/%s/shared/%s/content.json", input.TenantID, input.ShareLinkID)

	data, err := a.ContentStorage.GetContent(ctx, sourcePath)
	if err != nil {
		return nil, fmt.Errorf("read course content: %w", err)
	}

	if err := a.ContentStorage.PutContent(ctx, snapshotPath, data, "application/json"); err != nil {
		return nil, fmt.Errorf("write snapshot content: %w", err)
	}

	activity.GetLogger(ctx).Info("share content snapshot created",
		"shareLinkID", input.ShareLinkID,
		"snapshotPath", snapshotPath,
	)

	return &SnapshotShareContentOutput{SnapshotPath: snapshotPath}, nil
}

// UpdateShareLinkStatusInput is the input for the UpdateShareLinkStatus activity.
type UpdateShareLinkStatusInput struct {
	ShareLinkID  string `json:"share_link_id"`
	Status       string `json:"status"`
	SnapshotPath string `json:"snapshot_path,omitempty"`
}

// UpdateShareLinkStatus updates the share link status in the database.
func (a *GoActivities) UpdateShareLinkStatus(ctx context.Context, input UpdateShareLinkStatusInput) error {
	linkID, err := uuid.Parse(input.ShareLinkID)
	if err != nil {
		return fmt.Errorf("parse share link ID: %w", err)
	}

	if err := a.ShareLinkRepo.UpdateStatus(ctx, linkID, input.Status, input.SnapshotPath); err != nil {
		return fmt.Errorf("update share link status: %w", err)
	}

	activity.GetLogger(ctx).Info("share link status updated",
		"shareLinkID", input.ShareLinkID,
		"status", input.Status,
	)
	return nil
}

// SendShareEmailsInput is the input for the SendShareEmails activity.
type SendShareEmailsInput struct {
	CreatorEmail  string   `json:"creator_email"`
	CreatorName   string   `json:"creator_name"`
	CourseTitle   string   `json:"course_title"`
	AllowedEmails []string `json:"allowed_emails"`
	ShareURL      string   `json:"share_url"`
}

// SendShareEmails sends invitation emails to reviewers and a confirmation to the creator.
func (a *GoActivities) SendShareEmails(ctx context.Context, input SendShareEmailsInput) error {
	// Send invitation to each reviewer
	for _, email := range input.AllowedEmails {
		if err := a.EmailProvider.SendShareInvitation(ctx, domainservice.SendShareInvitationRequest{
			To:          email,
			CourseTitle: input.CourseTitle,
			CreatorName: input.CreatorName,
			ShareURL:    input.ShareURL,
		}); err != nil {
			activity.GetLogger(ctx).Warn("failed to send share invitation",
				"email", email, "error", err)
			// Continue sending to other emails
		}
	}

	// Send confirmation to creator
	if err := a.EmailProvider.SendShareConfirmation(ctx, domainservice.SendShareConfirmationRequest{
		To:            input.CreatorEmail,
		CourseTitle:   input.CourseTitle,
		ShareURL:      input.ShareURL,
		AllowedEmails: input.AllowedEmails,
	}); err != nil {
		activity.GetLogger(ctx).Warn("failed to send share confirmation",
			"email", input.CreatorEmail, "error", err)
	}

	activity.GetLogger(ctx).Info("share emails sent",
		"reviewerCount", len(input.AllowedEmails),
	)
	return nil
}
