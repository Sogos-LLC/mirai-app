package errors

import (
	"errors"
	"net/http"
)

// DomainError represents a business logic error with an error code and HTTP status.
type DomainError struct {
	Code       string
	Message    string
	HTTPStatus int
	cause      error
}

// Error implements the error interface.
func (e *DomainError) Error() string {
	if e.cause != nil {
		return e.Message + ": " + e.cause.Error()
	}
	return e.Message
}

// Unwrap returns the underlying cause for errors.Is/As support.
func (e *DomainError) Unwrap() error {
	return e.cause
}

// WithMessage returns a new error with a custom message.
func (e *DomainError) WithMessage(msg string) *DomainError {
	return &DomainError{
		Code:       e.Code,
		Message:    msg,
		HTTPStatus: e.HTTPStatus,
		cause:      e.cause,
	}
}

// WithCause returns a new error wrapping an underlying cause.
func (e *DomainError) WithCause(err error) *DomainError {
	return &DomainError{
		Code:       e.Code,
		Message:    e.Message,
		HTTPStatus: e.HTTPStatus,
		cause:      err,
	}
}

// Is reports whether any error in err's tree matches target.
func (e *DomainError) Is(target error) bool {
	var t *DomainError
	if errors.As(target, &t) {
		return e.Code == t.Code
	}
	return false
}

// Predefined domain errors

// Authentication & Authorization errors
var (
	ErrUnauthorized = &DomainError{
		Code:       "AUTH_UNAUTHORIZED",
		Message:    "authentication required",
		HTTPStatus: http.StatusUnauthorized,
	}

	ErrForbidden = &DomainError{
		Code:       "AUTH_FORBIDDEN",
		Message:    "insufficient permissions",
		HTTPStatus: http.StatusForbidden,
	}

	ErrInvalidCredentials = &DomainError{
		Code:       "AUTH_INVALID_CREDENTIALS",
		Message:    "invalid email or password",
		HTTPStatus: http.StatusUnauthorized,
	}

	ErrSessionExpired = &DomainError{
		Code:       "AUTH_SESSION_EXPIRED",
		Message:    "session has expired",
		HTTPStatus: http.StatusUnauthorized,
	}
)

