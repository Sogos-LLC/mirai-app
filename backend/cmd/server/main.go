package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"golang.org/x/net/http2"
	"golang.org/x/net/http2/h2c"

	// Infrastructure
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/config"
	"github.com/sogos/mirai-backend/internal/infrastructure/crypto"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/gemini"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/kratos"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/smtp"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/stripe"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/twenty"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
	"github.com/sogos/mirai-backend/internal/infrastructure/auth"
	"github.com/sogos/mirai-backend/internal/infrastructure/logging"
	"github.com/sogos/mirai-backend/internal/infrastructure/observability"
	"github.com/sogos/mirai-backend/internal/infrastructure/persistence/postgres"
	"github.com/sogos/mirai-backend/internal/infrastructure/persistence/sqlc"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
	temporalinfra "github.com/sogos/mirai-backend/internal/infrastructure/temporal"
	"github.com/sogos/mirai-backend/pkg/httputil"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.temporal.io/sdk/contrib/opentelemetry"
	"go.temporal.io/sdk/interceptor"

	// Domain
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/pdf"
	"github.com/sogos/mirai-backend/internal/domain/scorm"

	// Application services
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/application/workflow/activities"

	// Presentation
	connectserver "github.com/sogos/mirai-backend/internal/presentation/connect"
)

