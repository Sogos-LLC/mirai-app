package connect

import (
	"errors"
	"net/http"

	"connectrpc.com/connect"
	domainerrors "github.com/sogos/mirai-backend/internal/domain/errors"
)

// Common errors
var (
	errEmailRequired    = errors.New("email is required")
	errPasswordRequired = errors.New("password is required")
	errNameRequired     = errors.New("first name and last name are required")
	errMissingToken     = errors.New("token is required")
	errUnauthenticated  = errors.New("authentication required")
	errForbidden        = errors.New("permission denied")
)

// toConnectError converts domain errors to Connect errors with appropriate codes.
func toConnectError(err error) error {
	if err == nil {
		return nil
	}

	// Check for domain errors
	domainErr := domainerrors.GetDomainError(err)
	if domainErr != nil {
		switch domainErr.HTTPStatus {
		case http.StatusNotFound:
			return connect.NewError(connect.CodeNotFound, err)
		case http.StatusConflict:
			return connect.NewError(connect.CodeAlreadyExists, err)
		case http.StatusUnauthorized:
			return connect.NewError(connect.CodeUnauthenticated, err)
		case http.StatusForbidden:
			return connect.NewError(connect.CodePermissionDenied, err)
		case http.StatusBadRequest:
			return connect.NewError(connect.CodeInvalidArgument, err)
		case http.StatusBadGateway, http.StatusServiceUnavailable:
			return connect.NewError(connect.CodeUnavailable, err)
		default:
			return connect.NewError(connect.CodeInternal, err)
		}
	}

	// Default to internal error
	return connect.NewError(connect.CodeInternal, err)
}
