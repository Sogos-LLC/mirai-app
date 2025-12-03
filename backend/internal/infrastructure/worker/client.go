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

// EnqueueSMEIngestion enqueues an SME ingestion task.
func (c *Client) EnqueueSMEIngestion(jobID string) error {
	task, err := worker.NewSMEIngestionTask(jobID)
	if err != nil {
		c.logger.Error("failed to create SME ingestion task", "error", err)
		return err
	}

	info, err := c.client.Enqueue(task)
	if err != nil {
		c.logger.Error("failed to enqueue SME ingestion task",
			"jobID", jobID,
			"error", err,
		)
		return err
	}

	c.logger.Info("enqueued SME ingestion task",
		"taskID", info.ID,
		"queue", info.Queue,
		"jobID", jobID,
	)
	return nil
}
