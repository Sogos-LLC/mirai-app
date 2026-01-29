package gemini

import (
	"context"
	"fmt"
	"strings"

	"google.golang.org/genai"

	"github.com/sogos/mirai-backend/internal/domain/service"
)

const (
	// ImageGenerationModel is the model used for high-quality image generation.
	// gemini-3-pro-image-preview is optimized for professional image generation.
	ImageGenerationModel = "gemini-3-pro-image-preview"
)

// GenerateImage generates an image from a text prompt using Gemini's image generation.
func (c *Client) GenerateImage(ctx context.Context, req service.GenerateImageRequest) (*service.GenerateImageResult, error) {
	// Check for cancellation at start
	select {
	case <-ctx.Done():
		return nil, fmt.Errorf("image generation cancelled: %w", ctx.Err())
	default:
	}

	// Set default aspect ratio
	aspectRatio := req.AspectRatio
	if aspectRatio == "" {
		aspectRatio = "16:9"
	}

	// Build a descriptive prompt for better image generation
	// Follow best practice: describe the scene, don't just list keywords
	prompt := buildImageGenerationPrompt(req.Prompt)

	// Configure for image generation
	config := &genai.GenerateContentConfig{
		ResponseModalities: []string{"Image"},
		ImageConfig: &genai.ImageConfig{
			AspectRatio: aspectRatio,
			ImageSize:   "1K", // Use 1K for reasonable quality and speed
		},
	}

	result, err := c.generateWithRetry(ctx, "generate image", func() (*genai.GenerateContentResponse, error) {
		return c.client.Models.GenerateContent(
			ctx,
			ImageGenerationModel,
			genai.Text(prompt),
			config,
		)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to generate image: %w", err)
	}

	// Extract image data from response
	imageData, mimeType, err := extractImageFromResponse(result)
	if err != nil {
		return nil, err
	}

	return &service.GenerateImageResult{
		ImageData:  imageData,
		MimeType:   mimeType,
		TokensUsed: extractTokensUsed(result),
	}, nil
}

// buildImageGenerationPrompt enhances the image description for better generation results.
// Following Gemini best practices: describe the scene narratively.
func buildImageGenerationPrompt(description string) string {
	var sb strings.Builder

	sb.WriteString("Create a professional, high-quality educational illustration. ")
	sb.WriteString("The image should be clear, visually appealing, and suitable for an online learning platform. ")
	sb.WriteString("\n\n")
	sb.WriteString("Image description: ")
	sb.WriteString(description)
	sb.WriteString("\n\n")
	sb.WriteString("Style guidelines:\n")
	sb.WriteString("- Clean, modern aesthetic suitable for professional education\n")
	sb.WriteString("- Good contrast and readability\n")
	sb.WriteString("- Avoid text overlays (captions will be added separately)\n")
	sb.WriteString("- Use a consistent, neutral color palette that works in both light and dark themes\n")

	return sb.String()
}

// extractImageFromResponse extracts image bytes and MIME type from Gemini response.
func extractImageFromResponse(result *genai.GenerateContentResponse) ([]byte, string, error) {
	if result == nil || len(result.Candidates) == 0 {
		return nil, "", fmt.Errorf("no response candidates from image generation")
	}

	candidate := result.Candidates[0]
	if candidate.Content == nil || len(candidate.Content.Parts) == 0 {
		return nil, "", fmt.Errorf("no content parts in image generation response")
	}

	// Look for image data in the response parts
	for _, part := range candidate.Content.Parts {
		if part.InlineData != nil && part.InlineData.Data != nil {
			return part.InlineData.Data, part.InlineData.MIMEType, nil
		}
	}

	return nil, "", fmt.Errorf("no image data found in response")
}
