package service

import "context"

// Logger abstracts structured logging operations.
type Logger interface {
	// Debug logs a debug message.
	Debug(msg string, args ...any)

	// Info logs an info message.
	Info(msg string, args ...any)

	// Warn logs a warning message.
	Warn(msg string, args ...any)

	// Error logs an error message.
	Error(msg string, args ...any)

	// With returns a new logger with the given key-value pairs.
	With(args ...any) Logger

	// WithContext returns a new logger with context.
	WithContext(ctx context.Context) Logger
}
