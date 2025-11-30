package connect

import (
	"errors"

	"github.com/google/uuid"
)

// Context keys for auth data
type kratosIDKey struct{}
type emailKey struct{}

// parseUUID parses a string to UUID.
func parseUUID(s string) (uuid.UUID, error) {
	if s == "" {
		return uuid.Nil, errors.New("empty uuid")
	}
	return uuid.Parse(s)
}

// mustParseUUID parses a string to UUID, returning Nil on error.
func mustParseUUID(s string) uuid.UUID {
	u, _ := uuid.Parse(s)
	return u
}

// derefString dereferences an optional string pointer.
func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// strPtr returns a pointer to the string, or nil if empty.
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// uuidPtrToString converts a uuid pointer to an optional string.
func uuidPtrToString(u *uuid.UUID) *string {
	if u == nil {
		return nil
	}
	s := u.String()
	return &s
}
