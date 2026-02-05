// Package temporal provides Temporal client and worker setup for the Mirai backend.
package temporal

import (
	"context"
	"fmt"
	"log/slog"

	temporalclient "go.temporal.io/sdk/client"
	"go.temporal.io/sdk/interceptor"

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

	// SignalWorkflow sends a named signal with payload to a running workflow.
	SignalWorkflow(ctx context.Context, workflowID, signalName string, payload interface{}) error

	// CancelWorkflow cancels a running workflow by its execution ID.
	CancelWorkflow(ctx context.Context, workflowID, runID string) error
}

// Client wraps the Temporal SDK client.
type Client struct {
	inner  temporalclient.Client
	logger *slog.Logger
}

// NewClient creates a new Temporal client with optional interceptors (e.g. OTel tracing).
func NewClient(address, namespace string, logger *slog.Logger, interceptors ...interceptor.ClientInterceptor) (*Client, error) {
	opts := temporalclient.Options{
		HostPort:  address,
		Namespace: namespace,
		Logger:    newSlogAdapter(logger),
	}
	if len(interceptors) > 0 {
		opts.Interceptors = interceptors
	}

	c, err := temporalclient.Dial(opts)
	if err != nil {
		return nil, fmt.Errorf("temporal dial: %w", err)
	}

	logger.Info("temporal client connected", "address", address, "namespace", namespace)
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

// CourseCreationInput is the input for the unified Python CourseCreationWorkflow.
// Defined here (not in workflow package) because the workflow runs on the Python ai-tasks queue.
type CourseCreationInput struct {
	JobID                string            `json:"job_id"`
	TenantID             string            `json:"tenant_id"`
	CourseID             string            `json:"course_id"`
	UserID               string            `json:"user_id"`
	CourseName           string            `json:"course_name"`
	DesiredOutcomes      string            `json:"desired_outcomes"`
	AdditionalContext    string            `json:"additional_context"`
	InternalDataOnly     bool              `json:"internal_data_only"`
	SelectedTeamDocIDs   []string          `json:"selected_team_doc_ids"`
	SelectedGlobalDocIDs []string          `json:"selected_global_doc_ids"`
	RAGFilters           map[string]string `json:"rag_filters"`
}

const aiTaskQueue = "ai-tasks"

func (s *workflowStarter) StartCourseCreation(ctx context.Context, input interface{}) (string, error) {
	ccInput, ok := input.(CourseCreationInput)
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

func (s *workflowStarter) SignalWorkflow(ctx context.Context, workflowID, signalName string, payload interface{}) error {
	return s.client.SignalWorkflow(ctx, workflowID, "", signalName, payload)
}
