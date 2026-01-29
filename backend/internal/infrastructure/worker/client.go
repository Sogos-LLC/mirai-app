package worker

import (
	"github.com/hibiken/asynq"

	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/worker"
)

// Client wraps the Asynq client for enqueueing tasks.
type Client struct {
	client *asynq.Client
	logger domainservice.Logger
}

// NewClient creates a new Asynq client wrapper.
func NewClient(redisAddr string, logger domainservice.Logger) *Client {
	client := asynq.NewClient(asynq.RedisClientOpt{Addr: redisAddr})
	return &Client{
		client: client,
		logger: logger,
	}
}

// Close closes the underlying Asynq client connection.
func (c *Client) Close() error {
	return c.client.Close()
}

// EnqueueStripeProvision enqueues a Stripe provisioning task.
func (c *Client) EnqueueStripeProvision(sessionID, customer, subscriptionID string) error {
	task, err := worker.NewStripeProvisionTask(sessionID, customer, subscriptionID)
	if err != nil {
		c.logger.Error("failed to create stripe provision task", "error", err)
		return err
	}

	info, err := c.client.Enqueue(task)
	if err != nil {
		c.logger.Error("failed to enqueue stripe provision task",
			"checkoutSessionID", sessionID,
			"error", err,
		)
		return err
	}

	c.logger.Info("enqueued stripe provision task",
		"taskID", info.ID,
		"queue", info.Queue,
		"checkoutSessionID", sessionID,
	)
	return nil
}

// EnqueueAIGeneration enqueues an AI generation task.
func (c *Client) EnqueueAIGeneration(jobID, jobType string) error {
	task, err := worker.NewAIGenerationTask(jobID, jobType)
	if err != nil {
		c.logger.Error("failed to create AI generation task", "error", err)
		return err
	}

	info, err := c.client.Enqueue(task)
	if err != nil {
		c.logger.Error("failed to enqueue AI generation task",
			"jobID", jobID,
			"jobType", jobType,
			"error", err,
		)
		return err
	}

	c.logger.Info("enqueued AI generation task",
		"taskID", info.ID,
		"queue", info.Queue,
		"jobID", jobID,
		"jobType", jobType,
	)
	return nil
}

// EnqueueCourseExport enqueues a course export task.
func (c *Client) EnqueueCourseExport(exportID, tenantID string) error {
	task, err := worker.NewCourseExportTask(exportID, tenantID)
	if err != nil {
		c.logger.Error("failed to create course export task", "error", err)
		return err
	}

	info, err := c.client.Enqueue(task)
	if err != nil {
		c.logger.Error("failed to enqueue course export task",
			"exportID", exportID,
			"tenantID", tenantID,
			"error", err,
		)
		return err
	}

	c.logger.Info("enqueued course export task",
		"taskID", info.ID,
		"queue", info.Queue,
		"exportID", exportID,
		"tenantID", tenantID,
	)
	return nil
}

// EnqueueFeedbackSync enqueues a feedback sync task.
func (c *Client) EnqueueFeedbackSync(payload worker.FeedbackSyncPayload) error {
	task, err := worker.NewFeedbackSyncTask(payload)
	if err != nil {
		c.logger.Error("failed to create feedback sync task", "error", err)
		return err
	}

	info, err := c.client.Enqueue(task)
	if err != nil {
		c.logger.Error("failed to enqueue feedback sync task",
			"userID", payload.UserID,
			"feedbackType", payload.FeedbackType,
			"error", err,
		)
		return err
	}

	c.logger.Info("enqueued feedback sync task",
		"taskID", info.ID,
		"queue", info.Queue,
		"userID", payload.UserID,
		"feedbackType", payload.FeedbackType,
	)
	return nil
}
