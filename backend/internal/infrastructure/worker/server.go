package worker

import (
	"context"

	"github.com/hibiken/asynq"

	appservice "github.com/sogos/mirai-backend/internal/application/service"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/worker"
)

// Server wraps the Asynq server and scheduler for background job processing.
type Server struct {
	server    *asynq.Server
	scheduler *asynq.Scheduler
	mux       *asynq.ServeMux
	handlers  *Handlers
	logger    domainservice.Logger
}

// NewServer creates a new Asynq worker server with all handlers registered.
func NewServer(
	redisAddr string,
	provisioningService *appservice.ProvisioningService,
	cleanupService *appservice.CleanupService,
	aiGenService *appservice.AIGenerationService,
	smeIngestionService *appservice.SMEIngestionService,
	workerClient *Client,
	logger domainservice.Logger,
) *Server {
	// Configure the Asynq server
	server := asynq.NewServer(
		asynq.RedisClientOpt{Addr: redisAddr},
		asynq.Config{
			// Process up to 10 tasks concurrently per pod
			Concurrency: 10,
			// Priority queues - higher number = higher priority
			Queues: map[string]int{
				worker.QueueCritical: 6, // Provisioning gets most workers
				worker.QueueDefault:  3, // AI/SME tasks
				worker.QueueLow:      1, // Cleanup tasks
			},
			// Log errors
			ErrorHandler: asynq.ErrorHandlerFunc(func(ctx context.Context, task *asynq.Task, err error) {
				logger.Error("task failed",
					"type", task.Type(),
					"error", err,
				)
			}),
		},
	)

	// Configure the scheduler for periodic tasks
	scheduler := asynq.NewScheduler(
		asynq.RedisClientOpt{Addr: redisAddr},
		&asynq.SchedulerOpts{
			Logger: &asynqLogger{logger: logger},
		},
	)

	// Create handlers with injected services
	handlers := NewHandlers(
		provisioningService,
		cleanupService,
		aiGenService,
		smeIngestionService,
		workerClient,
		logger,
	)

	// Create and configure the mux
	mux := asynq.NewServeMux()
	mux.HandleFunc(worker.TypeStripeProvision, handlers.HandleStripeProvision)
	mux.HandleFunc(worker.TypeStripeReconcile, handlers.HandleStripeReconcile)
	mux.HandleFunc(worker.TypeCleanupExpired, handlers.HandleCleanupExpired)
	mux.HandleFunc(worker.TypeAIGeneration, handlers.HandleAIGeneration)
	mux.HandleFunc(worker.TypeSMEIngestion, handlers.HandleSMEIngestion)
	mux.HandleFunc(worker.TypeAIGenerationPoll, handlers.HandleAIGenerationPoll)
	mux.HandleFunc(worker.TypeSMEIngestionPoll, handlers.HandleSMEIngestionPoll)

	return &Server{
		server:    server,
		scheduler: scheduler,
		mux:       mux,
		handlers:  handlers,
		logger:    logger,
	}
}

// Run starts the Asynq server and scheduler.
// This method blocks until the server is shut down.
func (s *Server) Run() error {
	s.logger.Info("starting Asynq worker server")

	// Register scheduled tasks

	// Stripe reconciliation every 15 minutes (catches orphaned payments)
	_, err := s.scheduler.Register("@every 15m", worker.NewStripeReconcileTask())
	if err != nil {
		s.logger.Error("failed to register stripe reconciliation task", "error", err)
		return err
	}
	s.logger.Info("registered stripe reconciliation task", "schedule", "@every 15m")

	// Cleanup every 1 hour
	_, err = s.scheduler.Register("@every 1h", worker.NewCleanupExpiredTask())
	if err != nil {
		s.logger.Error("failed to register cleanup scheduled task", "error", err)
		return err
	}
	s.logger.Info("registered cleanup scheduled task", "schedule", "@every 1h")

	// AI generation sweep polling every 5 minutes (crash recovery)
	// Primary job pickup is event-driven via EnqueueAIGeneration on job creation.
	// This poll serves as a backup to catch jobs that failed to enqueue or stale jobs.
	_, err = s.scheduler.Register("@every 5m", worker.NewAIGenerationPollTask())
	if err != nil {
		s.logger.Error("failed to register AI generation poll task", "error", err)
		return err
	}
	s.logger.Info("registered AI generation poll task", "schedule", "@every 5m")

	// SME ingestion polling every 5 seconds
	_, err = s.scheduler.Register("@every 5s", worker.NewSMEIngestionPollTask())
	if err != nil {
		s.logger.Error("failed to register SME ingestion poll task", "error", err)
		return err
	}
	s.logger.Info("registered SME ingestion poll task", "schedule", "@every 5s")

	// Start the scheduler in a goroutine
	go func() {
		if err := s.scheduler.Run(); err != nil {
			s.logger.Error("scheduler error", "error", err)
		}
	}()

	// Start the server (blocking)
	return s.server.Run(s.mux)
}

// Shutdown gracefully stops the server and scheduler.
func (s *Server) Shutdown() {
	s.logger.Info("shutting down Asynq worker server")
	s.scheduler.Shutdown()
	s.server.Shutdown()
}

// asynqLogger adapts our logger to Asynq's logger interface
type asynqLogger struct {
	logger domainservice.Logger
}

func (l *asynqLogger) Debug(args ...interface{}) {
	l.logger.Debug("asynq", "msg", args)
}

func (l *asynqLogger) Info(args ...interface{}) {
	l.logger.Info("asynq", "msg", args)
}

func (l *asynqLogger) Warn(args ...interface{}) {
	l.logger.Warn("asynq", "msg", args)
}

func (l *asynqLogger) Error(args ...interface{}) {
	l.logger.Error("asynq", "msg", args)
}

func (l *asynqLogger) Fatal(args ...interface{}) {
	l.logger.Error("asynq fatal", "msg", args)
}
