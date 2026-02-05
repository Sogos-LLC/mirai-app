package workflow

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// StripeProvisionWorkflow provisions an account after Stripe checkout.
func StripeProvisionWorkflow(ctx workflow.Context, input activities.StripeProvisionInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting stripe provisioning", "sessionID", input.SessionID)

	goCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 5,
		},
	})

	if err := workflow.ExecuteActivity(goCtx, "ProvisionAccount", input).Get(ctx, nil); err != nil {
		return fmt.Errorf("provision account: %w", err)
	}

	logger.Info("stripe provisioning completed", "sessionID", input.SessionID)
	return nil
}

// CleanupExpiredWorkflow cleans up expired pending registrations.
func CleanupExpiredWorkflow(ctx workflow.Context) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("starting cleanup of expired registrations")

	goCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 1 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	})

	if err := workflow.ExecuteActivity(goCtx, "CleanupExpired").Get(ctx, nil); err != nil {
		return fmt.Errorf("cleanup expired: %w", err)
	}

	logger.Info("cleanup completed")
	return nil
}
