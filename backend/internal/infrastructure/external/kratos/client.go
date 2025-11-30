package kratos

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/service"
)

// Client implements service.IdentityProvider using Ory Kratos.
type Client struct {
	httpClient *http.Client
	publicURL  string
	adminURL   string
}

// NewClient creates a new Kratos client.
func NewClient(httpClient *http.Client, publicURL, adminURL string) service.IdentityProvider {
	return &Client{
		httpClient: httpClient,
		publicURL:  publicURL,
		adminURL:   adminURL,
	}
}

// kratosIdentityResponse represents the Kratos identity response.
type kratosIdentityResponse struct {
	ID     string `json:"id"`
	Traits struct {
		Email string `json:"email"`
		Name  struct {
			First string `json:"first"`
			Last  string `json:"last"`
		} `json:"name"`
	} `json:"traits"`
}

// kratosSessionResponse represents the Kratos session response.
type kratosSessionResponse struct {
	ID       string `json:"id"`
	Active   bool   `json:"active"`
	Identity struct {
		ID     string `json:"id"`
		Traits struct {
			Email string `json:"email"`
			Name  struct {
				First string `json:"first"`
				Last  string `json:"last"`
			} `json:"name"`
		} `json:"traits"`
	} `json:"identity"`
}

// CreateIdentity creates a new identity with the given credentials.
func (c *Client) CreateIdentity(ctx context.Context, req service.CreateIdentityRequest) (*service.Identity, error) {
	payload := map[string]interface{}{
		"schema_id": "user",
		"traits": map[string]interface{}{
			"email": req.Email,
			"name": map[string]string{
				"first": req.FirstName,
				"last":  req.LastName,
			},
		},
		"credentials": map[string]interface{}{
			"password": map[string]interface{}{
				"config": map[string]string{
					"password": req.Password,
				},
			},
		},
		"state": "active",
	}

	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal payload: %w", err)
	}

	url := fmt.Sprintf("%s/admin/identities", c.adminURL)
	httpReq, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("failed to call Kratos: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		// Parse error response
		var errorResp struct {
			Error struct {
				Message string `json:"message"`
				Code    int    `json:"code"`
			} `json:"error"`
			Message string `json:"message"`
		}
		if err := json.Unmarshal(body, &errorResp); err == nil {
			errMsg := errorResp.Error.Message
			if errMsg == "" {
				errMsg = errorResp.Message
			}
			// Check for conflict (duplicate email)
			if resp.StatusCode == http.StatusConflict || errorResp.Error.Code == 409 {
				return nil, fmt.Errorf("an account with this email already exists")
			}
			if errMsg != "" {
				return nil, fmt.Errorf("%s", errMsg)
			}
		}
		return nil, fmt.Errorf("Kratos returned status %d: %s", resp.StatusCode, string(body))
	}

	var identity kratosIdentityResponse
	if err := json.Unmarshal(body, &identity); err != nil {
		return nil, fmt.Errorf("failed to parse Kratos response: %w", err)
	}

	return &service.Identity{
		ID:        identity.ID,
		Email:     identity.Traits.Email,
		FirstName: identity.Traits.Name.First,
		LastName:  identity.Traits.Name.Last,
	}, nil
}

// CheckEmailExists checks if an email is already registered.
func (c *Client) CheckEmailExists(ctx context.Context, email string) (bool, error) {
	url := fmt.Sprintf("%s/admin/identities?credentials_identifier=%s", c.adminURL, email)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return false, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, nil // Assume not found on error
	}

	var identities []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&identities); err != nil {
		return false, err
	}

	return len(identities) > 0, nil
}

