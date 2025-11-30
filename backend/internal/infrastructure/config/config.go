package config

import (
	"fmt"
	"os"
)

// Config holds application configuration.
type Config struct {
	// Server
	Port string

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
	BackendURL   string
	CookieDomain string // Domain for session cookies (e.g., ".sogos.io" for cross-subdomain)
	CookieSecure bool   // Set to true for HTTPS (production), false for HTTP (local dev)

	// S3/MinIO Storage (MinIO local → AWS S3 production)
	S3Endpoint  string // MinIO: "http://192.168.1.226:9768", AWS: "" (empty)
	S3Region    string
	S3Bucket    string
	S3BasePath  string
	S3AccessKey string
	S3SecretKey string

	// Cache
	EnableRedisCache bool
	RedisURL         string
}

// Load loads configuration from environment variables.
func Load() (*Config, error) {
	databaseURL := getEnv("DATABASE_URL", "")
	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	return &Config{
		Port:                 getEnv("PORT", "8080"),
		DatabaseURL:          databaseURL,
		KratosURL:            getEnv("KRATOS_URL", "http://kratos-public.kratos.svc.cluster.local"),
		KratosAdminURL:       getEnv("KRATOS_ADMIN_URL", "http://kratos-admin.kratos.svc.cluster.local"),
		AllowedOrigin:        getEnv("ALLOWED_ORIGIN", "https://mirai.sogos.io"),
		StripeSecretKey:      getEnv("STRIPE_SECRET_KEY", ""),
		StripeWebhookSecret:  getEnv("STRIPE_WEBHOOK_SECRET", ""),
		StripeStarterPriceID: getEnv("STRIPE_STARTER_PRICE_ID", ""),
		StripeProPriceID:     getEnv("STRIPE_PRO_PRICE_ID", ""),
		FrontendURL:  getEnv("FRONTEND_URL", "https://mirai.sogos.io"),
		BackendURL:   getEnv("BACKEND_URL", "http://localhost:8080"),
		CookieDomain: getEnv("COOKIE_DOMAIN", ""),                       // Empty uses request domain; set to ".sogos.io" for cross-subdomain
		CookieSecure: getEnv("COOKIE_SECURE", "true") == "true",         // false for local HTTP dev
		// S3/MinIO Storage
		S3Endpoint:  getEnv("S3_ENDPOINT", "http://192.168.1.226:9768"), // Empty for AWS S3
		S3Region:    getEnv("S3_REGION", "us-east-1"),
		S3Bucket:    getEnv("S3_BUCKET", "mirai"),
		S3BasePath:  getEnv("S3_BASE_PATH", "data"),
		S3AccessKey: getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey: getEnv("S3_SECRET_KEY", ""),
		// Cache
		EnableRedisCache: getEnv("ENABLE_REDIS_CACHE", "true") != "false",
		RedisURL:         getEnv("REDIS_URL", "redis://redis.redis.svc.cluster.local:6379"),
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
