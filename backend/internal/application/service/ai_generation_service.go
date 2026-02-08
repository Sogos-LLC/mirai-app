package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// AIProviderFactory creates AIProvider instances per-tenant.
// Used for synchronous image generation only.
type AIProviderFactory interface {
	GetProvider(ctx context.Context, tenantID uuid.UUID) (service.AIProvider, error)
}

// CourseCreationInput is the input for the unified Python CourseCreationWorkflow.
type CourseCreationInput struct {
	JobID                  string   `json:"job_id"`
	TenantID               string   `json:"tenant_id"`
	CourseID               string   `json:"course_id"`
	UserID                 string   `json:"user_id"`
	Topic                  string   `json:"topic"`
	Audience               string   `json:"audience"`
	UseContext             string   `json:"use_context"`
	EnableInternalKnowledge bool    `json:"enable_internal_knowledge"`
	SelectedTeamDocIDs     []string `json:"selected_team_doc_ids"`
	SelectedGlobalDocIDs   []string `json:"selected_global_doc_ids"`
	EnableWebResearch      bool     `json:"enable_web_research"`
	StrictKnowledgeOnly    bool     `json:"strict_knowledge_only"`

	// Wizard-generated data (present when multi-step wizard was used)
	DesiredOutcomes     string                       `json:"desired_outcomes,omitempty"`
	ImprovedTitle       string                       `json:"improved_title,omitempty"`
	Description         string                       `json:"description,omitempty"`
	SMEPersonas         []entity.WizardSMEPersona    `json:"sme_personas,omitempty"`
	SelectedSMEIDs      []string                     `json:"selected_sme_ids,omitempty"`
	AudiencePersonas    []entity.WizardAudiencePersona `json:"audience_personas,omitempty"`
	SelectedAudienceIDs []string                     `json:"selected_audience_ids,omitempty"`
	SelectedTone        *entity.WizardToneOption      `json:"selected_tone,omitempty"`
	AdditionalContext   string                       `json:"additional_context,omitempty"`
}

// WorkflowStarter starts Temporal workflows for async processing.
type WorkflowStarter interface {
	StartCourseCreation(ctx context.Context, input interface{}) (string, error)
	StartCourseExport(ctx context.Context, exportID, tenantID string) (string, error)
	QueryWorkflow(ctx context.Context, workflowID, queryType string) (map[string]interface{}, error)
	UpdateWorkflow(ctx context.Context, workflowID, updateName string, args interface{}) error
	CancelWorkflow(ctx context.Context, workflowID, runID string) error
	IsWorkflowRunning(ctx context.Context, workflowID string) (bool, error)
	ExecuteWizardStep(ctx context.Context, stepType string, input interface{}) (map[string]interface{}, error)
}

// ImageStorage abstracts image storage operations.
type ImageStorage interface {
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
}

// KnowledgeSettingsProvider provides access to tenant knowledge settings.
type KnowledgeSettingsProvider interface {
	GetKnowledgeSettingsByTenantID(ctx context.Context, tenantID uuid.UUID) (*entity.TenantKnowledgeSettings, error)
}

// AIGenerationService handles AI-powered content generation.
// All course content is stored in MinIO - no PostgreSQL tables for outlines/lessons.
//
// Methods are split across files for maintainability:
//   - ai_generation_service.go: struct, constructor, setters (this file)
//   - job_orchestrator.go:      job creation, workflow triggering, lifecycle
//   - content_editor.go:        synchronous content CRUD operations
type AIGenerationService struct {
	userRepo                 repository.UserRepository
	jobRepo                  repository.GenerationJobRepository
	aiSettingsRepo           repository.TenantAISettingsRepository
	aiProviderFactory        AIProviderFactory // Used for image generation
	workflowStarter          WorkflowStarter
	imageStorage             ImageStorage
	contentStorage           *storage.TenantAwareStorage
	knowledgeSettingsProvider KnowledgeSettingsProvider // For tenant knowledge settings
	logger                   service.Logger
}

// NewAIGenerationService creates a new AI generation service.
func NewAIGenerationService(
	userRepo repository.UserRepository,
	jobRepo repository.GenerationJobRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	aiProviderFactory AIProviderFactory,
	workflowStarter WorkflowStarter,
	imageStorage ImageStorage,
	contentStorage *storage.TenantAwareStorage,
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:          userRepo,
		jobRepo:           jobRepo,
		aiSettingsRepo:    aiSettingsRepo,
		aiProviderFactory: aiProviderFactory,
		workflowStarter:   workflowStarter,
		imageStorage:      imageStorage,
		contentStorage:    contentStorage,
		logger:            logger,
	}
}

// SetKnowledgeSettingsProvider sets the provider for tenant knowledge settings.
func (s *AIGenerationService) SetKnowledgeSettingsProvider(provider KnowledgeSettingsProvider) {
	s.knowledgeSettingsProvider = provider
}
