package vectordb

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// QdrantClient provides vector storage capabilities via Qdrant.
type QdrantClient struct {
	httpClient *http.Client
	baseURL    string
}

// NewQdrantClient creates a new Qdrant client.
func NewQdrantClient(baseURL string) *QdrantClient {
	return &QdrantClient{
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // 2 minutes for large document batches
		},
		baseURL: baseURL,
	}
}

// Point represents a vector point in Qdrant.
type Point struct {
	ID      string                 `json:"id"`
	Vector  []float32              `json:"vector"`
	Payload map[string]interface{} `json:"payload"`
}

// SearchResult represents a search result from Qdrant.
type SearchResult struct {
	ID      string                 `json:"id"`
	Score   float32                `json:"score"`
	Payload map[string]interface{} `json:"payload"`
}

// EnsureCollection creates a collection if it doesn't exist.
func (c *QdrantClient) EnsureCollection(ctx context.Context, name string, vectorSize int) error {
	// Check if collection exists
	checkURL := fmt.Sprintf("%s/collections/%s", c.baseURL, name)
	req, err := http.NewRequestWithContext(ctx, "GET", checkURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to check collection: %w", err)
	}
	resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		return nil // Collection exists
	}

	// Create collection
	createPayload := map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     vectorSize,
			"distance": "Cosine",
		},
	}
	bodyBytes, _ := json.Marshal(createPayload)

	createURL := fmt.Sprintf("%s/collections/%s", c.baseURL, name)
	req, err = http.NewRequestWithContext(ctx, "PUT", createURL, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err = c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to create collection: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to create collection: %s", string(body))
	}

	return nil
}

// Upsert inserts or updates points in a collection.
func (c *QdrantClient) Upsert(ctx context.Context, collection string, points []Point) error {
	payload := map[string]interface{}{
		"points": points,
	}
	bodyBytes, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/collections/%s/points", c.baseURL, collection)
	req, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to upsert points: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to upsert points: %s", string(body))
	}

	return nil
}

// Search performs a vector similarity search.
func (c *QdrantClient) Search(ctx context.Context, collection string, vector []float32, limit int, filter map[string]interface{}) ([]SearchResult, error) {
	payload := map[string]interface{}{
		"vector":       vector,
		"limit":        limit,
		"with_payload": true,
	}
	if filter != nil {
		payload["filter"] = filter
	}

	bodyBytes, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/collections/%s/points/search", c.baseURL, collection)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to search: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("search failed: %s", string(body))
	}

	var result struct {
		Result []SearchResult `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return result.Result, nil
}

// DeleteByFilter deletes points matching a filter.
func (c *QdrantClient) DeleteByFilter(ctx context.Context, collection string, filter map[string]interface{}) error {
	payload := map[string]interface{}{
		"filter": filter,
	}
	bodyBytes, _ := json.Marshal(payload)

	url := fmt.Sprintf("%s/collections/%s/points/delete", c.baseURL, collection)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to delete points: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("failed to delete points: %s", string(body))
	}

	return nil
}

// DeleteBySourceID deletes all chunks for a knowledge source.
func (c *QdrantClient) DeleteBySourceID(ctx context.Context, collection string, sourceID uuid.UUID) error {
	filter := map[string]interface{}{
		"must": []map[string]interface{}{
			{
				"key":   "source_id",
				"match": map[string]interface{}{"value": sourceID.String()},
			},
		},
	}
	return c.DeleteByFilter(ctx, collection, filter)
}

// Health checks if Qdrant is healthy.
func (c *QdrantClient) Health(ctx context.Context) error {
	url := fmt.Sprintf("%s/healthz", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to check health: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant unhealthy: status %d", resp.StatusCode)
	}

	return nil
}
