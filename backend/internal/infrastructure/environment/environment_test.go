package environment

import (
	"os"
	"strings"
	"testing"
)

func TestEnvironmentIsValid(t *testing.T) {
	tests := []struct {
		env  Environment
		want bool
	}{
		{EnvLocal, true},
		{EnvUAT, true},
		{EnvProduction, true},
		{Environment("staging"), false},
		{Environment(""), false},
	}

	for _, tt := range tests {
		t.Run(string(tt.env), func(t *testing.T) {
			if got := tt.env.IsValid(); got != tt.want {
				t.Errorf("Environment(%q).IsValid() = %v, want %v", tt.env, got, tt.want)
			}
		})
	}
}

func TestEnvironmentHelpers(t *testing.T) {
	tests := []struct {
		env                      Environment
		isProduction             bool
		isUAT                    bool
		isLocal                  bool
		requiresStrictValidation bool
	}{
		{EnvProduction, true, false, false, true},
		{EnvUAT, false, true, false, true},
		{EnvLocal, false, false, true, false},
	}

	for _, tt := range tests {
		t.Run(string(tt.env), func(t *testing.T) {
			if got := tt.env.IsProduction(); got != tt.isProduction {
				t.Errorf("IsProduction() = %v, want %v", got, tt.isProduction)
			}
			if got := tt.env.IsUAT(); got != tt.isUAT {
				t.Errorf("IsUAT() = %v, want %v", got, tt.isUAT)
			}
			if got := tt.env.IsLocal(); got != tt.isLocal {
				t.Errorf("IsLocal() = %v, want %v", got, tt.isLocal)
			}
			if got := tt.env.RequiresStrictValidation(); got != tt.requiresStrictValidation {
				t.Errorf("RequiresStrictValidation() = %v, want %v", got, tt.requiresStrictValidation)
			}
		})
	}
}

