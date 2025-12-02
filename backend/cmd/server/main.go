package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Infrastructure
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/config"
	"github.com/sogos/mirai-backend/internal/infrastructure/crypto"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/gemini"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/kratos"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/smtp"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/stripe"
	"github.com/sogos/mirai-backend/internal/infrastructure/logging"
	"github.com/sogos/mirai-backend/internal/infrastructure/persistence/postgres"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
	"github.com/sogos/mirai-backend/pkg/httputil"

	// Domain
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"

	// Application services
	"github.com/sogos/mirai-backend/internal/application/service"

	// Presentation
	connectserver "github.com/sogos/mirai-backend/internal/presentation/connect"
)

func main() {
	// Initialize structured logger
	logger := logging.New()
	logger.Info("starting mirai backend")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Connect to database
	db, err := postgres.NewDB(cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	logger.Info("connected to database")

	// Initialize repositories (pass the embedded *sql.DB)
	tenantRepo := postgres.NewTenantRepository(db.DB)
	userRepo := postgres.NewUserRepository(db.DB)
	companyRepo := postgres.NewCompanyRepository(db.DB)
	teamRepo := postgres.NewTeamRepository(db.DB)
	invitationRepo := postgres.NewInvitationRepository(db.DB)
	pendingRegRepo := postgres.NewPendingRegistrationRepository(db.DB)
	courseRepo := postgres.NewCourseRepository(db.DB)
	folderRepo := postgres.NewFolderRepository(db.DB)

	// SME repositories
	smeRepo := postgres.NewSMERepository(db.DB)
	smeTaskRepo := postgres.NewSMETaskRepository(db.DB)
	smeSubmissionRepo := postgres.NewSMESubmissionRepository(db.DB)
	smeKnowledgeRepo := postgres.NewSMEKnowledgeRepository(db.DB)

	// Target Audience repository
	targetAudienceRepo := postgres.NewTargetAudienceRepository(db.DB)

	// AI & Generation repositories
	aiSettingsRepo := postgres.NewTenantAISettingsRepository(db.DB)
	notificationRepo := postgres.NewNotificationRepository(db.DB)
	outlineRepo := postgres.NewCourseOutlineRepository(db.DB)
	sectionRepo := postgres.NewOutlineSectionRepository(db.DB)
	lessonRepo := postgres.NewOutlineLessonRepository(db.DB)
	genLessonRepo := postgres.NewGeneratedLessonRepository(db.DB)
	componentRepo := postgres.NewLessonComponentRepository(db.DB)
	genInputRepo := postgres.NewCourseGenerationInputRepository(db.DB)
	generationJobRepo := postgres.NewGenerationJobRepository(db.DB)

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
		emailClient = smtp.NewClient(cfg.SMTPHost, cfg.SMTPPort, cfg.SMTPFrom, cfg.SMTPUsername, cfg.SMTPPassword)
		logger.Info("email provider configured", "host", cfg.SMTPHost)
	} else {
		logger.Warn("email provider not configured, invitations will not send emails")
	}

	// Initialize storage for CourseService
	// Use S3/MinIO in production, local filesystem for development
	var baseStorage storage.StorageAdapter
	if cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
		s3Storage, err := storage.NewS3Storage(context.Background(), storage.S3Config{
			Endpoint:        cfg.S3Endpoint,
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
		logger.Info("using S3/MinIO storage", "endpoint", cfg.S3Endpoint, "bucket", cfg.S3Bucket)
	} else {
		baseStorage = storage.NewLocalStorage("./data")
		logger.Warn("S3 credentials not configured, using local storage (not recommended for production)")
	}

	// Wrap storage with tenant-aware path prefixing
	tenantStorage := storage.NewTenantAwareStorage(baseStorage)

	// Initialize cache for CourseService
	courseCache := cache.NewNoOpCache() // Use NoOpCache for local dev (Redis in production)

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

	// Initialize application services
	authService := service.NewAuthService(userRepo, companyRepo, invitationRepo, pendingRegRepo, kratosClient, stripeClient, logger, cfg.FrontendURL, cfg.MarketingURL, cfg.BackendURL)
	billingService := service.NewBillingService(userRepo, companyRepo, stripeClient, logger, cfg.FrontendURL)
	userService := service.NewUserService(userRepo, companyRepo, kratosClient, stripeClient, logger, cfg.FrontendURL)
	companyService := service.NewCompanyService(userRepo, companyRepo, logger)
	teamService := service.NewTeamService(userRepo, companyRepo, teamRepo, folderRepo, kratosClient, logger)
	invitationService := service.NewInvitationService(userRepo, companyRepo, invitationRepo, stripeClient, emailClient, logger, cfg.FrontendURL)
	courseService := service.NewCourseService(courseRepo, folderRepo, userRepo, tenantStorage, courseCache, logger)

	// Notification service (created first for dependency injection)
	notificationService := service.NewNotificationService(userRepo, notificationRepo, kratosClient, emailClient, cfg.FrontendURL, logger)

	// SME and Target Audience services
	// Note: enhancer is nil initially, will be set when AI services are available
	smeService := service.NewSMEService(userRepo, companyRepo, teamRepo, smeRepo, smeTaskRepo, smeSubmissionRepo, smeKnowledgeRepo, tenantStorage, notificationService, nil, logger)
	targetAudienceService := service.NewTargetAudienceService(userRepo, targetAudienceRepo, logger)

	// AI services (require encryptor)
	var tenantSettingsService *service.TenantSettingsService
	var aiGenerationService *service.AIGenerationService
	var smeIngestionService *service.SMEIngestionService
	if encryptor != nil {
		tenantSettingsService = service.NewTenantSettingsService(userRepo, aiSettingsRepo, encryptor, logger)

		// Create Gemini provider factory for per-tenant API key management
		geminiProviderFactory := gemini.NewProviderFactory(tenantSettingsService, logger)

		// AI Generation service
		aiGenerationService = service.NewAIGenerationService(
			userRepo,
			smeRepo,
			smeKnowledgeRepo,
			targetAudienceRepo,
			generationJobRepo,
			outlineRepo,
			sectionRepo,
			lessonRepo,
			genLessonRepo,
			componentRepo,
			genInputRepo,
			aiSettingsRepo,
			geminiProviderFactory,
			notificationService, // For tenant-isolated job notifications
			notificationService, // For course completion notifications (implements CourseCompletionNotifier)
			logger,
		)

		// SME Ingestion service
		smeIngestionService = service.NewSMEIngestionService(
			smeRepo,
			smeTaskRepo,
			smeSubmissionRepo,
			smeKnowledgeRepo,
			generationJobRepo,
			aiSettingsRepo,
			tenantStorage,
			geminiProviderFactory,
			notificationService,
			logger,
		)

		logger.Info("AI services initialized")
	} else {
		logger.Warn("AI services not initialized (encryption key required)")
	}

	// Background services for deferred account provisioning
	provisioningService := service.NewProvisioningService(pendingRegRepo, tenantRepo, userRepo, companyRepo, kratosClient, emailClient, logger, cfg.FrontendURL)
	cleanupService := service.NewCleanupService(pendingRegRepo, logger)

	// Create Connect server mux
	mux := connectserver.NewServeMux(connectserver.ServerConfig{
		AuthService:           authService,
		UserService:           userService,
		CompanyService:        companyService,
		TeamService:           teamService,
		BillingService:        billingService,
		InvitationService:     invitationService,
		CourseService:         courseService,
		SMEService:            smeService,
		TargetAudienceService: targetAudienceService,
		TenantSettingsService: tenantSettingsService,
		NotificationService:   notificationService,
		AIGenerationService:   aiGenerationService,
		PendingRegRepo:        pendingRegRepo,
		UserRepo:              userRepo, // For tenant context in auth interceptor
		Identity:              kratosClient,
		Payments:              stripeClient,
		Logger:                logger,
		AllowedOrigin:         cfg.AllowedOrigin,
		FrontendURL:           cfg.FrontendURL,
	})

	// Wrap with CORS middleware
	handler := connectserver.CORSMiddleware(cfg.AllowedOrigin, mux)

	// Create HTTP server
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Create context for background jobs (cancelled on shutdown)
	bgCtx, bgCancel := context.WithCancel(context.Background())

	// Start background job: provision paid registrations every 10 seconds
	go provisioningService.RunBackground(bgCtx, 10*time.Second)

	// Start background job: cleanup expired registrations every hour
	go cleanupService.RunBackground(bgCtx, 1*time.Hour)

	// Start AI background workers (only if AI services are initialized)
	if aiGenerationService != nil {
		go aiGenerationService.RunBackground(bgCtx, 5*time.Second)
		logger.Info("AI generation worker started")
	}
	if smeIngestionService != nil {
		go smeIngestionService.RunBackground(bgCtx, 5*time.Second)
		logger.Info("SME ingestion worker started")
	}

	// Start server in goroutine
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

	// Cancel background jobs
	bgCancel()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
