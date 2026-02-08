package connect

import (
	"context"
	"log"
	"net/http"
	"time"

	"connectrpc.com/connect"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/application/workflow/activities"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
	"github.com/sogos/mirai-backend/internal/infrastructure/pubsub"
)

// StorageAdapter interface for storage operations.
type StorageAdapter interface {
	GenerateUploadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
}

// BackgroundWorkflowStarter starts and queries Temporal workflows for background processing.
// This is the combined interface used by presentation-layer handlers.
type BackgroundWorkflowStarter interface {
	StartKnowledgeIngestion(ctx context.Context, sourceID, tenantID, teamID, filePath string) (string, error)
	StartFeedbackSync(ctx context.Context, input activities.FeedbackSyncInput) (string, error)
	StartStripeProvision(ctx context.Context, sessionID, customerID, subscriptionID string) (string, error)
	QueryWorkflow(ctx context.Context, workflowID, queryType string) (map[string]interface{}, error)
	IsWorkflowRunning(ctx context.Context, workflowID string) (bool, error)
}

// ServerConfig contains all dependencies needed for the Connect server.
type ServerConfig struct {
	AuthService           *service.AuthService
	UserService           *service.UserService
	CompanyService        *service.CompanyService
	TeamService           *service.TeamService
	BillingService        *service.BillingService
	InvitationService     *service.InvitationService
	CourseService         *service.CourseService
	CourseExportService   *service.CourseExportService
	TenantSettingsService *service.TenantSettingsService
	NotificationService   *service.NotificationService
	AIGenerationService    *service.AIGenerationService
	KnowledgeSourceService *service.KnowledgeSourceService
	TeamKnowledgeService   *service.TeamKnowledgeService
	KnowledgeGapService    *service.KnowledgeGapService
	CurriculumService      *service.CurriculumService
	BaseStorage            StorageAdapter // For knowledge source presigned URLs

	PendingRegRepo         repository.PendingRegistrationRepository
	UserRepo               repository.UserRepository // For tenant context in auth interceptor
	Cache                  cache.Cache               // For caching user tenant mappings
	NotificationSubscriber pubsub.Subscriber         // For real-time notification streaming
	Identity               domainservice.IdentityProvider
	Payments               domainservice.PaymentProvider
	WorkflowStarter        BackgroundWorkflowStarter // For starting background workflows
	Logger                 domainservice.Logger
	AllowedOrigin          string
	FrontendURL            string
}

