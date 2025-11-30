package httputil

import (
	"net"
	"net/http"
	"time"
)

// DefaultTimeout is the default timeout for HTTP requests.
const DefaultTimeout = 30 * time.Second

// NewClient creates an HTTP client with connection pooling and sensible defaults.
func NewClient() *http.Client {
	return NewClientWithTimeout(DefaultTimeout)
}

// NewClientWithTimeout creates an HTTP client with the specified timeout.
func NewClientWithTimeout(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		Transport: &http.Transport{
			DialContext: (&net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}).DialContext,
			MaxIdleConns:          100,
			MaxIdleConnsPerHost:   10,
			IdleConnTimeout:       90 * time.Second,
			TLSHandshakeTimeout:   10 * time.Second,
			ExpectContinueTimeout: 1 * time.Second,
			ForceAttemptHTTP2:     true,
		},
	}
}
