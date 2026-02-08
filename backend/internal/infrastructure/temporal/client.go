// Package temporal provides Temporal client and worker setup for the Mirai backend.
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	temporalclient "go.temporal.io/sdk/client"
	"go.temporal.io/sdk/interceptor"

	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/application/workflow"
	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
)

// WorkflowStarter abstracts Temporal workflow execution for the application layer.
// It replaces the previous TaskEnqueuer interface (Asynq).
type WorkflowStarter interface {
	// StartKnowledgeIngestion starts the knowledge ingestion workflow.
	StartKnowledgeIngestion(ctx context.Context, sourceID, tenantID, teamID, filePath string) (string, error)

	// StartCourseExport starts the course export workflow.
	StartCourseExport(ctx context.Context, exportID, tenantID string) (string, error)

	// StartStripeProvision starts the Stripe provisioning workflow.
	StartStripeProvision(ctx context.Context, sessionID, customerID, subscriptionID string) (string, error)

	// StartFeedbackSync starts the feedback sync workflow.
	StartFeedbackSync(ctx context.Context, input activities.FeedbackSyncInput) (string, error)

	// StartCourseCreation starts the unified course creation workflow (Python).
	StartCourseCreation(ctx context.Context, input interface{}) (string, error)

	// QueryWorkflow queries a running workflow for its current state.
	QueryWorkflow(ctx context.Context, workflowID, queryType string) (map[string]interface{}, error)

	// UpdateWorkflow sends a synchronous update to a running workflow.
	UpdateWorkflow(ctx context.Context, workflowID, updateName string, args interface{}) error

	// CancelWorkflow cancels a running workflow by its execution ID.
	CancelWorkflow(ctx context.Context, workflowID, runID string) error

	// IsWorkflowRunning checks if a workflow execution is still open (running).
	IsWorkflowRunning(ctx context.Context, workflowID string) (bool, error)

	// ExecuteWizardStep starts a WizardStepWorkflow and blocks until completion.
	// Returns the activity result as a map.
	ExecuteWizardStep(ctx context.Context, stepType string, input interface{}) (map[string]interface{}, error)
}

// Client wraps the Temporal SDK client.
type Client struct {
	inner  temporalclient.Client
	logger *slog.Logger
}

// NewClient creates a new Temporal client with optional interceptors (e.g. OTel tracing).
// Uses NewLazyClient to avoid blocking startup on the gRPC connection — the connection
// is established on first RPC call instead.
func NewClient(address, namespace string, logger *slog.Logger, interceptors ...interceptor.ClientInterceptor) (*Client, error) {
	opts := temporalclient.Options{
		HostPort:  address,
		Namespace: namespace,
		Logger:    newSlogAdapter(logger),
	}
	if len(interceptors) > 0 {
		opts.Interceptors = interceptors
	}

	c, err := temporalclient.NewLazyClient(opts)
	if err != nil {
		return nil, fmt.Errorf("temporal lazy client: %w", err)
	}

	logger.Info("temporal client initialized (lazy)", "address", address, "namespace", namespace)
	return &Client{inner: c, logger: logger}, nil
}

// Inner returns the raw Temporal client for worker setup.
func (c *Client) Inner() temporalclient.Client {
	return c.inner
}

// Close closes the Temporal client connection.
func (c *Client) Close() {
	c.inner.Close()
}

// Starter returns a WorkflowStarter that uses this client.
func (c *Client) Starter(goTaskQueue string) WorkflowStarter {
	return &workflowStarter{
		client:      c.inner,
		goTaskQueue: goTaskQueue,
		logger:      c.logger,
	}
}

// workflowStarter implements WorkflowStarter using the Temporal client.
type workflowStarter struct {
	client      temporalclient.Client
	goTaskQueue string
	logger      *slog.Logger
}

func (s *workflowStarter) StartKnowledgeIngestion(ctx context.Context, sourceID, tenantID, teamID, filePath string) (string, error) {
	opts := temporalclient.StartWorkflowOptions{
		ID:        fmt.Sprintf("knowledge-%s", sourceID),
		TaskQueue: s.goTaskQueue,
	}
	input := workflow.KnowledgeIngestionInput{
		SourceID: sourceID,
		TenantID: tenantID,
		TeamID:   teamID,
		FilePath: filePath,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "KnowledgeIngestionWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("start knowledge ingestion workflow: %w", err)
	}
	return run.GetID(), nil
}

func (s *workflowStarter) StartCourseExport(ctx context.Context, exportID, tenantID string) (string, error) {
	opts := temporalclient.StartWorkflowOptions{
		ID:        fmt.Sprintf("export-%s", exportID),
		TaskQueue: s.goTaskQueue,
	}
	input := workflow.CourseExportInput{
		ExportID: exportID,
		TenantID: tenantID,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "CourseExportWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("start course export workflow: %w", err)
	}
	return run.GetID(), nil
}

