package connect

import (
	"context"
	"fmt"
	"hash/fnv"
	"net/http"
	"strings"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/infrastructure/cache"
)

// AuthInterceptor provides authentication for Connect handlers.
type AuthInterceptor struct {
	identity service.IdentityProvider
	userRepo repository.UserRepository
	cache    cache.Cache
	logger   service.Logger
	// Procedures that don't require authentication
	publicProcedures map[string]bool
}

// userTenantMapping caches the kratos ID to tenant ID mapping.
type userTenantMapping struct {
	TenantID string `json:"tenant_id"`
}

// cachedSession caches Kratos session validation results to avoid
// redundant HTTP calls to Kratos /sessions/whoami on every RPC.
type cachedSession struct {
	KratosID string `json:"kratos_id"`
	Email    string `json:"email"`
	Active   bool   `json:"active"`
}

// sessionCacheTTL is how long we cache Kratos session validation results.
// 30s is short enough for near-instant revocation, long enough to deduplicate
// the burst of RPCs during a page load (~5 calls on wizard page).
const sessionCacheTTL = 30 * time.Second

// hashCookie returns an FNV-32a hash of the cookie value as a hex string.
// We don't store the full cookie in Redis for security.
func hashCookie(cookie string) string {
	h := fnv.New32a()
	h.Write([]byte(cookie))
	return fmt.Sprintf("%x", h.Sum32())
}

// NewAuthInterceptor creates a new auth interceptor.
func NewAuthInterceptor(identity service.IdentityProvider, userRepo repository.UserRepository, cache cache.Cache, logger service.Logger) *AuthInterceptor {
	return &AuthInterceptor{
		identity: identity,
		userRepo: userRepo,
		cache:    cache,
		logger:   logger,
		publicProcedures: map[string]bool{
			"/mirai.v1.AuthService/CheckEmail":                          true,
			"/mirai.v1.AuthService/Register":                            true,
			"/mirai.v1.AuthService/RegisterWithInvitation":              true, // Public for invited user registration
			"/mirai.v1.AuthService/EnterpriseContact":                   true,
			"/mirai.v1.HealthService/Check":                             true,
			"/mirai.v1.InvitationService/GetInvitationByToken":          true, // Public for accept invite flow
			"/mirai.v1.CourseShareService/VerifyShareToken":             true, // Public share access
			"/mirai.v1.CourseShareService/SendVerificationCode":         true,
			"/mirai.v1.CourseShareService/VerifyEmailCode":              true,
			"/mirai.v1.CourseShareService/GetSharedCourse":              true,
			"/mirai.v1.CourseShareService/GetSharedLesson":              true,
			"/mirai.v1.CourseShareService/AddReviewComment":             true,
			"/mirai.v1.CourseShareService/ListLessonReviewComments":     true,
			"/mirai.v1.CourseShareService/ExportSharedCoursePDF":        true,
		},
	}
}

