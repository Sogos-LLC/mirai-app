package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	embeddingModel    = "gemini-embedding-001"
	embedBatchSize    = 20
	embedTimeout      = 120 * time.Second
	embedBaseURL      = "https://generativelanguage.googleapis.com/v1beta/models/"
	taskTypeDocument  = "RETRIEVAL_DOCUMENT"
	taskTypeQuery     = "RETRIEVAL_QUERY"
)

// EmbeddingClient is a lightweight Gemini embedding client that calls the REST API directly.
type EmbeddingClient struct {
	httpClient *http.Client
}

// NewEmbeddingClient creates a new embedding client.
func NewEmbeddingClient() *EmbeddingClient {
	return &EmbeddingClient{
		httpClient: &http.Client{Timeout: embedTimeout},
	}
}

// BatchSize returns the maximum number of texts per API call.
func (c *EmbeddingClient) BatchSize() int {
	return embedBatchSize
}

// EmbedDocuments generates embeddings for a list of texts using RETRIEVAL_DOCUMENT task type.
// Texts should be pre-batched by the caller (max 20 per call).
func (c *EmbeddingClient) EmbedDocuments(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	return c.batchEmbed(ctx, apiKey, texts, taskTypeDocument)
}

// EmbedQuery generates an embedding for a single search query using RETRIEVAL_QUERY task type.
func (c *EmbeddingClient) EmbedQuery(ctx context.Context, apiKey, text string) ([]float32, error) {
	results, err := c.batchEmbed(ctx, apiKey, []string{text}, taskTypeQuery)
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}
	return results[0], nil
}

// batchEmbedRequest is the request body for the batchEmbedContents API.
type batchEmbedRequest struct {
	Requests []embedRequest `json:"requests"`
}

type embedRequest struct {
	Model    string       `json:"model"`
	Content  embedContent `json:"content"`
	TaskType string       `json:"taskType"`
}

type embedContent struct {
	Parts []embedPart `json:"parts"`
}

type embedPart struct {
	Text string `json:"text"`
}

// batchEmbedResponse is the response from the batchEmbedContents API.
type batchEmbedResponse struct {
	Embeddings []embeddingValue `json:"embeddings"`
}

type embeddingValue struct {
	Values []float64 `json:"values"` // Gemini returns float64
}

func (c *EmbeddingClient) batchEmbed(ctx context.Context, apiKey string, texts []string, taskType string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	modelRef := "models/" + embeddingModel

	requests := make([]embedRequest, len(texts))
	for i, t := range texts {
		requests[i] = embedRequest{
			Model:    modelRef,
			Content:  embedContent{Parts: []embedPart{{Text: t}}},
			TaskType: taskType,
		}
	}

	body, err := json.Marshal(batchEmbedRequest{Requests: requests})
	if err != nil {
		return nil, fmt.Errorf("marshal embed request: %w", err)
	}

	url := embedBaseURL + embeddingModel + ":batchEmbedContents?key=" + apiKey

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create embed request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embed API call: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embed API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	var result batchEmbedResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode embed response: %w", err)
	}

	// Convert float64 → float32 (Gemini returns float64, Qdrant expects float32)
	embeddings := make([][]float32, len(result.Embeddings))
	for i, emb := range result.Embeddings {
		vec := make([]float32, len(emb.Values))
		for j, v := range emb.Values {
			vec[j] = float32(v)
		}
		embeddings[i] = vec
	}

	return embeddings, nil
}