// NewServeMux creates a new HTTP mux with all Connect service handlers.
func NewServeMux(cfg ServerConfig) *http.ServeMux {
	// Create interceptors
	interceptors := connect.WithInterceptors(
		NewLoggingInterceptor(cfg.Logger),
		NewAuthInterceptor(cfg.Identity, cfg.UserRepo, cfg.Cache, cfg.Logger),
	)

	mux := http.NewServeMux()

	// Register all service handlers
	path, handler := miraiv1connect.NewAuthServiceHandler(
		NewAuthServiceServer(cfg.AuthService),
		interceptors,
	)
	mux.Handle(path, handler)

	path, handler = miraiv1connect.NewUserServiceHandler(
		NewUserServiceServer(cfg.UserService),
		interceptors,
	)
	mux.Handle(path, handler)

	path, handler = miraiv1connect.NewCompanyServiceHandler(
		NewCompanyServiceServer(cfg.CompanyService),
		interceptors,
	)
	mux.Handle(path, handler)

	path, handler = miraiv1connect.NewTeamServiceHandler(
		NewTeamServiceServer(cfg.TeamService),
		interceptors,
	)
	mux.Handle(path, handler)

	path, handler = miraiv1connect.NewBillingServiceHandler(
		NewBillingServiceServer(cfg.BillingService),
		interceptors,
	)
	mux.Handle(path, handler)

	// InvitationService - team member invitations
	if cfg.InvitationService != nil {
		path, handler = miraiv1connect.NewInvitationServiceHandler(
			NewInvitationServiceServer(cfg.InvitationService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	path, handler = miraiv1connect.NewHealthServiceHandler(
		NewHealthServiceServer(),
		interceptors,
	)
	mux.Handle(path, handler)

	// CourseService - content management (includes export endpoints)
	if cfg.CourseService != nil {
		path, handler = miraiv1connect.NewCourseServiceHandler(
			NewCourseServiceServer(cfg.CourseService, cfg.CourseExportService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// TenantSettingsService - tenant configuration (AI keys, etc.)
	if cfg.TenantSettingsService != nil {
		path, handler = miraiv1connect.NewTenantSettingsServiceHandler(
			NewTenantSettingsServiceServer(cfg.TenantSettingsService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// NotificationService - user notifications with real-time streaming
	if cfg.NotificationService != nil && cfg.NotificationSubscriber != nil {
		path, handler = miraiv1connect.NewNotificationServiceHandler(
			NewNotificationServiceServer(cfg.NotificationService, cfg.NotificationSubscriber),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// AIGenerationService - AI course/lesson generation
	if cfg.AIGenerationService != nil {
		path, handler = miraiv1connect.NewAIGenerationServiceHandler(
			NewAIGenerationServiceServer(cfg.AIGenerationService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// KnowledgeSourceService - RAG knowledge management
	if cfg.KnowledgeSourceService != nil && cfg.BaseStorage != nil {
		path, handler = miraiv1connect.NewKnowledgeSourceServiceHandler(
			NewKnowledgeServiceServer(cfg.KnowledgeSourceService, cfg.BaseStorage, cfg.WorkflowStarter),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// TeamKnowledgeService - Team-level knowledge management
	if cfg.TeamKnowledgeService != nil && cfg.TeamService != nil && cfg.BaseStorage != nil {
		path, handler = miraiv1connect.NewTeamKnowledgeServiceHandler(
			NewTeamKnowledgeServiceServer(cfg.TeamKnowledgeService, cfg.TeamService, cfg.BaseStorage, cfg.WorkflowStarter),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// KnowledgeGapService - knowledge gap task management
	if cfg.KnowledgeGapService != nil {
		path, handler = miraiv1connect.NewKnowledgeGapServiceHandler(
			NewKnowledgeGapServiceServer(cfg.KnowledgeGapService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// CurriculumService - curriculum map and validation
	if cfg.CurriculumService != nil {
		path, handler = miraiv1connect.NewCurriculumServiceHandler(
			NewCurriculumServiceServer(cfg.CurriculumService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// FeedbackService - user feedback collection
	if cfg.UserService != nil && cfg.WorkflowStarter != nil {
		path, handler = miraiv1connect.NewFeedbackServiceHandler(
			NewFeedbackServiceServer(cfg.UserService, cfg.WorkflowStarter),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// Add webhook handler (no interceptors - Stripe handles its own auth)
	webhookHandler := NewWebhookHandler(cfg.BillingService, cfg.PendingRegRepo, cfg.Payments, cfg.WorkflowStarter, cfg.Logger)
	mux.HandleFunc("/api/v1/billing/webhook", webhookHandler.HandleStripeWebhook)

	// Checkout completion redirect handler
	// Stripe redirects here after successful payment.
	// Note: The user's session cookie was set by the frontend during registration,
	// so we just validate and redirect to dashboard.
	mux.HandleFunc("/api/v1/auth/complete-checkout", func(w http.ResponseWriter, r *http.Request) {
		cfg.Logger.Info("[complete-checkout] request received",
			"method", r.Method,
			"host", r.Host,
			"remoteAddr", r.RemoteAddr,
			"url", r.URL.String(),
		)

		sessionID := r.URL.Query().Get("session_id")
		if sessionID == "" {
			cfg.Logger.Error("[complete-checkout] missing session_id parameter")
			http.Redirect(w, r, cfg.FrontendURL+"/auth/login?error=missing_session", http.StatusSeeOther)
			return
		}

		cfg.Logger.Info("[complete-checkout] calling CompleteCheckout", "sessionID", sessionID)

		// CompleteCheckout validates the Stripe session and returns the redirect URL
		result, err := cfg.AuthService.CompleteCheckout(r.Context(), sessionID)
		if err != nil {
			cfg.Logger.Error("[complete-checkout] CompleteCheckout failed", "error", err)
			http.Redirect(w, r, cfg.FrontendURL+"/auth/login?error=checkout_failed", http.StatusSeeOther)
			return
		}

		cfg.Logger.Info("[complete-checkout] redirecting", "to", result.RedirectURL)
		http.Redirect(w, r, result.RedirectURL, http.StatusSeeOther)
	})

	// Simple health endpoint for Kubernetes probes
	// (Connect health service is at /mirai.v1.HealthService/Check but k8s expects /health)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	return mux
}

// CORSMiddleware wraps an http.Handler with CORS support.
func CORSMiddleware(allowedOrigin string, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Log incoming request at middleware level (before any handler processing)
		contentLength := r.Header.Get("Content-Length")
		log.Printf("[CORS] Request: %s %s (Content-Length: %s, Origin: %s)",
			r.Method, r.URL.Path, contentLength, r.Header.Get("Origin"))

		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, Connect-Protocol-Version, Connect-Timeout-Ms")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight
		if r.Method == http.MethodOptions {
			log.Printf("[CORS] Preflight handled for: %s", r.URL.Path)
			w.WriteHeader(http.StatusNoContent)
			return
		}

		h.ServeHTTP(w, r)
	})
}