// User errors
var (
	ErrUserNotFound = &DomainError{
		Code:       "USER_NOT_FOUND",
		Message:    "user not found",
		HTTPStatus: http.StatusNotFound,
	}

	ErrEmailAlreadyExists = &DomainError{
		Code:       "USER_EMAIL_EXISTS",
		Message:    "an account with this email already exists",
		HTTPStatus: http.StatusConflict,
	}

	ErrUserAlreadyOnboarded = &DomainError{
		Code:       "USER_ALREADY_ONBOARDED",
		Message:    "user has already completed onboarding",
		HTTPStatus: http.StatusConflict,
	}

	ErrUserHasNoCompany = &DomainError{
		Code:       "USER_NO_COMPANY",
		Message:    "user is not associated with a company",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Company errors
var (
	ErrCompanyNotFound = &DomainError{
		Code:       "COMPANY_NOT_FOUND",
		Message:    "company not found",
		HTTPStatus: http.StatusNotFound,
	}
)

// Team errors
var (
	ErrTeamNotFound = &DomainError{
		Code:       "TEAM_NOT_FOUND",
		Message:    "team not found",
		HTTPStatus: http.StatusNotFound,
	}

	ErrTeamMemberNotFound = &DomainError{
		Code:       "TEAM_MEMBER_NOT_FOUND",
		Message:    "team member not found",
		HTTPStatus: http.StatusNotFound,
	}

	ErrUserAlreadyInTeam = &DomainError{
		Code:       "TEAM_USER_ALREADY_MEMBER",
		Message:    "user is already a member of this team",
		HTTPStatus: http.StatusConflict,
	}

	ErrUserNotInCompany = &DomainError{
		Code:       "TEAM_USER_NOT_IN_COMPANY",
		Message:    "user is not a member of this company",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Billing errors
var (
	ErrNoBillingAccount = &DomainError{
		Code:       "BILLING_NO_ACCOUNT",
		Message:    "no billing account found",
		HTTPStatus: http.StatusBadRequest,
	}

	ErrPaymentFailed = &DomainError{
		Code:       "BILLING_PAYMENT_FAILED",
		Message:    "payment processing failed",
		HTTPStatus: http.StatusBadGateway,
	}

	ErrInvalidPlan = &DomainError{
		Code:       "BILLING_INVALID_PLAN",
		Message:    "invalid plan selected",
		HTTPStatus: http.StatusBadRequest,
	}

	ErrCheckoutFailed = &DomainError{
		Code:       "BILLING_CHECKOUT_FAILED",
		Message:    "failed to create checkout session",
		HTTPStatus: http.StatusInternalServerError,
	}

	ErrWebhookInvalid = &DomainError{
		Code:       "BILLING_WEBHOOK_INVALID",
		Message:    "invalid webhook signature",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Invitation errors
var (
	ErrInvitationNotFound = &DomainError{
		Code:       "INVITATION_NOT_FOUND",
		Message:    "invitation not found",
		HTTPStatus: http.StatusNotFound,
	}

	ErrInvitationExpired = &DomainError{
		Code:       "INVITATION_EXPIRED",
		Message:    "invitation has expired",
		HTTPStatus: http.StatusBadRequest,
	}

	ErrInvitationAlreadyAccepted = &DomainError{
		Code:       "INVITATION_ALREADY_ACCEPTED",
		Message:    "invitation has already been accepted",
		HTTPStatus: http.StatusConflict,
	}

	ErrInvitationRevoked = &DomainError{
		Code:       "INVITATION_REVOKED",
		Message:    "invitation has been revoked",
		HTTPStatus: http.StatusBadRequest,
	}

	ErrEmailAlreadyInvited = &DomainError{
		Code:       "INVITATION_EMAIL_ALREADY_INVITED",
		Message:    "this email has already been invited",
		HTTPStatus: http.StatusConflict,
	}

	ErrSeatLimitExceeded = &DomainError{
		Code:       "INVITATION_SEAT_LIMIT_EXCEEDED",
		Message:    "no seats available - please upgrade your plan or remove team members",
		HTTPStatus: http.StatusForbidden,
	}

	ErrInvitationEmailMismatch = &DomainError{
		Code:       "INVITATION_EMAIL_MISMATCH",
		Message:    "your email does not match the invitation",
		HTTPStatus: http.StatusForbidden,
	}

	ErrInvitationInvalid = &DomainError{
		Code:       "INVITATION_INVALID",
		Message:    "invitation is not valid",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Validation errors
var (
	ErrInvalidInput = &DomainError{
		Code:       "VALIDATION_INVALID_INPUT",
		Message:    "invalid input",
		HTTPStatus: http.StatusBadRequest,
	}

	ErrMissingRequired = &DomainError{
		Code:       "VALIDATION_MISSING_REQUIRED",
		Message:    "missing required field",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Generic errors
var (
	ErrNotFound = &DomainError{
		Code:       "NOT_FOUND",
		Message:    "resource not found",
		HTTPStatus: http.StatusNotFound,
	}

	ErrBadRequest = &DomainError{
		Code:       "BAD_REQUEST",
		Message:    "bad request",
		HTTPStatus: http.StatusBadRequest,
	}
)

// Internal errors
var (
	ErrInternal = &DomainError{
		Code:       "INTERNAL_ERROR",
		Message:    "an unexpected error occurred",
		HTTPStatus: http.StatusInternalServerError,
	}

	ErrExternalService = &DomainError{
		Code:       "EXTERNAL_SERVICE_ERROR",
		Message:    "external service unavailable",
		HTTPStatus: http.StatusBadGateway,
	}
)

// IsDomainError checks if an error is a DomainError.
func IsDomainError(err error) bool {
	var domainErr *DomainError
	return errors.As(err, &domainErr)
}

// GetDomainError extracts a DomainError from an error chain.
func GetDomainError(err error) *DomainError {
	var domainErr *DomainError
	if errors.As(err, &domainErr) {
		return domainErr
	}
	return nil
}
