package generation

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// ImageStorage abstracts image storage operations.
type ImageStorage interface {
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
}

// ImageHandler processes image generation for components.
type ImageHandler struct {
	aiProviderFactory AIProviderFactory
	contentStorage    ContentStorage
	imageStorage      ImageStorage
	logger            Logger
}

// NewImageHandler creates a new image handler.
func NewImageHandler(
	aiProviderFactory AIProviderFactory,
	contentStorage ContentStorage,
	imageStorage ImageStorage,
	logger Logger,
) *ImageHandler {
	return &ImageHandler{
		aiProviderFactory: aiProviderFactory,
		contentStorage:    contentStorage,
		imageStorage:      imageStorage,
		logger:            logger,
	}
}

// GenerateImageRequest contains the inputs for component image generation.
type GenerateImageRequest struct {
	TenantID    uuid.UUID
	CourseID    uuid.UUID
	LessonID    uuid.UUID
	ComponentID uuid.UUID
	Prompt      string
	AspectRatio string
}

// GenerateImageResult contains the result of image generation.
type GenerateImageResult struct {
	ImageURL  string
	Component *entity.LessonComponent
}

// GenerateImage generates an image for a component and updates it in storage.
func (h *ImageHandler) GenerateImage(ctx context.Context, req GenerateImageRequest) (*GenerateImageResult, error) {
	log := h.logger.With("componentID", req.ComponentID)

	// Read course content
	var content S3CourseContent
	if err := h.contentStorage.ReadCourseContent(ctx, req.TenantID, req.CourseID, &content); err != nil {
		log.Error("failed to read course content", "error", err)
		return nil, fmt.Errorf("course content not found")
	}

	// Find lesson and component
	s3Lesson := FindLesson(&content, req.LessonID.String())
	if s3Lesson == nil {
		return nil, fmt.Errorf("lesson not found")
	}

	var componentIndex int = -1
	for i, comp := range s3Lesson.Components {
		if comp.ID == req.ComponentID.String() {
			componentIndex = i
			break
		}
	}

	if componentIndex < 0 {
		return nil, fmt.Errorf("component not found")
	}

	// Get AI provider
	aiProvider, err := h.aiProviderFactory.GetProvider(ctx, req.TenantID)
	if err != nil {
		return nil, err
	}

	// Generate image
	imageResult, err := aiProvider.GenerateImage(ctx, service.GenerateImageRequest{
		Prompt:      req.Prompt,
		AspectRatio: req.AspectRatio,
	})
	if err != nil {
		return nil, err
	}

	if h.imageStorage == nil {
		return nil, fmt.Errorf("image storage not configured")
	}

	// Store image
	ext := ".png"
	if imageResult.MimeType == "image/jpeg" {
		ext = ".jpg"
	}

	storagePath := fmt.Sprintf("tenants/%s/courses/%s/images/%s-%s%s",
		req.TenantID.String(),
		req.CourseID.String(),
		req.LessonID.String(),
		req.ComponentID.String(),
		ext,
	)

	if err := h.imageStorage.PutContent(ctx, storagePath, imageResult.ImageData, imageResult.MimeType); err != nil {
		return nil, err
	}

	imageURL, err := h.imageStorage.GenerateDownloadURL(ctx, storagePath, 24*time.Hour)
	if err != nil {
		return nil, err
	}

	// Atomically update the component
	var atomicContent S3CourseContent
	var updatedJSON json.RawMessage
	if err := h.contentStorage.UpdateCourseContentAtomic(
		ctx,
		req.TenantID,
		req.CourseID,
		&atomicContent,
		func() error {
			atomicLesson := FindLesson(&atomicContent, req.LessonID.String())
			if atomicLesson == nil {
				return fmt.Errorf("lesson not found")
			}

			var atomicCompIndex int = -1
			for i, comp := range atomicLesson.Components {
				if comp.ID == req.ComponentID.String() {
					atomicCompIndex = i
					break
				}
			}
			if atomicCompIndex < 0 {
				return fmt.Errorf("component not found")
			}

			var imageContent map[string]interface{}
			_ = json.Unmarshal(atomicLesson.Components[atomicCompIndex].ContentJSON, &imageContent)
			if imageContent == nil {
				imageContent = make(map[string]interface{})
			}

			imageContent["storagePath"] = storagePath
			imageContent["url"] = imageURL
			if _, exists := imageContent["image_description"]; !exists {
				imageContent["image_description"] = req.Prompt
			}

			updatedJSON, _ = json.Marshal(imageContent)
			atomicLesson.Components[atomicCompIndex].ContentJSON = updatedJSON
			atomicLesson.Components[atomicCompIndex].UpdatedAt = time.Now()
			return nil
		},
	); err != nil {
		return nil, err
	}

	compID, _ := uuid.Parse(s3Lesson.Components[componentIndex].ID)
	component := &entity.LessonComponent{
		ID:          compID,
		TenantID:    req.TenantID,
		LessonID:    req.LessonID,
		ContentJSON: updatedJSON,
	}

	return &GenerateImageResult{
		ImageURL:  imageURL,
		Component: component,
	}, nil
}