func TestDetect(t *testing.T) {
	tests := []struct {
		name        string
		miraiEnv    string
		podNS       string
		want        Environment
		wantErr     bool
		errContains string
	}{
		{
			name:     "explicit MIRAI_ENV=production",
			miraiEnv: "production",
			want:     EnvProduction,
		},
		{
			name:     "explicit MIRAI_ENV=uat",
			miraiEnv: "uat",
			want:     EnvUAT,
		},
		{
			name:     "explicit MIRAI_ENV=local",
			miraiEnv: "local",
			want:     EnvLocal,
		},
		{
			name:        "explicit MIRAI_ENV invalid",
			miraiEnv:    "staging",
			wantErr:     true,
			errContains: "invalid MIRAI_ENV value",
		},
		{
			name:  "namespace mirai = production",
			podNS: "mirai",
			want:  EnvProduction,
		},
		{
			name:  "namespace mirai-uat = uat",
			podNS: "mirai-uat",
			want:  EnvUAT,
		},
		{
			name:  "namespace mirai-local = local",
			podNS: "mirai-local",
			want:  EnvLocal,
		},
		{
			name:  "namespace ending with -uat = uat",
			podNS: "something-uat",
			want:  EnvUAT,
		},
		{
			name:  "namespace ending with -local = local",
			podNS: "something-local",
			want:  EnvLocal,
		},
		{
			name:  "empty namespace = local (dev)",
			podNS: "",
			want:  EnvLocal,
		},
		{
			name:  "default namespace = local (dev)",
			podNS: "default",
			want:  EnvLocal,
		},
		{
			name:        "unknown namespace = error",
			podNS:       "random-namespace",
			wantErr:     true,
			errContains: "cannot determine environment",
		},
		{
			name:     "MIRAI_ENV takes precedence over POD_NAMESPACE",
			miraiEnv: "uat",
			podNS:    "mirai", // would be production without override
			want:     EnvUAT,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Save and restore env vars
			oldMiraiEnv := os.Getenv("MIRAI_ENV")
			oldPodNS := os.Getenv("POD_NAMESPACE")
			defer func() {
				os.Setenv("MIRAI_ENV", oldMiraiEnv)
				os.Setenv("POD_NAMESPACE", oldPodNS)
			}()

			// Set test env vars
			if tt.miraiEnv != "" {
				os.Setenv("MIRAI_ENV", tt.miraiEnv)
			} else {
				os.Unsetenv("MIRAI_ENV")
			}
			if tt.podNS != "" {
				os.Setenv("POD_NAMESPACE", tt.podNS)
			} else {
				os.Unsetenv("POD_NAMESPACE")
			}

			got, err := Detect()
			if tt.wantErr {
				if err == nil {
					t.Errorf("Detect() error = nil, want error containing %q", tt.errContains)
				} else if !strings.Contains(err.Error(), tt.errContains) {
					t.Errorf("Detect() error = %v, want error containing %q", err, tt.errContains)
				}
				return
			}

			if err != nil {
				t.Errorf("Detect() unexpected error: %v", err)
				return
			}

			if got != tt.want {
				t.Errorf("Detect() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestValidatorValidateConfig(t *testing.T) {
	tests := []struct {
		name        string
		env         Environment
		dbURL       string
		s3Bucket    string
		redisURL    string
		kratosURL   string
		wantErr     bool
		errContains string
	}{
		// Production - valid config
		{
			name:      "production valid config",
			env:       EnvProduction,
			dbURL:     "postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai",
			s3Bucket:  "mirai",
			redisURL:  "redis://redis.redis.svc.cluster.local:6379",
			kratosURL: "http://kratos-public.kratos.svc.cluster.local",
			wantErr:   false,
		},
		// Production - wrong database (UAT db in prod)
		{
			name:        "production wrong database",
			env:         EnvProduction,
			dbURL:       "postgres://user:pass@mirai-uat-db-rw.mirai-uat.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai",
			redisURL:    "redis://redis.redis.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos.svc.cluster.local",
			wantErr:     true,
			errContains: "DATABASE_URL",
		},
		// Production - wrong bucket
		{
			name:        "production wrong bucket",
			env:         EnvProduction,
			dbURL:       "postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai-uat",
			redisURL:    "redis://redis.redis.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos.svc.cluster.local",
			wantErr:     true,
			errContains: "S3_BUCKET",
		},
		// UAT - valid config
		{
			name:      "uat valid config",
			env:       EnvUAT,
			dbURL:     "postgres://user:pass@mirai-uat-db-rw.mirai-uat.svc.cluster.local:5432/mirai",
			s3Bucket:  "mirai-uat",
			redisURL:  "redis://redis.redis-uat.svc.cluster.local:6379",
			kratosURL: "http://kratos-public.kratos-uat.svc.cluster.local",
			wantErr:   false,
		},
		// UAT - production database (CRITICAL: this must fail)
		{
			name:        "uat with production database MUST FAIL",
			env:         EnvUAT,
			dbURL:       "postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai-uat",
			redisURL:    "redis://redis.redis-uat.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos-uat.svc.cluster.local",
			wantErr:     true,
			errContains: "DATABASE_URL",
		},
		// UAT - production bucket (CRITICAL: this must fail)
		{
			name:        "uat with production bucket MUST FAIL",
			env:         EnvUAT,
			dbURL:       "postgres://user:pass@mirai-uat-db-rw.mirai-uat.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai",
			redisURL:    "redis://redis.redis-uat.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos-uat.svc.cluster.local",
			wantErr:     true,
			errContains: "S3_BUCKET",
		},
		// UAT - production redis (CRITICAL: this must fail)
		{
			name:        "uat with production redis MUST FAIL",
			env:         EnvUAT,
			dbURL:       "postgres://user:pass@mirai-uat-db-rw.mirai-uat.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai-uat",
			redisURL:    "redis://redis.redis.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos-uat.svc.cluster.local",
			wantErr:     true,
			errContains: "REDIS_URL",
		},
		// Local - anything goes
		{
			name:      "local any config is valid",
			env:       EnvLocal,
			dbURL:     "postgres://user:pass@localhost:5432/mirai",
			s3Bucket:  "dev-bucket",
			redisURL:  "redis://localhost:6379",
			kratosURL: "http://localhost:4433",
			wantErr:   false,
		},
		// Local - even production config is allowed (for local testing)
		{
			name:      "local can use production-like config",
			env:       EnvLocal,
			dbURL:     "postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai",
			s3Bucket:  "mirai",
			redisURL:  "redis://redis.redis.svc.cluster.local:6379",
			kratosURL: "http://kratos-public.kratos.svc.cluster.local",
			wantErr:   false,
		},
		// Multiple violations reported together
		{
			name:        "multiple violations",
			env:         EnvUAT,
			dbURL:       "postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai",
			s3Bucket:    "mirai",
			redisURL:    "redis://redis.redis.svc.cluster.local:6379",
			kratosURL:   "http://kratos-public.kratos.svc.cluster.local",
			wantErr:     true,
			errContains: "DATABASE_URL",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			validator := NewValidator(tt.env)
			err := validator.ValidateConfig(tt.dbURL, tt.s3Bucket, tt.redisURL, tt.kratosURL)

			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateConfig() error = nil, want error containing %q", tt.errContains)
					return
				}
				if !strings.Contains(err.Error(), tt.errContains) {
					t.Errorf("ValidateConfig() error = %v, want error containing %q", err, tt.errContains)
				}
				// Verify it's a ConfigMismatchError
				if _, ok := err.(*ConfigMismatchError); !ok {
					t.Errorf("ValidateConfig() error type = %T, want *ConfigMismatchError", err)
				}
				return
			}

			if err != nil {
				t.Errorf("ValidateConfig() unexpected error: %v", err)
			}
		})
	}
}

func TestValidateRequiredEnvVars(t *testing.T) {
	tests := []struct {
		name        string
		env         Environment
		vars        map[string]string
		wantErr     bool
		errContains string
	}{
		{
			name: "production all vars set",
			env:  EnvProduction,
			vars: map[string]string{
				"DATABASE_URL": "postgres://...",
				"REDIS_URL":    "redis://...",
				"S3_BUCKET":    "mirai",
			},
			wantErr: false,
		},
		{
			name: "production missing vars",
			env:  EnvProduction,
			vars: map[string]string{
				"DATABASE_URL": "postgres://...",
				"REDIS_URL":    "",
				"S3_BUCKET":    "",
			},
			wantErr:     true,
			errContains: "REDIS_URL",
		},
		{
			name: "local missing vars is ok",
			env:  EnvLocal,
			vars: map[string]string{
				"DATABASE_URL": "",
				"REDIS_URL":    "",
				"S3_BUCKET":    "",
			},
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateRequiredEnvVars(tt.env, tt.vars)
			if tt.wantErr {
				if err == nil {
					t.Errorf("ValidateRequiredEnvVars() error = nil, want error")
					return
				}
				if !strings.Contains(err.Error(), tt.errContains) {
					t.Errorf("ValidateRequiredEnvVars() error = %v, want error containing %q", err, tt.errContains)
				}
				return
			}
			if err != nil {
				t.Errorf("ValidateRequiredEnvVars() unexpected error: %v", err)
			}
		})
	}
}

func TestExtractHost(t *testing.T) {
	tests := []struct {
		url     string
		want    string
		wantErr bool
	}{
		{"postgres://user:pass@localhost:5432/db", "localhost", false},
		{"postgres://user:pass@mirai-db-rw.mirai.svc.cluster.local:5432/mirai", "mirai-db-rw.mirai.svc.cluster.local", false},
		{"redis://redis.redis.svc.cluster.local:6379", "redis.redis.svc.cluster.local", false},
		{"http://kratos-public.kratos.svc.cluster.local", "kratos-public.kratos.svc.cluster.local", false},
		{"http://localhost:4433", "localhost", false},
	}

	for _, tt := range tests {
		t.Run(tt.url, func(t *testing.T) {
			got, err := extractHost(tt.url)
			if tt.wantErr {
				if err == nil {
					t.Errorf("extractHost() error = nil, want error")
				}
				return
			}
			if err != nil {
				t.Errorf("extractHost() unexpected error: %v", err)
				return
			}
			if got != tt.want {
				t.Errorf("extractHost() = %v, want %v", got, tt.want)
			}
		})
	}
}
