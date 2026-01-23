package config

import (
	"fmt"
	"os"
	"strconv"

	"github.com/sogos/mirai-backend/internal/infrastructure/environment"
)

// Config holds application configuration.
type Config struct {
	// Environment
	Environment environment.Environment

	// Server
	Port      string
	EnableH2C bool // Enable HTTP/2 cleartext for local dev (Envoy upstream)

	// Database
	DatabaseURL string

	// Kratos
	KratosURL      string
	KratosAdminURL string

	// CORS
	AllowedOrigin string

	// Stripe
	StripeSecretKey      string
	StripeWebhookSecret  string
	StripeStarterPriceID string
	StripeProPriceID     string

	// URLs
	FrontendURL  string
	MarketingURL string // Marketing site URL for checkout success redirects
	BackendURL   string
	CookieDomain string // Domain for session cookies (e.g., ".sogos.io" for cross-subdomain)
	CookieSecure bool   // Set to true for HTTPS (production), false for HTTP (local dev)

	// S3/MinIO Storage (MinIO local → AWS S3 production)
	S3Endpoint       string // MinIO: "http://192.168.1.226:9768", AWS: "" (empty)
	S3PublicEndpoint string // Public HTTPS endpoint for presigned URLs (e.g., "https://minio.sogos.io")
	S3Region         string
	S3Bucket         string
	S3BasePath       string
	S3AccessKey      string
	S3SecretKey      string

	// Cache
	EnableRedisCache bool
	RedisURL         string

	// SMTP/Email
	SMTPHost     string
	SMTPPort     string
	SMTPFrom     string
	SMTPUsername string
	SMTPPassword string
	AdminEmail   string // Email address for system alerts (e.g., orphaned payments)

	// Encryption
	EncryptionKey string // 32-byte hex-encoded key for AES-256-GCM (API keys, etc.)

	// Worker
	StaleJobTimeoutMinutes int // Timeout in minutes before a processing job is considered stale (default: 30)

	// RAG/Knowledge Infrastructure
	QdrantURL    string // Qdrant vector database URL (e.g., "http://qdrant:6333")
	EmbeddingURL string // Embedding service URL (e.g., "http://embedding-service:8080")
}

// Load loads configuration from environment variables with environment-aware validation.
// In production/UAT environments, critical resources MUST be explicitly set and match
// the detected environment to prevent cross-environment data access.
func Load() (*Config, error) {
	// Step 1: Detect environment from POD_NAMESPACE or MIRAI_ENV
	env, err := environment.Detect()
	if err != nil {
		return nil, fmt.Errorf("environment detection failed: %w", err)
	}

	// Step 2: Load DATABASE_URL (always required)
	databaseURL := getEnv("DATABASE_URL", "")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	// Step 3: Load persistence-related config with environment-aware defaults
	// For non-local environments, these MUST be explicitly set (no defaults that could
	// accidentally point to production)
	kratosURL := getEnvRequired(env, "KRATOS_URL", "http://localhost:4433")
	kratosAdminURL := getEnvRequired(env, "KRATOS_ADMIN_URL", "http://localhost:4434")
	allowedOrigin := getEnvRequired(env, "ALLOWED_ORIGIN", "http://localhost:3000")
	s3Bucket := getEnvRequired(env, "S3_BUCKET", "mirai-dev")
	redisURL := getEnvRequired(env, "REDIS_URL", "redis://localhost:6379")

	// Build config
	cfg := &Config{
		Environment:          env,
		Port:                 getEnv("PORT", "8080"),
		EnableH2C:            getEnv("ENABLE_H2C", "false") == "true",
		DatabaseURL:          databaseURL,
		KratosURL:            kratosURL,
		KratosAdminURL:       kratosAdminURL,
		AllowedOrigin:        allowedOrigin,
		StripeSecretKey:      getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret:  getEnv("STRIPE_WEBHOOK_SECRET", ""),
		StripeStarterPriceID: getEnv("STRIPE_STARTER_PRICE_ID", ""),
		StripeProPriceID:     getEnv("STRIPE_PRO_PRICE_ID", ""),
		FrontendURL:          getEnv("FRONTEND_URL", "http://localhost:3000"),
		MarketingURL:         getEnv("MARKETING_URL", getEnv("FRONTEND_URL", "http://localhost:3001")),
		BackendURL:           getEnv("BACKEND_URL", "http://localhost:8080"),
		CookieDomain:         getEnv("COOKIE_DOMAIN", ""),
		CookieSecure:         getEnv("COOKIE_SECURE", "true") == "true",
		// S3/MinIO Storage
		S3Endpoint:       getEnv("S3_ENDPOINT", "http://localhost:9000"),
		S3PublicEndpoint: getEnv("S3_PUBLIC_ENDPOINT", ""),
		S3Region:         getEnv("S3_REGION", "us-east-1"),
		S3Bucket:         s3Bucket,
		S3BasePath:       getEnv("S3_BASE_PATH", "data"),
		S3AccessKey:      getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:      getEnv("S3_SECRET_KEY", ""),
		// Cache
		EnableRedisCache: getEnv("ENABLE_REDIS_CACHE", "true") != "false",
		RedisURL:         redisURL,
		// SMTP/Email
		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "1025"),
		SMTPFrom:     getEnv("SMTP_FROM", "noreply@mirai.sogos.io"),
		SMTPUsername: getEnv("SMTP_USERNAME", ""),
		SMTPPassword: getEnv("SMTP_PASSWORD", ""),
		AdminEmail:   getEnv("ADMIN_EMAIL", "john@sogos.io"),
		// Encryption
		EncryptionKey: getEnv("ENCRYPTION_KEY", ""),
		// Worker
		StaleJobTimeoutMinutes: getEnvInt("STALE_JOB_TIMEOUT_MINUTES", 30),
		// RAG/Knowledge Infrastructure
		QdrantURL:    getEnv("QDRANT_URL", ""),
		EmbeddingURL: getEnv("EMBEDDING_URL", ""),
	}

	// Step 4: Validate configuration matches the detected environment
	// This prevents UAT from accidentally using production resources
	if env.RequiresStrictValidation() {
		validator := environment.NewValidator(env)
		if err := validator.ValidateConfig(
			cfg.DatabaseURL,
			cfg.S3Bucket,
			cfg.RedisURL,
			cfg.KratosURL,
		); err != nil {
			return nil, err
		}
	}

	return cfg, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getEnvRequired returns the env var value if set, or the fallback for local env.
// For non-local environments, the env var MUST be explicitly set.
func getEnvRequired(env environment.Environment, key, localFallback string) string {
	value := os.Getenv(key)
	if value != "" {
		return value
	}
	// Only allow fallback in local environment
	if env.IsLocal() {
		return localFallback
	}
	// In prod/UAT, return empty string - validation will catch this
	return ""
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if i, err := strconv.Atoi(value); err == nil {
			return i
		}
	}
	return defaultValue
}
