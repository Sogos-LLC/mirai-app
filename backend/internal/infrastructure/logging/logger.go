package logging

import (
	"context"
	"log/slog"
	"os"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// slogLogger wraps slog.Logger to implement the domain Logger interface.
type slogLogger struct {
	logger *slog.Logger
}

// New creates a new structured logger.
func New() service.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	return &slogLogger{
		logger: slog.New(handler),
	}
}

// NewWithLevel creates a new structured logger with the specified level.
func NewWithLevel(level slog.Level) service.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	})
	return &slogLogger{
		logger: slog.New(handler),
	}
}

// Debug logs a debug message.
func (l *slogLogger) Debug(msg string, args ...any) {
	l.logger.Debug(msg, args...)
}

// Info logs an info message.
func (l *slogLogger) Info(msg string, args ...any) {
	l.logger.Info(msg, args...)
}

// Warn logs a warning message.
func (l *slogLogger) Warn(msg string, args ...any) {
	l.logger.Warn(msg, args...)
}

// Error logs an error message.
func (l *slogLogger) Error(msg string, args ...any) {
	l.logger.Error(msg, args...)
}

// With returns a new logger with the given key-value pairs.
func (l *slogLogger) With(args ...any) service.Logger {
	return &slogLogger{
		logger: l.logger.With(args...),
	}
}

// WithContext returns a new logger with context.
func (l *slogLogger) WithContext(ctx context.Context) service.Logger {
	// For now, just return the same logger.
	// Can be extended to extract request IDs, trace IDs, etc from context.
	return l
}

// GetSlogLogger returns the underlying slog.Logger for use with stdlib.
func (l *slogLogger) GetSlogLogger() *slog.Logger {
	return l.logger
}
