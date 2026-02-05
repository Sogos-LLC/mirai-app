package service

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

// IdentityProvider abstracts Kratos identity operations.
type IdentityProvider interface {
	// CreateIdentity creates a new identity with the given credentials.
	CreateIdentity(ctx context.Context, req CreateIdentityRequest) (*Identity, error)

	// CreateIdentityWithHash creates a new identity with a pre-hashed password.
	// This is used when provisioning accounts from pending registrations.
	CreateIdentityWithHash(ctx context.Context, req CreateIdentityWithHashRequest) (*Identity, error)

	// GetIdentity retrieves an identity by its ID.
	GetIdentity(ctx context.Context, identityID string) (*Identity, error)

	// CheckEmailExists checks if an email is already registered.
	CheckEmailExists(ctx context.Context, email string) (bool, error)

	// PerformLogin performs a self-service login and returns a session token.
	// This uses the Kratos API flow (not browser flow) to get a session token.
	PerformLogin(ctx context.Context, email, password string) (*SessionToken, error)

	// CreateSessionForIdentity creates a session for an identity using Kratos admin API.
	// This is useful when we need to issue a session token without the user's password.
	CreateSessionForIdentity(ctx context.Context, identityID string) (*SessionToken, error)

	// ValidateSession validates a session and returns the session info.
	ValidateSession(ctx context.Context, cookies []*http.Cookie) (*Session, error)
}

// CreateIdentityRequest contains the data needed to create a new identity.
type CreateIdentityRequest struct {
	Email     string
	Password  string
	FirstName string
	LastName  string
}

// CreateIdentityWithHashRequest contains data for creating an identity with a pre-hashed password.
type CreateIdentityWithHashRequest struct {
	Email        string
	PasswordHash string // bcrypt hash
	FirstName    string
	LastName     string
}

// Identity represents a Kratos identity.
type Identity struct {
	ID        string
	Email     string
	FirstName string
	LastName  string
}

// Session represents a Kratos session.
type Session struct {
	ID         string
	IdentityID uuid.UUID
	Email      string
	FirstName  string
	LastName   string
	Active     bool
}

// SessionToken contains the token data needed to set a session cookie.
type SessionToken struct {
	Token     string // The session token value
	ExpiresAt int64  // Unix timestamp when the session expires
}