// WrapUnary implements connect.Interceptor for unary calls.
func (i *AuthInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		procedure := req.Spec().Procedure

		// Skip auth for public procedures
		if i.publicProcedures[procedure] {
			return next(ctx, req)
		}

		// Parse cookies from request header
		cookieHeader := req.Header().Get("Cookie")
		if cookieHeader == "" {
			return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
		}

		// Parse cookie header into []*http.Cookie
		httpReq := &http.Request{Header: http.Header{"Cookie": []string{cookieHeader}}}
		cookies := httpReq.Cookies()
		if len(cookies) == 0 {
			return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
		}

		// Extract ory_kratos_session cookie for cache key
		var sessionCookieValue string
		for _, c := range cookies {
			if c.Name == "ory_kratos_session" {
				sessionCookieValue = c.Value
				break
			}
		}

		var kratosID, email string

		// Try session cache first (avoids HTTP call to Kratos on every RPC)
		if i.cache != nil && sessionCookieValue != "" {
			cookieHash := hashCookie(sessionCookieValue)
			cacheKey := cache.GlobalCacheKeys.SessionValidation(cookieHash)
			var cached cachedSession
			if entry, err := i.cache.Get(ctx, cacheKey, &cached); err == nil && entry != nil && cached.Active {
				kratosID = cached.KratosID
				email = cached.Email
			}
		}

		// Cache miss: validate with Kratos and cache the result
		if kratosID == "" {
			session, err := i.identity.ValidateSession(ctx, cookies)
			if err != nil {
				i.logger.Debug("session validation failed", "error", err)
				return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}

			if session == nil || !session.Active {
				return nil, connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}

			kratosID = session.IdentityID.String()
			email = session.Email

			// Cache the validated session
			if i.cache != nil && sessionCookieValue != "" {
				cookieHash := hashCookie(sessionCookieValue)
				cacheKey := cache.GlobalCacheKeys.SessionValidation(cookieHash)
				cached := cachedSession{KratosID: kratosID, Email: email, Active: true}
				if _, err := i.cache.Set(ctx, cacheKey, &cached, "", sessionCacheTTL); err != nil {
					i.logger.Debug("failed to cache session validation", "error", err)
				}
			}
		}

		// Add auth info to context
		ctx = context.WithValue(ctx, kratosIDKey{}, kratosID)
		ctx = context.WithValue(ctx, emailKey{}, email)

		// Look up user to get tenant ID for RLS
		// First check cache, then fall back to database lookup
		if i.userRepo != nil {
			cacheKey := cache.GlobalCacheKeys.UserTenantMapping(kratosID)
			var tenantID uuid.UUID
			var found bool

			// Try cache first
			if i.cache != nil {
				var mapping userTenantMapping
				if entry, err := i.cache.Get(ctx, cacheKey, &mapping); err == nil && entry != nil {
					if parsedID, err := uuid.Parse(mapping.TenantID); err == nil {
						tenantID = parsedID
						found = true
					}
				}
			}

			// Fall back to database if not cached
			if !found {
				adminCtx := tenant.WithSuperAdmin(ctx, true)
				parsedKratosID, _ := uuid.Parse(kratosID)
				user, err := i.userRepo.GetByKratosID(adminCtx, parsedKratosID)
				if err != nil {
					i.logger.Debug("failed to lookup user for tenant context", "error", err)
				} else if user != nil && user.TenantID != nil {
					tenantID = *user.TenantID
					found = true

					// Cache the mapping for 1 hour
					if i.cache != nil {
						mapping := userTenantMapping{TenantID: tenantID.String()}
						if _, err := i.cache.Set(ctx, cacheKey, &mapping, "", time.Hour); err != nil {
							i.logger.Debug("failed to cache user tenant mapping", "error", err)
						}
					}
				}
			}

			if found {
				ctx = tenant.WithTenantID(ctx, tenantID)
			}
		}

		return next(ctx, req)
	}
}

// WrapStreamingClient implements connect.Interceptor.
func (i *AuthInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next // No streaming support needed for now
}

