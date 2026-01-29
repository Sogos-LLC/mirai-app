package twenty

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

// Client implements service.CRMProvider using Twenty CRM GraphQL API.
type Client struct {
	apiURL     string
	apiKey     string
	httpClient *http.Client
}

// NewClient creates a new Twenty CRM client.
func NewClient(apiURL, apiKey string) service.CRMProvider {
	return &Client{
		apiURL: strings.TrimSuffix(apiURL, "/") + "/graphql",
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// FindOrCreateContact finds an existing contact by email or creates a new one.
func (c *Client) FindOrCreateContact(ctx context.Context, email, firstName, lastName string) (string, error) {
	// First, try to find existing person by email
	personID, err := c.findPersonByEmail(ctx, email)
	if err != nil {
		return "", fmt.Errorf("failed to search for person: %w", err)
	}
	if personID != "" {
		return personID, nil
	}

	// Create new person
	personID, err = c.createPerson(ctx, email, firstName, lastName)
	if err != nil {
		return "", fmt.Errorf("failed to create person: %w", err)
	}

	return personID, nil
}

// CreateFeedback creates a Feedback custom object linked to a person.
func (c *Client) CreateFeedback(ctx context.Context, req service.CreateFeedbackRequest) error {
	query := `
		mutation CreateFeedback($input: FeedbackCreateInput!) {
			createFeedback(data: $input) {
				id
			}
		}
	`

	// Generate a meaningful name from category and content preview
	name := generateFeedbackName(req.Category, req.Content)

	variables := map[string]any{
		"input": map[string]any{
			"name":        name,
			"personId":    req.PersonID,
			"category":    req.Category,
			"content":     req.Content,
			"pagePath":    req.PagePath,
			"featureArea": req.FeatureArea,
			"appVersion":  req.AppVersion,
			"userAgent":   req.UserAgent,
			"status":      "NEW",
		},
	}

	var result struct {
		Data struct {
			CreateFeedback struct {
				ID string `json:"id"`
			} `json:"createFeedback"`
		} `json:"data"`
		Errors []graphQLError `json:"errors"`
	}

	if err := c.executeGraphQL(ctx, query, variables, &result); err != nil {
		return fmt.Errorf("failed to create feedback: %w", err)
	}

	if len(result.Errors) > 0 {
		return fmt.Errorf("GraphQL error: %s", result.Errors[0].Message)
	}

	return nil
}

// findPersonByEmail searches for a person by email address.
func (c *Client) findPersonByEmail(ctx context.Context, email string) (string, error) {
	query := `
		query FindPerson($filter: PersonFilterInput) {
			people(filter: $filter) {
				edges {
					node {
						id
					}
				}
			}
		}
	`

	variables := map[string]any{
		"filter": map[string]any{
			"emails": map[string]any{
				"primaryEmail": map[string]any{
					"ilike": email,
				},
			},
		},
	}

	var result struct {
		Data struct {
			People struct {
				Edges []struct {
					Node struct {
						ID string `json:"id"`
					} `json:"node"`
				} `json:"edges"`
			} `json:"people"`
		} `json:"data"`
		Errors []graphQLError `json:"errors"`
	}

	if err := c.executeGraphQL(ctx, query, variables, &result); err != nil {
		return "", err
	}

	if len(result.Errors) > 0 {
		return "", fmt.Errorf("GraphQL error: %s", result.Errors[0].Message)
	}

	if len(result.Data.People.Edges) > 0 {
		return result.Data.People.Edges[0].Node.ID, nil
	}

	return "", nil
}

// createPerson creates a new person in Twenty CRM.
func (c *Client) createPerson(ctx context.Context, email, firstName, lastName string) (string, error) {
	query := `
		mutation CreatePerson($input: PersonCreateInput!) {
			createPerson(data: $input) {
				id
			}
		}
	`

	variables := map[string]any{
		"input": map[string]any{
			"name": map[string]any{
				"firstName": firstName,
				"lastName":  lastName,
			},
			"emails": map[string]any{
				"primaryEmail": email,
			},
		},
	}

	var result struct {
		Data struct {
			CreatePerson struct {
				ID string `json:"id"`
			} `json:"createPerson"`
		} `json:"data"`
		Errors []graphQLError `json:"errors"`
	}

	if err := c.executeGraphQL(ctx, query, variables, &result); err != nil {
		return "", err
	}

	if len(result.Errors) > 0 {
		return "", fmt.Errorf("GraphQL error: %s", result.Errors[0].Message)
	}

	return result.Data.CreatePerson.ID, nil
}

// executeGraphQL sends a GraphQL request to Twenty CRM.
func (c *Client) executeGraphQL(ctx context.Context, query string, variables map[string]any, result any) error {
	reqBody := map[string]any{
		"query":     query,
		"variables": variables,
	}

	jsonBody, err := json.Marshal(reqBody)
	if err != nil {
		return fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL, bytes.NewReader(jsonBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status %d: %s", resp.StatusCode, string(body))
	}

	if err := json.Unmarshal(body, result); err != nil {
		return fmt.Errorf("failed to unmarshal response: %w", err)
	}

	return nil
}

// graphQLError represents a GraphQL error response.
type graphQLError struct {
	Message string `json:"message"`
}

// generateFeedbackName creates a display name from category and content.
func generateFeedbackName(category, content string) string {
	// Map category to readable label
	label := "Feedback"
	switch category {
	case "BUG":
		label = "Bug Report"
	case "FEATURE_REQUEST":
		label = "Feature Request"
	case "GENERAL":
		label = "General Feedback"
	case "COMPLAINT":
		label = "Complaint"
	}

	// Truncate content to first 40 chars for preview
	preview := content
	if len(preview) > 40 {
		preview = preview[:40] + "..."
	}

	return fmt.Sprintf("%s: %s", label, preview)
}
