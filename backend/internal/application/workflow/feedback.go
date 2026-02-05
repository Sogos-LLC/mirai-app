package workflow

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// FeedbackSyncWorkflow syncs user feedback to the CRM.
func FeedbackSyncWorkflow(ctx workflow.Context, input activities.FeedbackSyncInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting feedback sync", "userID", input.UserID)

	goCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	if err := workflow.ExecuteActivity(goCtx, "SyncFeedback", input).Get(ctx, nil); err != nil {
		return fmt.Errorf("sync feedback: %w", err)
	}

	logger.Info("feedback sync completed", "userID", input.UserID)
	return nil
}
