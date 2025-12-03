package connect

import (
	"net/http"

	"connectrpc.com/connect"
	"github.com/sogos/mirai-backend/gen/mirai/v1/miraiv1connect"
	"github.com/sogos/mirai-backend/internal/application/service"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/worker"
)

// ServerConfig contains all dependencies needed for the Connect server.
type ServerConfig struct {
	AuthService           *service.AuthService
	UserService           *service.UserService
	CompanyService        *service.CompanyService
	TeamService           *service.TeamService
	BillingService        *service.BillingService
	InvitationService     *service.InvitationService
	CourseService         *service.CourseService
	SMEService            *service.SMEService
	TargetAudienceService *service.TargetAudienceService
	TenantSettingsService *service.TenantSettingsService
	NotificationService   *service.NotificationService
	AIGenerationService   *service.AIGenerationService

	PendingRegRepo repository.PendingRegistrationRepository
	UserRepo       repository.UserRepository // For tenant context in auth interceptor
	Identity       domainservice.IdentityProvider
	Payments       domainservice.PaymentProvider
	WorkerClient   *worker.Client // For enqueueing background tasks
	Logger         domainservice.Logger
	AllowedOrigin  string
	FrontendURL    string
}

// NewServeMux creates a new HTTP mux with all Connect service handlers.
func NewServeMux(cfg ServerConfig) *http.ServeMux {
	// Create interceptors
	interceptors := connect.WithInterceptors(
		NewLoggingInterceptor(cfg.Logger),
		NewAuthInterceptor(cfg.Identity, cfg.UserRepo, cfg.Logger),
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

	// CourseService - content management
	if cfg.CourseService != nil {
		path, handler = miraiv1connect.NewCourseServiceHandler(
			NewCourseServiceServer(cfg.CourseService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// SMEService - subject matter expert management
	if cfg.SMEService != nil {
		path, handler = miraiv1connect.NewSMEServiceHandler(
			NewSMEServiceServer(cfg.SMEService),
			interceptors,
		)
		mux.Handle(path, handler)
	}

	// TargetAudienceService - target audience templates
	if cfg.TargetAudienceService != nil {
		path, handler = miraiv1connect.NewTargetAudienceServiceHandler(
			NewTargetAudienceServiceServer(cfg.TargetAudienceService),
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

	// NotificationService - user notifications
	if cfg.NotificationService != nil {
		path, handler = miraiv1connect.NewNotificationServiceHandler(
			NewNotificationServiceServer(cfg.NotificationService),
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

	// Add webhook handler (no interceptors - Stripe handles its own auth)
	webhookHandler := NewWebhookHandler(cfg.BillingService, cfg.PendingRegRepo, cfg.Payments, cfg.WorkerClient, cfg.Logger)
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
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Accept, Content-Type, Content-Length, Accept-Encoding, Authorization, Connect-Protocol-Version")
		w.Header().Set("Access-Control-Allow-Credentials", "true")
		w.Header().Set("Access-Control-Max-Age", "86400")

		// Handle preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		h.ServeHTTP(w, r)
	})
}