// WrapStreamingHandler implements connect.Interceptor for server streaming calls.
func (i *AuthInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		procedure := conn.Spec().Procedure

		// Skip auth for public procedures
		if i.publicProcedures[procedure] {
			return next(ctx, conn)
		}

		// Parse cookies from request header
		cookieHeader := conn.RequestHeader().Get("Cookie")
		if cookieHeader == "" {
			return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
		}

		// Parse cookie header into []*http.Cookie
		httpReq := &http.Request{Header: http.Header{"Cookie": []string{cookieHeader}}}
		cookies := httpReq.Cookies()
		if len(cookies) == 0 {
			return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
		}

		// Extract ory_kratos_session cookie for cache key
		var sessionCookieValue string
		for _, c := range cookies {
			if c.Name == "ory_kratos_session" {
				sessionCookieValue = c.Value
				break
			}
		}

		var kratosID, email string

		// Try session cache first (avoids HTTP call to Kratos on every RPC)
		if i.cache != nil && sessionCookieValue != "" {
			cookieHash := hashCookie(sessionCookieValue)
			cacheKey := cache.GlobalCacheKeys.SessionValidation(cookieHash)
			var cached cachedSession
			if entry, err := i.cache.Get(ctx, cacheKey, &cached); err == nil && entry != nil && cached.Active {
				kratosID = cached.KratosID
				email = cached.Email
			}
		}

		// Cache miss: validate with Kratos and cache the result
		if kratosID == "" {
			session, err := i.identity.ValidateSession(ctx, cookies)
			if err != nil {
				i.logger.Debug("streaming session validation failed", "error", err)
				return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}

			if session == nil || !session.Active {
				return connect.NewError(connect.CodeUnauthenticated, errUnauthenticated)
			}

			kratosID = session.IdentityID.String()
			email = session.Email

			// Cache the validated session
			if i.cache != nil && sessionCookieValue != "" {
				cookieHash := hashCookie(sessionCookieValue)
				cacheKey := cache.GlobalCacheKeys.SessionValidation(cookieHash)
				cached := cachedSession{KratosID: kratosID, Email: email, Active: true}
				if _, err := i.cache.Set(ctx, cacheKey, &cached, "", sessionCacheTTL); err != nil {
					i.logger.Debug("failed to cache session validation", "error", err)
				}
			}
		}

		// Add auth info to context
		ctx = context.WithValue(ctx, kratosIDKey{}, kratosID)
		ctx = context.WithValue(ctx, emailKey{}, email)

		// Look up user to get tenant ID for RLS
		if i.userRepo != nil {
			cacheKey := cache.GlobalCacheKeys.UserTenantMapping(kratosID)
			var tenantID uuid.UUID
			var found bool

			// Try cache first
			if i.cache != nil {
				var mapping userTenantMapping
				if entry, err := i.cache.Get(ctx, cacheKey, &mapping); err == nil && entry != nil {
					if parsedID, err := uuid.Parse(mapping.TenantID); err == nil {
						tenantID = parsedID
						found = true
					}
				}
			}

			// Fall back to database if not cached
			if !found {
				adminCtx := tenant.WithSuperAdmin(ctx, true)
				parsedKratosID, _ := uuid.Parse(kratosID)
				user, err := i.userRepo.GetByKratosID(adminCtx, parsedKratosID)
				if err != nil {
					i.logger.Debug("failed to lookup user for tenant context (streaming)", "error", err)
				} else if user != nil && user.TenantID != nil {
					tenantID = *user.TenantID
					found = true

					// Cache the mapping for 1 hour
					if i.cache != nil {
						mapping := userTenantMapping{TenantID: tenantID.String()}
						if _, err := i.cache.Set(ctx, cacheKey, &mapping, "", time.Hour); err != nil {
							i.logger.Debug("failed to cache user tenant mapping", "error", err)
						}
					}
				}
			}

			if found {
				ctx = tenant.WithTenantID(ctx, tenantID)
			}
		}

		return next(ctx, conn)
	}
}

// LoggingInterceptor provides request logging for Connect handlers.
type LoggingInterceptor struct {
	logger service.Logger
}

// NewLoggingInterceptor creates a new logging interceptor.
func NewLoggingInterceptor(logger service.Logger) *LoggingInterceptor {
	return &LoggingInterceptor{logger: logger}
}

// WrapUnary implements connect.Interceptor.
func (i *LoggingInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		procedure := req.Spec().Procedure

		// Extract service and method names
		parts := strings.Split(procedure, "/")
		var serviceName, methodName string
		if len(parts) >= 3 {
			serviceName = parts[1]
			methodName = parts[2]
		}

		i.logger.Debug("rpc call started",
			"service", serviceName,
			"method", methodName,
		)

		resp, err := next(ctx, req)

		if err != nil {
			i.logger.Error("rpc call failed",
				"service", serviceName,
				"method", methodName,
				"error", err,
			)
		} else {
			i.logger.Debug("rpc call completed",
				"service", serviceName,
				"method", methodName,
			)
		}

		return resp, err
	}
}

// WrapStreamingClient implements connect.Interceptor.
func (i *LoggingInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

// WrapStreamingHandler implements connect.Interceptor.
func (i *LoggingInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return next
}
