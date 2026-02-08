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
	embeddingModel  = "gemini-embedding-001"
	embedBatchMax   = 20
	embeddingURL    = "https://generativelanguage.googleapis.com/v1beta/models/" + embeddingModel + ":batchEmbedContents"
)

// EmbeddingClient is a lightweight HTTP client for the Gemini embeddings API.
// It avoids pulling in the full Google GenAI SDK.
type EmbeddingClient struct {
	httpClient *http.Client
}

// NewEmbeddingClient creates a new embedding client.
func NewEmbeddingClient() *EmbeddingClient {
	return &EmbeddingClient{
		httpClient: &http.Client{
			Timeout: 120 * time.Second,
		},
	}
}

// EmbedDocuments generates embeddings for a batch of texts (max 20 per call).
// The caller is responsible for splitting into batches of <=20.
func (c *EmbeddingClient) EmbedDocuments(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	if len(texts) > embedBatchMax {
		return nil, fmt.Errorf("batch size %d exceeds max %d; caller must split", len(texts), embedBatchMax)
	}

	return c.embed(ctx, apiKey, texts, "RETRIEVAL_DOCUMENT")
}

// EmbedQuery generates an embedding for a single search query.
func (c *EmbeddingClient) EmbedQuery(ctx context.Context, apiKey, text string) ([]float32, error) {
	results, err := c.embed(ctx, apiKey, []string{text}, "RETRIEVAL_QUERY")
	if err != nil {
		return nil, err
	}
	if len(results) == 0 {
		return nil, fmt.Errorf("no embedding returned")
	}
	return results[0], nil
}

// embed calls the Gemini batchEmbedContents endpoint.
func (c *EmbeddingClient) embed(ctx context.Context, apiKey string, texts []string, taskType string) ([][]float32, error) {
	type contentPart struct {
		Text string `json:"text"`
	}
	type content struct {
		Parts []contentPart `json:"parts"`
	}
	type embedRequest struct {
		Model    string  `json:"model"`
		Content  content `json:"content"`
		TaskType string  `json:"taskType"`
	}
	type batchRequest struct {
		Requests []embedRequest `json:"requests"`
	}

	requests := make([]embedRequest, len(texts))
	for i, t := range texts {
		requests[i] = embedRequest{
			Model:    "models/" + embeddingModel,
			Content:  content{Parts: []contentPart{{Text: t}}},
			TaskType: taskType,
		}
	}

	body, err := json.Marshal(batchRequest{Requests: requests})
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", embeddingURL+"?key="+apiKey, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embedding API error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Embeddings []struct {
			Values []float64 `json:"values"`
		} `json:"embeddings"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	// Convert float64 (JSON default) to float32 (Qdrant storage format)
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
