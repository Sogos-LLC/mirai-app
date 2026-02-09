// Package auth provides authentication utilities for the sharing feature.
package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ShareSessionClaims contains the claims in a share session token.
type ShareSessionClaims struct {
	ShareLinkID uuid.UUID `json:"sid"`
	TenantID    uuid.UUID `json:"tid"`
	CourseID    uuid.UUID `json:"cid"`
	Email       string    `json:"email"`
	ExpiresAt   time.Time `json:"exp"`
}

// ShareSessionManager creates and validates share session tokens.
type ShareSessionManager struct {
	secret []byte
}

// NewShareSessionManager creates a new share session manager.
func NewShareSessionManager(secret string) *ShareSessionManager {
	return &ShareSessionManager{secret: []byte(secret)}
}

// CreateToken creates a signed share session token with 24h expiry.
func (m *ShareSessionManager) CreateToken(shareLinkID, tenantID, courseID uuid.UUID, email string) (string, error) {
	claims := ShareSessionClaims{
		ShareLinkID: shareLinkID,
		TenantID:    tenantID,
		CourseID:    courseID,
		Email:       email,
		ExpiresAt:   time.Now().Add(24 * time.Hour),
	}

	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("failed to marshal claims: %w", err)
	}

	encoded := base64.URLEncoding.EncodeToString(payload)
	sig := m.sign(encoded)

	return encoded + "." + sig, nil
}

// ValidateToken validates a share session token and returns the claims.
func (m *ShareSessionManager) ValidateToken(token string) (*ShareSessionClaims, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("invalid token format")
	}

	encoded, sig := parts[0], parts[1]

	// Verify signature
	expectedSig := m.sign(encoded)
	if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
		return nil, fmt.Errorf("invalid token signature")
	}

	// Decode payload
	payload, err := base64.URLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("invalid token encoding: %w", err)
	}

	var claims ShareSessionClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("invalid token payload: %w", err)
	}

	// Check expiry
	if time.Now().After(claims.ExpiresAt) {
		return nil, fmt.Errorf("token expired")
	}

	return &claims, nil
}

// sign creates an HMAC-SHA256 signature for the given data.
func (m *ShareSessionManager) sign(data string) string {
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(data))
	return base64.URLEncoding.EncodeToString(mac.Sum(nil))
}
