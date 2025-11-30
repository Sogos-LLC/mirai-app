package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// Infrastructure
	"github.com/sogos/mirai-backend/internal/infrastructure/config"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/kratos"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/stripe"
	"github.com/sogos/mirai-backend/internal/infrastructure/logging"
	"github.com/sogos/mirai-backend/internal/infrastructure/persistence/postgres"
	"github.com/sogos/mirai-backend/pkg/httputil"

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
	userRepo := postgres.NewUserRepository(db.DB)
	companyRepo := postgres.NewCompanyRepository(db.DB)
	teamRepo := postgres.NewTeamRepository(db.DB)
	invitationRepo := postgres.NewInvitationRepository(db.DB)

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

	// Initialize application services
	authService := service.NewAuthService(userRepo, companyRepo, kratosClient, stripeClient, logger, cfg.FrontendURL, cfg.BackendURL)
	billingService := service.NewBillingService(userRepo, companyRepo, stripeClient, logger, cfg.FrontendURL)
	userService := service.NewUserService(userRepo, companyRepo, stripeClient, logger, cfg.FrontendURL)
	companyService := service.NewCompanyService(userRepo, companyRepo, logger)
	teamService := service.NewTeamService(userRepo, companyRepo, teamRepo, logger)
	invitationService := service.NewInvitationService(userRepo, companyRepo, invitationRepo, nil, logger, cfg.FrontendURL) // nil for email provider (to be added)

	// Create Connect server mux
	mux := connectserver.NewServeMux(connectserver.ServerConfig{
		AuthService:       authService,
		UserService:       userService,
		CompanyService:    companyService,
		TeamService:       teamService,
		BillingService:    billingService,
		InvitationService: invitationService,
		Identity:          kratosClient,
		Payments:          stripeClient,
		Logger:            logger,
		AllowedOrigin:     cfg.AllowedOrigin,
		FrontendURL:       cfg.FrontendURL,
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

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Error("server forced to shutdown", "error", err)
		os.Exit(1)
	}

	logger.Info("server stopped")
}
