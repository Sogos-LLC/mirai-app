package environment

import (
	"fmt"
	"net/url"
	"strings"
)

// Constraint defines expected resource patterns for an environment.
type Constraint struct {
	// DatabaseHostPattern is the expected substring in the database URL host.
	// For production: "mirai-db-rw.mirai.svc"
	// For UAT: "mirai-uat-db-rw.mirai-uat.svc"
	DatabaseHostPattern string

	// S3Bucket is the expected S3/MinIO bucket name.
	S3Bucket string

	// RedisHostPattern is the expected substring in the Redis URL host.
	RedisHostPattern string

	// KratosHostPattern is the expected substring in the Kratos URL host.
	KratosHostPattern string
}

// constraints maps each non-local environment to its expected resource patterns.
var constraints = map[Environment]Constraint{
	EnvProduction: {
		DatabaseHostPattern: "mirai-db-rw.mirai.svc",
		S3Bucket:            "mirai",
		RedisHostPattern:    "redis.redis.svc",
		KratosHostPattern:   "kratos-public.kratos.svc",
	},
	EnvUAT: {
		DatabaseHostPattern: "mirai-uat-db-rw.mirai-uat.svc",
		S3Bucket:            "mirai-uat",
		RedisHostPattern:    "redis.redis-uat.svc",
		KratosHostPattern:   "kratos-public.kratos-uat.svc",
	},
	// EnvLocal has no constraints - flexible for development
}

// ConfigMismatchError indicates configuration doesn't match the detected environment.
type ConfigMismatchError struct {
	Environment Environment
	Violations  []string
}

func (e *ConfigMismatchError) Error() string {
	return fmt.Sprintf(
		"CRITICAL: Configuration mismatch for environment %q:\n  - %s\n\n"+
			"This indicates a deployment misconfiguration that could cause cross-environment data access.\n"+
			"Refusing to start. Please verify your environment variables match the %s environment.",
		e.Environment,
		strings.Join(e.Violations, "\n  - "),
		e.Environment,
	)
}

// Validator validates configuration against environment constraints.
type Validator struct {
	env        Environment
	constraint Constraint
}

// NewValidator creates a validator for the given environment.
func NewValidator(env Environment) *Validator {
	return &Validator{
		env:        env,
		constraint: constraints[env],
	}
}

// ValidateConfig checks if the provided configuration matches environment expectations.
// Returns nil if validation passes, ConfigMismatchError if there are violations.
// Local environment always passes (no constraints).
func (v *Validator) ValidateConfig(databaseURL, s3Bucket, redisURL, kratosURL string) error {
	// Local environment is flexible - skip validation
	if v.env == EnvLocal {
		return nil
	}

	var violations []string

	// Validate database URL
	if v.constraint.DatabaseHostPattern != "" && databaseURL != "" {
		dbHost, err := extractHost(databaseURL)
		if err != nil {
			violations = append(violations, fmt.Sprintf("DATABASE_URL: cannot parse URL: %v", err))
		} else if !strings.Contains(dbHost, v.constraint.DatabaseHostPattern) {
			violations = append(violations, fmt.Sprintf(
				"DATABASE_URL: expected host containing %q for %s, got %q",
				v.constraint.DatabaseHostPattern, v.env, dbHost,
			))
		}
	}

	// Validate S3 bucket
	if v.constraint.S3Bucket != "" && s3Bucket != "" {
		if s3Bucket != v.constraint.S3Bucket {
			violations = append(violations, fmt.Sprintf(
				"S3_BUCKET: expected %q for %s, got %q",
				v.constraint.S3Bucket, v.env, s3Bucket,
			))
		}
	}

	// Validate Redis URL
	if v.constraint.RedisHostPattern != "" && redisURL != "" {
		redisHost, err := extractHost(redisURL)
		if err != nil {
			violations = append(violations, fmt.Sprintf("REDIS_URL: cannot parse URL: %v", err))
		} else if !strings.Contains(redisHost, v.constraint.RedisHostPattern) {
			violations = append(violations, fmt.Sprintf(
				"REDIS_URL: expected host containing %q for %s, got %q",
				v.constraint.RedisHostPattern, v.env, redisHost,
			))
		}
	}

	// Validate Kratos URL
	if v.constraint.KratosHostPattern != "" && kratosURL != "" {
		kratosHost, err := extractHost(kratosURL)
		if err != nil {
			violations = append(violations, fmt.Sprintf("KRATOS_URL: cannot parse URL: %v", err))
		} else if !strings.Contains(kratosHost, v.constraint.KratosHostPattern) {
			violations = append(violations, fmt.Sprintf(
				"KRATOS_URL: expected host containing %q for %s, got %q",
				v.constraint.KratosHostPattern, v.env, kratosHost,
			))
		}
	}

	if len(violations) > 0 {
		return &ConfigMismatchError{
			Environment: v.env,
			Violations:  violations,
		}
	}

	return nil
}

// extractHost parses a URL and returns its host (without port).
func extractHost(rawURL string) (string, error) {
	// Handle postgres:// and redis:// schemes
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	// Return just the hostname, stripping port if present
	return parsed.Hostname(), nil
}

// ValidateRequiredEnvVars checks that required environment variables are set
// for non-local environments. Returns an error listing all missing variables.
func ValidateRequiredEnvVars(env Environment, vars map[string]string) error {
	if env == EnvLocal {
		return nil
	}

	var missing []string
	for name, value := range vars {
		if value == "" {
			missing = append(missing, name)
		}
	}

	if len(missing) > 0 {
		return fmt.Errorf(
			"missing required environment variables for %s environment: %s",
			env, strings.Join(missing, ", "),
		)
	}

	return nil
}
