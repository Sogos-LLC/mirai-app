package temporal

import (
	"log/slog"

	temporallog "go.temporal.io/sdk/log"
)

// slogAdapter adapts slog.Logger to Temporal's log.Logger interface.
type slogAdapter struct {
	logger *slog.Logger
}

func newSlogAdapter(logger *slog.Logger) temporallog.Logger {
	return &slogAdapter{logger: logger}
}

func (a *slogAdapter) Debug(msg string, keyvals ...interface{}) {
	a.logger.Debug(msg, keyvals...)
}

func (a *slogAdapter) Info(msg string, keyvals ...interface{}) {
	a.logger.Info(msg, keyvals...)
}

func (a *slogAdapter) Warn(msg string, keyvals ...interface{}) {
	a.logger.Warn(msg, keyvals...)
}

func (a *slogAdapter) Error(msg string, keyvals ...interface{}) {
	a.logger.Error(msg, keyvals...)
}
