package temporal

import (
	"log/slog"

	temporalclient "go.temporal.io/sdk/client"
	temporalworker "go.temporal.io/sdk/worker"

	"github.com/sogos/mirai-backend/internal/application/workflow"
	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// GoTaskQueue is the task queue for Go-side activities and workflows.
const GoTaskQueue = "go-tasks"

// NewWorker creates a Temporal worker for the go-tasks queue.
// It registers all workflows and Go-side activities.
func NewWorker(
	client temporalclient.Client,
	goActivities *activities.GoActivities,
	opsActivities *activities.OpsActivities,
	logger *slog.Logger,
) temporalworker.Worker {
	w := temporalworker.New(client, GoTaskQueue, temporalworker.Options{
		MaxConcurrentActivityExecutionSize:     20,
		MaxConcurrentWorkflowTaskExecutionSize: 10,
	})

	// Register infrastructure workflows (AI generation workflows now run in Python on ai-tasks)
	w.RegisterWorkflow(workflow.KnowledgeIngestionWorkflow)
	w.RegisterWorkflow(workflow.CourseExportWorkflow)

	// Register operational workflows
	w.RegisterWorkflow(workflow.StripeProvisionWorkflow)
	w.RegisterWorkflow(workflow.CleanupExpiredWorkflow)
	w.RegisterWorkflow(workflow.FeedbackSyncWorkflow)
	w.RegisterWorkflow(workflow.ShareContentWorkflow)

	// Register Go-side activities (run on go-tasks queue)
	w.RegisterActivity(goActivities)
	if opsActivities != nil {
		w.RegisterActivity(opsActivities)
	}

	logger.Info("temporal worker configured", "taskQueue", GoTaskQueue)
	return w
}
