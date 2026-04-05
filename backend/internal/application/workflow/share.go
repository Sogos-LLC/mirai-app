package workflow

import (
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// ShareContentWorkflow snapshots course content for a share link, then sends emails.
//
// Flow:
//  1. UpdateShareLinkStatus → "snapshotting"
//  2. SnapshotShareContent → copy content.json to shared/{id}/content.json
//  3. UpdateShareLinkStatus → "ready" + snapshot path
//  4. SendShareEmails → invite reviewers + confirm creator
//
// On failure at step 2: set status to "failed".
func ShareContentWorkflow(ctx workflow.Context, input ShareContentInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting share content workflow", "shareLinkID", input.ShareLinkID)

	actOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, actOpts)

	var ga *activities.GoActivities

	// Step 1: Mark as snapshotting
	err := workflow.ExecuteActivity(ctx, ga.UpdateShareLinkStatus, activities.UpdateShareLinkStatusInput{
		ShareLinkID: input.ShareLinkID,
		Status:      "snapshotting",
	}).Get(ctx, nil)
	if err != nil {
		return err
	}

	// Step 2: Snapshot content
	var snapshotOutput activities.SnapshotShareContentOutput
	err = workflow.ExecuteActivity(ctx, ga.SnapshotShareContent, activities.SnapshotShareContentInput{
		TenantID:    input.TenantID,
		CourseID:    input.CourseID,
		ShareLinkID: input.ShareLinkID,
	}).Get(ctx, &snapshotOutput)
	if err != nil {
		// Mark as failed
		_ = workflow.ExecuteActivity(ctx, ga.UpdateShareLinkStatus, activities.UpdateShareLinkStatusInput{
			ShareLinkID: input.ShareLinkID,
			Status:      "failed",
		}).Get(ctx, nil)
		return err
	}

	// Step 3: Mark as ready with snapshot path
	err = workflow.ExecuteActivity(ctx, ga.UpdateShareLinkStatus, activities.UpdateShareLinkStatusInput{
		ShareLinkID:  input.ShareLinkID,
		Status:       "ready",
		SnapshotPath: snapshotOutput.SnapshotPath,
	}).Get(ctx, nil)
	if err != nil {
		return err
	}

	// Step 4: Send emails (best-effort, don't fail workflow on email errors)
	_ = workflow.ExecuteActivity(ctx, ga.SendShareEmails, activities.SendShareEmailsInput{
		CreatorEmail:  input.CreatorEmail,
		CreatorName:   input.CreatorName,
		CourseTitle:   input.CourseTitle,
		AllowedEmails: input.AllowedEmails,
		ShareURL:      input.ShareURL,
	}).Get(ctx, nil)

	logger.Info("share content workflow completed", "shareLinkID", input.ShareLinkID)
	return nil
}
