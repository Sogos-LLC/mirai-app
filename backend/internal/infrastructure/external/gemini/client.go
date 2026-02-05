package gemini

import (
	"context"
	"fmt"
	"strings"
	"time"

	"golang.org/x/time/rate"
	"google.golang.org/genai"
)

const (
	// DefaultModel is the default Gemini model to use.
	// Using 2.0-flash for larger context window (1M tokens)
	DefaultModel = "gemini-2.0-flash"

	// Rate limiting constants for Gemini Flash 2.0 paid tier
	// Paid tier: 2000 RPM (requests per minute), 1M token context
	defaultRPM        = 2000
	defaultBurstSize  = 100                   // Allow larger bursts for parallel generation
	defaultMaxRetries = 3                     // Max retries on rate limit errors
	defaultBaseDelay  = 30 * time.Millisecond // Base delay for backoff (60s / 2000 RPM = 30ms)
)

// Client implements service.AIProvider using Google Gemini.
type Client struct {
	client     *genai.Client
	model      string
	limiter    *rate.Limiter
	maxRetries int
	baseDelay  time.Duration
}

// NewClient creates a new Gemini client with the provided API key.
func NewClient(ctx context.Context, apiKey string) (*Client, error) {
	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey: apiKey,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create Gemini client: %w", err)
	}

	// Create rate limiter: 2000 requests per minute with burst of 100
	// rate.Every(30ms) = ~33 tokens/second = ~2000/minute
	limiter := rate.NewLimiter(rate.Every(defaultBaseDelay), defaultBurstSize)

	return &Client{
		client:     client,
		model:      DefaultModel,
		limiter:    limiter,
		maxRetries: defaultMaxRetries,
		baseDelay:  defaultBaseDelay,
	}, nil
}

// waitForRateLimit waits for rate limiter permission before making an API call.
// Returns an error if context is cancelled while waiting.
func (c *Client) waitForRateLimit(ctx context.Context) error {
	if err := c.limiter.Wait(ctx); err != nil {
		if ctx.Err() != nil {
			return fmt.Errorf("cancelled while waiting for rate limit: %w", ctx.Err())
		}
		return fmt.Errorf("rate limit wait failed: %w", err)
	}
	return nil
}

// isRateLimitError checks if an error is a rate limit (429) error.
func isRateLimitError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "ResourceExhausted") ||
		strings.Contains(errStr, "429") ||
		strings.Contains(errStr, "rate limit") ||
		strings.Contains(errStr, "quota exceeded")
}

// generateWithRetry executes a generation function with rate limiting and retry logic.
func (c *Client) generateWithRetry(ctx context.Context, operation string, fn func() (*genai.GenerateContentResponse, error)) (*genai.GenerateContentResponse, error) {
	var lastErr error

	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		// Check if context is cancelled
		select {
		case <-ctx.Done():
			return nil, fmt.Errorf("%s cancelled: %w", operation, ctx.Err())
		default:
		}

		// Wait for rate limit permission
		if err := c.waitForRateLimit(ctx); err != nil {
			return nil, err
		}

		// Execute the operation
		result, err := fn()
		if err == nil {
			return result, nil
		}

		lastErr = err

		// If it's a rate limit error and we have retries left, wait and retry
		if isRateLimitError(err) && attempt < c.maxRetries {
			// Exponential backoff: 6s, 12s, 24s
			delay := c.baseDelay * time.Duration(1<<attempt)
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("%s cancelled during retry backoff: %w", operation, ctx.Err())
			case <-time.After(delay):
				continue
			}
		}

		// For non-rate-limit errors, fail immediately
		if !isRateLimitError(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("%s failed after %d retries: %w", operation, c.maxRetries, lastErr)
}