func (s *workflowStarter) StartStripeProvision(ctx context.Context, sessionID, customerID, subscriptionID string) (string, error) {
	opts := temporalclient.StartWorkflowOptions{
		ID:        fmt.Sprintf("provision-%s", sessionID),
		TaskQueue: s.goTaskQueue,
	}
	input := activities.StripeProvisionInput{
		SessionID:      sessionID,
		CustomerID:     customerID,
		SubscriptionID: subscriptionID,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "StripeProvisionWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("start provision workflow: %w", err)
	}
	return run.GetID(), nil
}

func (s *workflowStarter) StartFeedbackSync(ctx context.Context, input activities.FeedbackSyncInput) (string, error) {
	opts := temporalclient.StartWorkflowOptions{
		ID:        fmt.Sprintf("feedback-%s", input.UserID),
		TaskQueue: s.goTaskQueue,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "FeedbackSyncWorkflow", input)
	if err != nil {
		return "", fmt.Errorf("start feedback sync workflow: %w", err)
	}
	return run.GetID(), nil
}

func (s *workflowStarter) CancelWorkflow(ctx context.Context, workflowID, runID string) error {
	return s.client.CancelWorkflow(ctx, workflowID, runID)
}

func (s *workflowStarter) QueryWorkflow(ctx context.Context, workflowID, queryType string) (map[string]interface{}, error) {
	resp, err := s.client.QueryWorkflow(ctx, workflowID, "", queryType)
	if err != nil {
		return nil, fmt.Errorf("query workflow %s: %w", workflowID, err)
	}

	var result map[string]interface{}
	if err := resp.Get(&result); err != nil {
		return nil, fmt.Errorf("decode query result: %w", err)
	}

	return result, nil
}

func (s *workflowStarter) UpdateWorkflow(ctx context.Context, workflowID, updateName string, args interface{}) error {
	handle, err := s.client.UpdateWorkflow(ctx, temporalclient.UpdateWorkflowOptions{
		WorkflowID:   workflowID,
		UpdateName:   updateName,
		Args:         []interface{}{args},
		WaitForStage: temporalclient.WorkflowUpdateStageCompleted,
	})
	if err != nil {
		return fmt.Errorf("update workflow %s/%s: %w", workflowID, updateName, err)
	}

	// Wait for the update to complete
	if err := handle.Get(ctx, nil); err != nil {
		return fmt.Errorf("update workflow result %s/%s: %w", workflowID, updateName, err)
	}

	return nil
}

const aiTaskQueue = "ai-tasks"

func (s *workflowStarter) StartCourseCreation(ctx context.Context, input interface{}) (string, error) {
	ccInput, ok := input.(service.CourseCreationInput)
	if !ok {
		return "", fmt.Errorf("invalid input type for course creation workflow")
	}

	opts := temporalclient.StartWorkflowOptions{
		ID:        fmt.Sprintf("course-creation-%s", ccInput.JobID),
		TaskQueue: aiTaskQueue,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "CourseCreationWorkflow", ccInput)
	if err != nil {
		return "", fmt.Errorf("start course creation workflow: %w", err)
	}
	s.logger.Info("started course creation workflow",
		"workflowID", run.GetID(), "jobID", ccInput.JobID, "courseID", ccInput.CourseID)
	return run.GetID(), nil
}

func (s *workflowStarter) ExecuteWizardStep(ctx context.Context, stepType string, input interface{}) (map[string]interface{}, error) {
	workflowID := fmt.Sprintf("wizard-step-%s-%d", stepType, time.Now().UnixNano())
	opts := temporalclient.StartWorkflowOptions{
		ID:        workflowID,
		TaskQueue: aiTaskQueue,
	}
	run, err := s.client.ExecuteWorkflow(ctx, opts, "WizardStepWorkflow", input)
	if err != nil {
		return nil, fmt.Errorf("start wizard step workflow: %w", err)
	}

	var result map[string]interface{}
	if err := run.Get(ctx, &result); err != nil {
		return nil, fmt.Errorf("wizard step workflow result: %w", err)
	}

	return result, nil
}

func (s *workflowStarter) IsWorkflowRunning(ctx context.Context, workflowID string) (bool, error) {
	resp, err := s.client.DescribeWorkflowExecution(ctx, workflowID, "")
	if err != nil {
		return false, fmt.Errorf("describe workflow %s: %w", workflowID, err)
	}
	status := resp.WorkflowExecutionInfo.Status
	return status == 1, nil // 1 = WORKFLOW_EXECUTION_STATUS_RUNNING
}

