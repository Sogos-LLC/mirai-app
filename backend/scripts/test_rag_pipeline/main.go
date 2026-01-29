// Test script for verifying RAG pipeline works end-to-end
// Uses fictional "Moon Flowers in Space" content to prove AI uses internal data
package main

import (
	"context"
	"encoding/json"
	"log"
	"os"
	"strings"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/embedding"
	"github.com/sogos/mirai-backend/internal/infrastructure/external/vectordb"
)

const (
	testSessionID = "test-rag-pipeline-001"
	collectionName = "knowledge_chunks"
)

func main() {
	// Get service URLs from environment or use defaults
	embeddingURL := getEnv("EMBEDDING_URL", "http://localhost:8081")
	qdrantURL := getEnv("QDRANT_URL", "http://localhost:6333")

	log.Printf("Testing RAG Pipeline")
	log.Printf("Embedding URL: %s", embeddingURL)
	log.Printf("Qdrant URL: %s", qdrantURL)

	ctx := context.Background()

	// Initialize clients
	embeddingClient := embedding.NewClient(embeddingURL)
	qdrantClient := vectordb.NewQdrantClient(qdrantURL)

	// Test 1: Embedding service health
	log.Println("\n=== Test 1: Embedding Service Health ===")
	if err := embeddingClient.Health(ctx); err != nil {
		log.Fatalf("Embedding service unhealthy: %v", err)
	}
	log.Println("✓ Embedding service is healthy")

	// Test 2: Qdrant health
	log.Println("\n=== Test 2: Qdrant Health ===")
	if err := qdrantClient.Health(ctx); err != nil {
		log.Fatalf("Qdrant unhealthy: %v", err)
	}
	log.Println("✓ Qdrant is healthy")

	// Test 3: Ensure collection exists
	log.Println("\n=== Test 3: Ensure Collection ===")
	if err := qdrantClient.EnsureCollection(ctx, collectionName, 384); err != nil {
		log.Fatalf("Failed to ensure collection: %v", err)
	}
	log.Println("✓ Collection exists")

	// Test 4: Generate embeddings for test content
	log.Println("\n=== Test 4: Generate Embeddings ===")
	testChunks := []string{
		"The Moon Flower (Selenanthus lunaris) is a bioluminescent plant species discovered in 2089 during the Artemis XVII mission.",
		"Moon Flowers require zero gravity to bloom and produce lunar nectar.",
		"The bioluminescent nectar can only be harvested during the glow phase which occurs exactly 47 hours after the bloom opens.",
		"Substrate: Regolith mixed with 30% processed asteroid minerals. Light cycle: 14.5 Earth hours light, 14.5 hours darkness.",
		"Dr. Helena Vasquez of the Lunar Agricultural Institute first documented the species.",
	}

	embeddings, err := embeddingClient.Embed(ctx, testChunks)
	if err != nil {
		log.Fatalf("Failed to generate embeddings: %v", err)
	}
	log.Printf("✓ Generated %d embeddings (dimension: %d)", len(embeddings), len(embeddings[0]))

	// Test 5: Store vectors in Qdrant
	log.Println("\n=== Test 5: Store Vectors in Qdrant ===")

	// First, delete any existing test data
	_ = qdrantClient.DeleteByFilter(ctx, collectionName, map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "session_id", "match": map[string]interface{}{"value": testSessionID}},
		},
	})

	points := make([]vectordb.Point, len(testChunks))
	for i, chunk := range testChunks {
		points[i] = vectordb.Point{
			ID:     uuid.New().String(),
			Vector: embeddings[i],
			Payload: map[string]interface{}{
				"session_id":   testSessionID,
				"source_id":    "test-source-001",
				"source_name":  "moon_flowers.txt",
				"content":      chunk,
				"chunk_index":  i,
				"tenant_id":    "test-tenant",
			},
		}
	}

	if err := qdrantClient.Upsert(ctx, collectionName, points); err != nil {
		log.Fatalf("Failed to upsert vectors: %v", err)
	}
	log.Printf("✓ Stored %d vectors in Qdrant", len(points))

	// Test 6: Search for Moon Flower content
	log.Println("\n=== Test 6: RAG Search ===")

	queries := []string{
		"How do you harvest lunar nectar?",
		"What are the growth requirements for Moon Flowers?",
		"Who discovered Selenanthus lunaris?",
	}

	for _, query := range queries {
		log.Printf("\nQuery: %q", query)

		queryVector, err := embeddingClient.EmbedSingle(ctx, query)
		if err != nil {
			log.Fatalf("Failed to embed query: %v", err)
		}

		results, err := qdrantClient.Search(ctx, collectionName, queryVector, 3, map[string]interface{}{
			"must": []map[string]interface{}{
				{"key": "session_id", "match": map[string]interface{}{"value": testSessionID}},
			},
		})
		if err != nil {
			log.Fatalf("Failed to search: %v", err)
		}

		log.Printf("Found %d results:", len(results))
		for i, result := range results {
			content := result.Payload["content"].(string)
			if len(content) > 100 {
				content = content[:100] + "..."
			}
			log.Printf("  %d. Score: %.4f - %s", i+1, result.Score, content)
		}
	}

	// Test 7: Verify fictional terms are retrieved
	log.Println("\n=== Test 7: Verify Fictional Terms ===")

	fictionalTerms := []string{
		"Selenanthus lunaris",
		"47 hours",
		"lunar nectar",
		"Dr. Helena Vasquez",
		"Artemis XVII",
		"glow phase",
	}

	// Search for general Moon Flower info
	queryVector, _ := embeddingClient.EmbedSingle(ctx, "Tell me about Moon Flowers and their cultivation")
	results, _ := qdrantClient.Search(ctx, collectionName, queryVector, 5, map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "session_id", "match": map[string]interface{}{"value": testSessionID}},
		},
	})

	// Combine all retrieved content
	var allContent strings.Builder
	for _, r := range results {
		allContent.WriteString(r.Payload["content"].(string))
		allContent.WriteString(" ")
	}
	combinedContent := allContent.String()

	log.Println("Checking if fictional terms are in retrieved content:")
	allFound := true
	for _, term := range fictionalTerms {
		found := strings.Contains(combinedContent, term)
		if found {
			log.Printf("  ✓ Found: %q", term)
		} else {
			log.Printf("  ✗ NOT Found: %q", term)
			allFound = false
		}
	}

	// Clean up test data
	log.Println("\n=== Cleanup ===")
	if err := qdrantClient.DeleteByFilter(ctx, collectionName, map[string]interface{}{
		"must": []map[string]interface{}{
			{"key": "session_id", "match": map[string]interface{}{"value": testSessionID}},
		},
	}); err != nil {
		log.Printf("Warning: Failed to clean up test data: %v", err)
	} else {
		log.Println("✓ Cleaned up test data")
	}

	// Summary
	log.Println("\n=== RAG Pipeline Test Summary ===")
	if allFound {
		log.Println("✓ All tests passed!")
		log.Println("✓ RAG pipeline is working correctly")
		log.Println("✓ Fictional content was stored and retrieved")
		log.Println("")
		log.Println("The system can now use uploaded documents for course generation.")
		os.Exit(0)
	} else {
		log.Println("✗ Some fictional terms were not found in search results")
		log.Println("This may indicate an issue with embedding or search quality")
		os.Exit(1)
	}
}

func getEnv(key, defaultValue string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultValue
}

// Utility for pretty printing JSON
func prettyJSON(v interface{}) string {
	b, _ := json.MarshalIndent(v, "", "  ")
	return string(b)
}
