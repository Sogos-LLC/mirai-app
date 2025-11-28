package config

import (
	"fmt"
	"os"
)

// Config holds application configuration
type Config struct {
	Port                   string
	DatabaseURL            string
	KratosURL              string
	KratosAdminURL         string
	AllowedOrigin          string
	StripeSecretKey        string
	StripeWebhookSecret    string
	StripeStarterPriceID   string
	StripeProPriceID       string
	FrontendURL            string
	BackendURL             string
}

// Load loads configuration from environment variables
func Load() (*Config, error) {
	port := getEnv("PORT", "8080")
	databaseURL := getEnv("DATABASE_URL", "")
	kratosURL := getEnv("KRATOS_URL", "http://kratos-public.kratos.svc.cluster.local")
	kratosAdminURL := getEnv("KRATOS_ADMIN_URL", "http://kratos-admin.kratos.svc.cluster.local")
	allowedOrigin := getEnv("ALLOWED_ORIGIN", "https://mirai.sogos.io")

	// Stripe configuration
	stripeSecretKey := getEnv("STRIPE_SECRET_KEY", "")
	stripeWebhookSecret := getEnv("STRIPE_WEBHOOK_SECRET", "")
	stripeStarterPriceID := getEnv("STRIPE_STARTER_PRICE_ID", "")
	stripeProPriceID := getEnv("STRIPE_PRO_PRICE_ID", "")
	frontendURL := getEnv("FRONTEND_URL", "https://mirai.sogos.io")
	backendURL := getEnv("BACKEND_URL", "http://localhost:8080")

	if databaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL environment variable is required")
	}

	return &Config{
		Port:                   port,
		DatabaseURL:            databaseURL,
		KratosURL:              kratosURL,
		KratosAdminURL:         kratosAdminURL,
		AllowedOrigin:          allowedOrigin,
		StripeSecretKey:        stripeSecretKey,
		StripeWebhookSecret:    stripeWebhookSecret,
		StripeStarterPriceID:   stripeStarterPriceID,
		StripeProPriceID:       stripeProPriceID,
		FrontendURL:            frontendURL,
		BackendURL:             backendURL,
	}, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
