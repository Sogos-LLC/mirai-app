package service

import "context"

// AIProvider abstracts AI generation operations (Gemini, OpenAI, etc.).
// Only image generation remains here; all course content generation
// (wizard, outlines, lessons, components) is handled by the Python AI service
// via Temporal workflows.
type AIProvider interface {
	// GenerateImage generates an image from a text prompt.
	GenerateImage(ctx context.Context, req GenerateImageRequest) (*GenerateImageResult, error)
}

// =============================================================================
// Image Generation Types
// =============================================================================

// GenerateImageRequest contains inputs for image generation.
type GenerateImageRequest struct {
	Prompt      string // Image description/prompt
	AspectRatio string // e.g., "16:9", "1:1", "4:3" - defaults to "16:9"
}

// GenerateImageResult contains the generated image.
type GenerateImageResult struct {
	ImageData  []byte // Raw image bytes (PNG format)
	MimeType   string // MIME type of the image
	TokensUsed int64
}