// UpdateComponentsRequest contains the inputs for updating lesson components.
type UpdateComponentsRequest struct {
	TenantID   uuid.UUID
	CourseID   uuid.UUID
	LessonID   uuid.UUID
	Components []UpdateComponentInput
}

// UpdateComponentInput represents a single component update.
type UpdateComponentInput struct {
	ID                   string
	Type                 valueobject.LessonComponentType
	Order                int32
	ContentJSON          json.RawMessage
	LearningObjectiveIDs []string
}

// UpdateComponentsResult contains the updated lesson.
type UpdateComponentsResult struct {
	Lesson *entity.GeneratedLesson
}

// UpdateComponents saves manual edits to lesson components.
func (h *ImageHandler) UpdateComponents(ctx context.Context, req UpdateComponentsRequest) (*UpdateComponentsResult, error) {
	var atomicContent S3CourseContent
	var updatedComponents []LessonComponent
	var s3Lesson *GeneratedLesson

	if err := h.contentStorage.UpdateCourseContentAtomic(
		ctx,
		req.TenantID,
		req.CourseID,
		&atomicContent,
		func() error {
			s3Lesson = FindLesson(&atomicContent, req.LessonID.String())
			if s3Lesson == nil {
				s3Lesson = &GeneratedLesson{
					ID:          req.LessonID.String(),
					Components:  []LessonComponent{},
					GeneratedAt: time.Now(),
				}
			}

			now := time.Now()
			updatedComponents = make([]LessonComponent, len(req.Components))
			for i, input := range req.Components {
				compID := input.ID
				createdAt := now
				if len(input.ID) > 5 && input.ID[:5] == "temp-" {
					compID = uuid.New().String()
				} else {
					for _, existing := range s3Lesson.Components {
						if existing.ID == input.ID {
							createdAt = existing.CreatedAt
							break
						}
					}
				}

				updatedComponents[i] = LessonComponent{
					ID:                   compID,
					Type:                 string(input.Type),
					Order:                input.Order,
					ContentJSON:          input.ContentJSON,
					LearningObjectiveIDs: input.LearningObjectiveIDs,
					CreatedAt:            createdAt,
					UpdatedAt:            now,
				}
			}

			s3Lesson.Components = updatedComponents
			UpsertLesson(&atomicContent, *s3Lesson)
			return nil
		},
	); err != nil {
		return nil, err
	}

	lessonID, _ := uuid.Parse(s3Lesson.ID)
	lesson := &entity.GeneratedLesson{
		ID:          lessonID,
		TenantID:    req.TenantID,
		CourseID:    req.CourseID,
		Title:       s3Lesson.Title,
		GeneratedAt: s3Lesson.GeneratedAt,
		Components:  make([]entity.LessonComponent, len(updatedComponents)),
	}

	for i, comp := range updatedComponents {
		compID, _ := uuid.Parse(comp.ID)
		lesson.Components[i] = entity.LessonComponent{
			ID:          compID,
			TenantID:    req.TenantID,
			LessonID:    lessonID,
			Type:        valueobject.LessonComponentType(comp.Type),
			Position:    comp.Order,
			ContentJSON: comp.ContentJSON,
		}
	}

	return &UpdateComponentsResult{Lesson: lesson}, nil
}
