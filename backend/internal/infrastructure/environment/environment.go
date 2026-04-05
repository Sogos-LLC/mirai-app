// Package environment provides environment detection and validation
// to prevent cross-environment resource access (e.g., UAT accessing prod database).
package environment

import (
	"fmt"
	"os"
	"strings"
)

// Environment represents the deployment environment.
type Environment string

const (
	// EnvLocal is for local development (k3d, docker-compose, or bare metal).
	EnvLocal Environment = "local"
	// EnvUAT is for user acceptance testing.
	EnvUAT Environment = "uat"
	// EnvProduction is for live production.
	EnvProduction Environment = "production"
)

// String returns the string representation of the environment.
func (e Environment) String() string {
	return string(e)
}

// IsValid returns true if the environment is a known valid value.
func (e Environment) IsValid() bool {
	switch e {
	case EnvLocal, EnvUAT, EnvProduction:
		return true
	default:
		return false
	}
}

// IsProduction returns true if running in production.
func (e Environment) IsProduction() bool {
	return e == EnvProduction
}

// IsUAT returns true if running in UAT.
func (e Environment) IsUAT() bool {
	return e == EnvUAT
}

// IsLocal returns true if running in local development.
func (e Environment) IsLocal() bool {
	return e == EnvLocal
}

// RequiresStrictValidation returns true if the environment requires
// strict validation of persistence endpoints (prod and UAT).
func (e Environment) RequiresStrictValidation() bool {
	return e == EnvProduction || e == EnvUAT
}

// Detect determines the environment from Kubernetes namespace or explicit env var.
// Detection order:
// 1. Explicit MIRAI_ENV override (for testing)
// 2. POD_NAMESPACE (injected by Kubernetes)
// 3. Default to local if nothing is set
func Detect() (Environment, error) {
	// 1. Explicit override via MIRAI_ENV
	if explicit := os.Getenv("MIRAI_ENV"); explicit != "" {
		env := Environment(strings.ToLower(explicit))
		if !env.IsValid() {
			return "", fmt.Errorf("invalid MIRAI_ENV value: %q (must be one of: local, uat, production)", explicit)
		}
		return env, nil
	}

	// 2. Detect from Kubernetes namespace
	namespace := os.Getenv("POD_NAMESPACE")
	switch {
	case namespace == "mirai":
		return EnvProduction, nil
	case strings.HasSuffix(namespace, "-uat") || namespace == "mirai-uat":
		return EnvUAT, nil
	case strings.HasSuffix(namespace, "-local") || namespace == "mirai-local":
		return EnvLocal, nil
	case strings.HasSuffix(namespace, "-dev") || namespace == "mirai-loc-dev":
		return EnvLocal, nil
	case namespace == "" || namespace == "default":
		// No namespace = local development outside K8s
		return EnvLocal, nil
	default:
		// Unknown namespace - could be a typo or new environment
		return "", fmt.Errorf("cannot determine environment from namespace %q: expected 'mirai', 'mirai-uat', 'mirai-local', or 'mirai-*-dev'", namespace)
	}
}

// MustDetect is like Detect but panics on error.
// Use only in initialization code where failure should be fatal.
func MustDetect() Environment {
	env, err := Detect()
	if err != nil {
		panic(fmt.Sprintf("environment detection failed: %v", err))
	}
	return env
}
