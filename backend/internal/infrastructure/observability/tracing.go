// Package observability provides OpenTelemetry tracing setup for the Mirai backend.
package observability

import (
	"context"
	"fmt"
	"log/slog"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.24.0"
)

// SetupTracing initializes an OTLP HTTP trace exporter pointed at Logfire.
// It returns a shutdown function that flushes pending spans.
// If logfireToken is empty, tracing is not configured (graceful no-op).
func SetupTracing(ctx context.Context, logfireToken, environment string, logger *slog.Logger) (shutdown func(context.Context) error, err error) {
	if logfireToken == "" {
		logger.Info("tracing not configured (LOGFIRE_TOKEN not set)")
		return func(context.Context) error { return nil }, nil
	}

	exporter, err := otlptracehttp.New(ctx,
		otlptracehttp.WithEndpoint("logfire-us.pydantic.dev"),
		otlptracehttp.WithHeaders(map[string]string{
			"Authorization": "Bearer " + logfireToken,
		}),
	)
	if err != nil {
		return nil, fmt.Errorf("create OTLP exporter: %w", err)
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName("mirai-backend"),
			semconv.ServiceVersion("1.0.0"),
			semconv.DeploymentEnvironment(environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("create OTel resource: %w", err)
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)

	logger.Info("tracing configured", "endpoint", "logfire-us.pydantic.dev", "environment", environment)

	return tp.Shutdown, nil
}