// PerformLogin performs a self-service login via Kratos API flow.
// This creates a session by going through the login flow with credentials.
// Returns a session token that can be used to authenticate requests.
func (c *Client) PerformLogin(ctx context.Context, email, password string) (*service.SessionToken, error) {
	// Step 1: Initialize a login flow (API flow, not browser)
	initURL := fmt.Sprintf("%s/self-service/login/api", c.publicURL)
	fmt.Printf("[Kratos] PerformLogin: initializing flow at %s\n", initURL)

	initReq, err := http.NewRequestWithContext(ctx, "GET", initURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create init request: %w", err)
	}

	initResp, err := c.httpClient.Do(initReq)
	if err != nil {
		fmt.Printf("[Kratos] PerformLogin: init network error: %v\n", err)
		return nil, fmt.Errorf("failed to initialize login flow: %w", err)
	}
	defer initResp.Body.Close()

	initBody, _ := io.ReadAll(initResp.Body)
	fmt.Printf("[Kratos] PerformLogin: init response status=%d\n", initResp.StatusCode)

	if initResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to initialize login flow: status %d: %s", initResp.StatusCode, string(initBody))
	}

	// Parse the flow to get the action URL
	var flow struct {
		ID string `json:"id"`
		UI struct {
			Action string `json:"action"`
		} `json:"ui"`
	}
	if err := json.Unmarshal(initBody, &flow); err != nil {
		return nil, fmt.Errorf("failed to parse login flow: %w", err)
	}

	fmt.Printf("[Kratos] PerformLogin: flow initialized id=%s action=%s\n", flow.ID, flow.UI.Action)

	// Step 2: Submit credentials to the flow
	submitPayload := map[string]interface{}{
		"method":     "password",
		"identifier": email,
		"password":   password,
	}
	submitBody, _ := json.Marshal(submitPayload)

	submitReq, err := http.NewRequestWithContext(ctx, "POST", flow.UI.Action, bytes.NewBuffer(submitBody))
	if err != nil {
		return nil, fmt.Errorf("failed to create submit request: %w", err)
	}
	submitReq.Header.Set("Content-Type", "application/json")
	submitReq.Header.Set("Accept", "application/json")

	submitResp, err := c.httpClient.Do(submitReq)
	if err != nil {
		fmt.Printf("[Kratos] PerformLogin: submit network error: %v\n", err)
		return nil, fmt.Errorf("failed to submit login: %w", err)
	}
	defer submitResp.Body.Close()

	submitRespBody, _ := io.ReadAll(submitResp.Body)
	fmt.Printf("[Kratos] PerformLogin: submit response status=%d bodyLen=%d\n", submitResp.StatusCode, len(submitRespBody))

	if submitResp.StatusCode != http.StatusOK {
		// Check if it's a validation error
		var errResp struct {
			Error struct {
				Message string `json:"message"`
			} `json:"error"`
			UI struct {
				Messages []struct {
					Text string `json:"text"`
				} `json:"messages"`
			} `json:"ui"`
		}
		if json.Unmarshal(submitRespBody, &errResp) == nil {
			if errResp.Error.Message != "" {
				return nil, fmt.Errorf("login failed: %s", errResp.Error.Message)
			}
			if len(errResp.UI.Messages) > 0 {
				return nil, fmt.Errorf("login failed: %s", errResp.UI.Messages[0].Text)
			}
		}
		return nil, fmt.Errorf("login failed: status %d: %s", submitResp.StatusCode, string(submitRespBody))
	}

	// Parse the successful response
	var loginResult struct {
		SessionToken string `json:"session_token"`
		Session      struct {
			ID        string `json:"id"`
			ExpiresAt string `json:"expires_at"`
		} `json:"session"`
	}
	if err := json.Unmarshal(submitRespBody, &loginResult); err != nil {
		fmt.Printf("[Kratos] PerformLogin: parse error: %v body=%s\n", err, string(submitRespBody))
		return nil, fmt.Errorf("failed to parse login response: %w", err)
	}

	// Parse expiry time
	var expiresAt int64
	if loginResult.Session.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, loginResult.Session.ExpiresAt); err == nil {
			expiresAt = t.Unix()
		}
	}

	fmt.Printf("[Kratos] PerformLogin: success sessionID=%s tokenLength=%d\n",
		loginResult.Session.ID, len(loginResult.SessionToken))

	return &service.SessionToken{
		Token:     loginResult.SessionToken,
		ExpiresAt: expiresAt,
	}, nil
}