func main() {
	// Initialize structured logger
	logger := logging.New()
	logger.Info("starting mirai backend")

	// Load configuration (includes environment detection and validation)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Log detected environment prominently
	logger.Info("environment detected",
		"environment", cfg.Environment.String(),
		"requiresStrictValidation", cfg.Environment.RequiresStrictValidation(),
	)

	// Set up OpenTelemetry tracing (exports to Logfire via OTLP HTTP)
	tracingShutdown, err := observability.SetupTracing(context.Background(), cfg.LogfireToken, cfg.Environment.String(), slog.Default())
	if err != nil {
		logger.Error("failed to set up tracing", "error", err)
		os.Exit(1)
	}
	defer func() {
		if err := tracingShutdown(context.Background()); err != nil {
			logger.Error("tracing shutdown error", "error", err)
		}
	}()

	// Connect to database
	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("connected to database")

	// Initialize repositories (pass the embedded *sql.DB)
	tenantRepo := sqlc.NewTenantRepository(db.DB)
	userRepo := sqlc.NewUserRepository(db.DB)
	companyRepo := sqlc.NewCompanyRepository(db.DB)
	teamRepo := sqlc.NewTeamRepository(db.DB)
	invitationRepo := sqlc.NewInvitationRepository(db.DB)
	pendingRegRepo := sqlc.NewPendingRegistrationRepository(db.DB)
	courseRepo := sqlc.NewCourseRepository(db.DB)
	folderRepo := sqlc.NewFolderRepository(db.DB)

	// Export repository
	exportRepo := sqlc.NewCourseExportRepository(db.DB)

	// AI & Generation repositories
	aiSettingsRepo := sqlc.NewTenantAISettingsRepository(db.DB)
	knowledgeSettingsRepo := sqlc.NewTenantKnowledgeSettingsRepository(db.DB)
	notificationRepo := sqlc.NewNotificationRepository(db.DB)
	generationJobRepo := sqlc.NewGenerationJobRepository(db.DB)
	knowledgeRepo := sqlc.NewKnowledgeSourceRepository(db.DB)
	teamKnowledgeRepo := sqlc.NewTeamKnowledgeRepository(db.DB)
	gapTaskRepo := sqlc.NewKnowledgeGapTaskRepository(db.DB)

	// Initialize shared HTTP client
	httpClient := httputil.NewClient()

	// Initialize external clients
	kratosClient := kratos.NewClient(httpClient, cfg.KratosURL, cfg.KratosAdminURL)
	stripeClient := stripe.NewClient(
		cfg.StripeSecretKey,
		cfg.StripeWebhookSecret,
		cfg.StripeStarterPriceID,
		cfg.StripeProPriceID,
		cfg.FrontendURL,
		cfg.BackendURL,
	)

	// Initialize SMTP email client (only if configured)
	var emailClient domainservice.EmailProvider
	if cfg.SMTPHost != "" {
		emailClient = smtp.NewClient(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom, cfg.SMTPUsername, cfg.SMTPPassword, cfg.AdminEmail)
		logger.Info("email provider configured", "host", cfg.SMTPHost, "adminEmail", cfg.AdminEmail)
	} else {
		logger.Warn("email provider not configured, invitations will not send emails")
	}

	// Initialize storage for CourseService
	// Use S3/MinIO in production, local filesystem for development
	var baseStorage storage.StorageAdapter
	if cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		s3Storage, err := storage.NewS3Storage(context.Background(), storage.S3Config{
			Endpoint:        cfg.S3Endpoint,
			PublicEndpoint:  cfg.S3PublicEndpoint,
			Region:          cfg.S3Region,
			Bucket:          cfg.S3Bucket,
			BasePath:        cfg.S3BasePath,
			AccessKeyID:     cfg.S3AccessKey,
			SecretAccessKey: cfg.S3SecretKey,
		})
		if err != nil {
			logger.Error("failed to initialize S3 storage", "error", err)
			os.Exit(1)
		}
		baseStorage = s3Storage
		logger.Info("using S3/MinIO storage", "endpoint", cfg.S3Endpoint, "publicEndpoint", cfg.S3PublicEndpoint, "bucket", cfg.S3Bucket)
	} else {
		baseStorage = storage.NewLocalStorage("./data")
		logger.Warn("S3 credentials not configured, using local storage (not recommended for production)")
	}

	// Initialize Redis cache (before tenant storage so it can be injected)
	var baseCache cache.Cache
	if cfg.RedisURL != "" {
		redisCache, err := cache.NewRedisCache(cache.RedisConfig{
			URL:        cfg.RedisURL,
			DefaultTTL: 5 * time.Minute,
		})
		if err != nil {
			logger.Warn("failed to initialize Redis cache, falling back to no-op cache", "error", err)
			baseCache = cache.NewNoOpCache()
		} else {
			baseCache = redisCache
			logger.Info("Redis cache initialized")
		}
	} else {
		baseCache = cache.NewNoOpCache()
		logger.Warn("Redis URL not configured, using no-op cache")
	}

	// Wrap storage with tenant-aware path prefixing + course content caching
	tenantStorage := storage.NewTenantAwareStorage(baseStorage, baseCache)

	// Wrap cache with tenant isolation for application services
	tenantCache := cache.NewTenantCache(baseCache)

	// Create global cache for system-level operations (user->tenant mapping)
	globalCache := cache.NewGlobalCache(baseCache)

	// Initialize Redis pub/sub for real-time notifications
	var notificationPubSub pubsub.Publisher
	var notificationSubscriber pubsub.Subscriber
	if cfg.RedisURL != "" {
		redisPubSub, err := pubsub.NewRedisPubSub(pubsub.RedisConfig{URL: cfg.RedisURL}, logger)
		if err != nil {
			logger.Warn("failed to initialize Redis pub/sub, real-time notifications disabled", "error", err)
			notificationPubSub = pubsub.NewNoOpPubSub()
			notificationSubscriber = pubsub.NewNoOpPubSub()
		} else {
			notificationPubSub = redisPubSub
			notificationSubscriber = redisPubSub
			logger.Info("Redis pub/sub initialized for real-time notifications")
		}
	} else {
		notificationPubSub = pubsub.NewNoOpPubSub()
		notificationSubscriber = pubsub.NewNoOpPubSub()
		logger.Warn("Redis URL not configured, real-time notifications disabled")
	}

	// Initialize encryptor for API key encryption (optional for development)
	var encryptor *crypto.Encryptor
	if cfg.EncryptionKey != "" {
		var err error
		encryptor, err = crypto.NewEncryptor(cfg.EncryptionKey)
		if err != nil {
			logger.Error("failed to initialize encryptor", "error", err)
			os.Exit(1)
		}
		logger.Info("encryption configured for API keys")
	} else {
		logger.Warn("ENCRYPTION_KEY not configured, AI features requiring API keys will not work")
	}

	// Initialize RAG infrastructure (vector DB + Go-side embeddings for knowledge ingestion)
	var vectorClient *vectordb.QdrantClient
	if cfg.QdrantURL != "" {
		vectorClient = vectordb.NewQdrantClient(cfg.QdrantURL)
		logger.Info("RAG infrastructure initialized", "qdrantURL", cfg.QdrantURL)
	} else {
		logger.Warn("RAG infrastructure not configured (QDRANT_URL not set)")
	}

	// Initialize Twenty CRM client (optional for feedback sync)
	var crmProvider domainservice.CRMProvider
	if cfg.TwentyAPIURL != "" && cfg.TwentyAPIKey != "" {
		crmProvider = twenty.NewClient(cfg.TwentyAPIURL, cfg.TwentyAPIKey)
		logger.Info("Twenty CRM client initialized", "url", cfg.TwentyAPIURL)
	} else {
		logger.Warn("Twenty CRM not configured (TWENTY_API_URL and/or TWENTY_API_KEY not set), feedback will not sync to CRM")
	}

	// ---------------------------------------------------------------------------
	// Temporal Client & Worker
	// ---------------------------------------------------------------------------

	slogLogger := slog.Default()

	// Initialize Temporal client (required for workflow orchestration)
	var workflowStarter temporalinfra.WorkflowStarter
	var temporalClient *temporalinfra.Client
	if cfg.TemporalAddress != "" {
		// Build Temporal interceptors (OTel tracing if Logfire is configured)
		var temporalInterceptors []interceptor.ClientInterceptor
		if cfg.LogfireToken != "" {
			tracingInterceptor, err := opentelemetry.NewTracingInterceptor(opentelemetry.TracerOptions{})
			if err != nil {
				logger.Error("failed to create Temporal tracing interceptor", "error", err)
				os.Exit(1)
			}
			temporalInterceptors = append(temporalInterceptors, tracingInterceptor)
			logger.Info("Temporal OTel tracing interceptor enabled")
		}

		var err error
		temporalClient, err = temporalinfra.NewClient(cfg.TemporalAddress, cfg.TemporalNamespace, slogLogger, temporalInterceptors...)
		if err != nil {
			logger.Error("failed to connect to Temporal", "error", err)
			os.Exit(1)
		}
		defer temporalClient.Close()
		logger.Info("Temporal client connected", "address", cfg.TemporalAddress, "namespace", cfg.TemporalNamespace)

		workflowStarter = temporalClient.Starter(temporalinfra.GoTaskQueue)
	} else {
		logger.Warn("TEMPORAL_ADDRESS not configured, background workflows will not be available")
	}

	// ---------------------------------------------------------------------------
	// Application Services
	// ---------------------------------------------------------------------------

	authService := service.NewAuthService(userRepo, companyRepo, invitationRepo, pendingRegRepo, kratosClient, stripeClient, encryptor, logger, cfg.FrontendURL, cfg.MarketingURL, cfg.BackendURL)
	billingService := service.NewBillingService(userRepo, companyRepo, stripeClient, logger, cfg.FrontendURL)
	userService := service.NewUserService(userRepo, companyRepo, kratosClient, stripeClient, logger, cfg.FrontendURL)
	companyService := service.NewCompanyService(userRepo, companyRepo, logger)
	teamService := service.NewTeamService(userRepo, companyRepo, teamRepo, folderRepo, kratosClient, logger)
	invitationService := service.NewInvitationService(userRepo, companyRepo, invitationRepo, stripeClient, emailClient, logger, cfg.FrontendURL)
	courseService := service.NewCourseService(courseRepo, folderRepo, userRepo, tenantStorage, tenantCache, logger)

	// Notification service
	notificationService := service.NewNotificationService(userRepo, notificationRepo, kratosClient, emailClient, notificationPubSub, cfg.FrontendURL, logger)

	// Knowledge gap service
	knowledgeGapService := service.NewKnowledgeGapService(gapTaskRepo, userRepo, courseRepo, teamRepo, notificationService, kratosClient, logger)
	logger.Info("knowledge gap service initialized")

	// SCORM packager and PDF generator for course exports
	scormPackager := scorm.NewPackager()
	pdfGenerator := pdf.NewGenerator()

	// Course export service (uses WorkflowStarter instead of Asynq)
	courseExportService := service.NewCourseExportService(
		userRepo,
		courseRepo,
		exportRepo,
		scormPackager,
		pdfGenerator,
		baseStorage,
		tenantStorage,
		workflowStarter,
		notificationService,
		logger,
	)
	logger.Info("course export service initialized")

	// Course sharing service
	shareLinkRepo := sqlc.NewShareLinkRepository(db.DB)
	verificationCodeRepo := sqlc.NewVerificationCodeRepository(db.DB)
	reviewCommentRepo := sqlc.NewReviewCommentRepository(db.DB)
	shareSessionManager := auth.NewShareSessionManager(cfg.ShareSessionSecret)
	courseShareService := service.NewCourseShareService(
		shareLinkRepo,
		verificationCodeRepo,
		reviewCommentRepo,
		courseRepo,
		userRepo,
		tenantStorage,
		courseExportService,
		shareSessionManager,
		emailClient,
		cfg.FrontendURL,
	)
	logger.Info("course share service initialized")

	// Unified Knowledge service
	unifiedKnowledgeService := service.NewUnifiedKnowledgeService(
		knowledgeRepo, teamKnowledgeRepo, vectorClient, baseStorage,
	)
	logger.Info("unified knowledge service initialized")

	// Course-scoped knowledge facade
	knowledgeSourceService := service.NewKnowledgeSourceService(unifiedKnowledgeService)
	logger.Info("knowledge source service initialized")

	// Team-scoped knowledge facade
	teamKnowledgeService := service.NewTeamKnowledgeService(unifiedKnowledgeService)
	logger.Info("team knowledge service initialized")

	// Wizard state repository
	wizardStateRepo := sqlc.NewWizardStateRepository(db.DB)

	// AI services (require encryptor)
	var tenantSettingsService *service.TenantSettingsService
	var aiGenerationService *service.AIGenerationService
	var curriculumService *service.CurriculumService
	var wizardService *service.WizardService
	if encryptor != nil {
		tenantSettingsService = service.NewTenantSettingsService(userRepo, aiSettingsRepo, knowledgeSettingsRepo, encryptor, logger)

		// Create Gemini provider factory (still used for wizard + image generation)
		geminiProviderFactory := gemini.NewProviderFactory(tenantSettingsService, logger)

		// AI Generation service (simplified - Temporal handles all async processing)
		aiGenerationService = service.NewAIGenerationService(
			userRepo,
			generationJobRepo,
			aiSettingsRepo,
			geminiProviderFactory,
			workflowStarter,
			baseStorage,
			tenantStorage,
			logger,
		)

		// Set up knowledge settings provider for tenant-level configuration
		aiGenerationService.SetKnowledgeSettingsProvider(tenantSettingsService)

		// Curriculum service
		curriculumService = service.NewCurriculumService(aiGenerationService, userRepo)

		// Wizard service (multi-step course creation wizard)
		if workflowStarter != nil {
			wizardService = service.NewWizardService(
				wizardStateRepo,
				userRepo,
				aiSettingsRepo,
				tenantSettingsService,
				workflowStarter,
				logger,
			)
			logger.Info("wizard service initialized")
		}

		logger.Info("AI services initialized")
	} else {
		logger.Warn("AI services not initialized (encryption key required)")
	}

	// Background services for deferred account provisioning
	provisioningService := service.NewProvisioningService(pendingRegRepo, tenantRepo, userRepo, companyRepo, kratosClient, emailClient, encryptor, logger, cfg.FrontendURL)
	cleanupService := service.NewCleanupService(pendingRegRepo, logger)

	// ---------------------------------------------------------------------------
	// Temporal Worker (Go-side activities)
	// ---------------------------------------------------------------------------

	if temporalClient != nil {
		// GoActivities: database, storage, API key decryption, RAG ingestion
		goActivities := &activities.GoActivities{
			JobRepo:         generationJobRepo,
			KnowledgeRepo:   teamKnowledgeRepo,
			ContentStorage:  baseStorage,
			EmbeddingClient: gemini.NewEmbeddingClient(),
			QdrantClient:    vectorClient,
			Logger:          slogLogger,
		}

		// Set up API key decryptor if tenant settings are available
		if tenantSettingsService != nil {
			goActivities.KeyDecryptor = temporalinfra.NewSettingsAPIKeyDecryptor(tenantSettingsService)
		}

		// Set up course export processor
		goActivities.ExportProcessor = courseExportService

		// OpsActivities: provisioning, cleanup, feedback sync
		opsActivities := &activities.OpsActivities{
			Provisioner: provisioningService,
			Cleanup:     cleanupService,
			CRMProvider: crmProvider,
			UserRepo:    userRepo,
		}

		// Create and start the Temporal worker with retry on connection failures
		go func() {
			for attempt := 1; ; attempt++ {
				w := temporalinfra.NewWorker(temporalClient.Inner(), goActivities, opsActivities, slogLogger)
				logger.Info("Temporal worker started", "taskQueue", temporalinfra.GoTaskQueue, "attempt", attempt)

				if err := w.Run(nil); err != nil {
					logger.Error("Temporal worker error, retrying in 5s", "error", err, "attempt", attempt)
					time.Sleep(5 * time.Second)
					continue
				}
				return // clean shutdown
			}
		}()
	}

	// ---------------------------------------------------------------------------
	// HTTP Server
	// ---------------------------------------------------------------------------

	mux := connectserver.NewServeMux(connectserver.ServerConfig{
		AuthService:            authService,
		UserService:            userService,
		CompanyService:         companyService,
		TeamService:            teamService,
		BillingService:         billingService,
		InvitationService:      invitationService,
		CourseService:          courseService,
		CourseExportService:    courseExportService,
		TenantSettingsService:  tenantSettingsService,
		NotificationService:    notificationService,
		AIGenerationService:    aiGenerationService,
		KnowledgeSourceService: knowledgeSourceService,
		TeamKnowledgeService:   teamKnowledgeService,
		KnowledgeGapService:    knowledgeGapService,
		CurriculumService:      curriculumService,
		WizardService:          wizardService,
		CourseShareService:     courseShareService,
		BaseStorage:            baseStorage,
		PendingRegRepo:         pendingRegRepo,
		UserRepo:               userRepo,
		Cache:                  globalCache,
		NotificationSubscriber: notificationSubscriber,
		Identity:               kratosClient,
		Payments:               stripeClient,
		WorkflowStarter:        workflowStarter,
		Logger:                 logger,
		AllowedOrigin:          cfg.AllowedOrigin,
		FrontendURL:            cfg.FrontendURL,
	})

	// Wrap with CORS middleware
	handler := connectserver.CORSMiddleware(cfg.AllowedOrigin, mux)

	// Wrap with OTel HTTP tracing (skips /health to reduce noise)
	tracedHandler := otelhttp.NewHandler(handler, "mirai-backend",
		otelhttp.WithFilter(func(r *http.Request) bool {
			return r.URL.Path != "/health"
		}),
	)

	// Optionally wrap with h2c for HTTP/2 cleartext (local dev with Envoy)
	var finalHandler http.Handler = tracedHandler
	if cfg.EnableH2C {
		finalHandler = h2c.NewHandler(handler, &http2.Server{})
		logger.Info("h2c enabled for HTTP/2 cleartext connections")
	}

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      finalHandler,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
	}

	// Start HTTP server in goroutine
	go func() {
		logger.Info("server listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("shutting down server")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