// CreateSessionForIdentity creates a session for an identity using the Kratos admin API.
// This is useful for issuing a session token without the user's password (e.g., after checkout).
func (c *Client) CreateSessionForIdentity(ctx context.Context, identityID string) (*service.SessionToken, error) {
	url := fmt.Sprintf("%s/admin/identities/%s/sessions", c.adminURL, identityID)
	fmt.Printf("[Kratos] CreateSessionForIdentity: creating session for identity %s at %s\n", identityID, url)

	req, err := http.NewRequestWithContext(ctx, "POST", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		fmt.Printf("[Kratos] CreateSessionForIdentity: network error: %v\n", err)
		return nil, fmt.Errorf("failed to create session: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	fmt.Printf("[Kratos] CreateSessionForIdentity: response status=%d bodyLen=%d\n", resp.StatusCode, len(body))

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to create session: status %d: %s", resp.StatusCode, string(body))
	}

	var result struct {
		SessionToken string `json:"session_token"`
		Session      struct {
			ID        string `json:"id"`
			ExpiresAt string `json:"expires_at"`
		} `json:"session"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		fmt.Printf("[Kratos] CreateSessionForIdentity: parse error: %v body=%s\n", err, string(body))
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}

	var expiresAt int64
	if result.Session.ExpiresAt != "" {
		if t, err := time.Parse(time.RFC3339, result.Session.ExpiresAt); err == nil {
			expiresAt = t.Unix()
		}
	}

	fmt.Printf("[Kratos] CreateSessionForIdentity: success sessionID=%s tokenLength=%d\n",
		result.Session.ID, len(result.SessionToken))

	return &service.SessionToken{
		Token:     result.SessionToken,
		ExpiresAt: expiresAt,
	}, nil
}

// ValidateSession validates a session and returns the session info.
// Supports both:
// - Browser flow: ory_kratos_session cookie (passed directly to Kratos)
// - API flow: ory_session_token cookie (sent as Authorization: Bearer header)
func (c *Client) ValidateSession(ctx context.Context, cookies []*http.Cookie) (*service.Session, error) {
	url := fmt.Sprintf("%s/sessions/whoami", c.publicURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Check for API flow token first (ory_session_token)
	var sessionToken string
	var browserCookies []*http.Cookie
	for _, cookie := range cookies {
		if cookie.Name == "ory_session_token" {
			sessionToken = cookie.Value
		} else {
			browserCookies = append(browserCookies, cookie)
		}
	}

	// If we have an API flow token, use it as Bearer token
	if sessionToken != "" {
		req.Header.Set("Authorization", "Bearer "+sessionToken)
	} else {
		// Otherwise, add browser flow cookies to request
		for _, cookie := range browserCookies {
			req.AddCookie(cookie)
		}
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to call Kratos: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, nil // No valid session
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Kratos returned status %d", resp.StatusCode)
	}

	var kratosSession kratosSessionResponse
	if err := json.NewDecoder(resp.Body).Decode(&kratosSession); err != nil {
		return nil, fmt.Errorf("failed to parse session: %w", err)
	}

	identityID, err := uuid.Parse(kratosSession.Identity.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to parse identity ID: %w", err)
	}

	return &service.Session{
		ID:         kratosSession.ID,
		IdentityID: identityID,
		Email:      kratosSession.Identity.Traits.Email,
		FirstName:  kratosSession.Identity.Traits.Name.First,
		LastName:   kratosSession.Identity.Traits.Name.Last,
		Active:     kratosSession.Active,
	}, nil
}
