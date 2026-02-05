package service

import (
	"context"
	"time"

	"github.com/google/uuid"

	"github.com/sogos/mirai-backend/internal/application/service/generation"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// AIProviderFactory creates AIProvider instances per-tenant.
type AIProviderFactory interface {
	GetProvider(ctx context.Context, tenantID uuid.UUID) (service.AIProvider, error)
}

// JobNotifier sends notifications about generation job status changes.
type JobNotifier interface {
	NotifyJobProgress(ctx context.Context, userID uuid.UUID, jobID uuid.UUID, jobType string, status string, progress int) error
}

// CourseCompletionNotifier sends notifications when full course generation completes.
type CourseCompletionNotifier interface {
	NotifyCourseComplete(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string) error
	NotifyCourseFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// OutlineCompletionNotifier sends notifications when outline generation completes.
type OutlineCompletionNotifier interface {
	NotifyOutlineReady(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, sectionCount, lessonCount int) error
	NotifyOutlineFailed(ctx context.Context, userID uuid.UUID, courseID uuid.UUID, courseTitle string, errorMsg string) error
}

// TaskEnqueuer enqueues background tasks for processing.
type TaskEnqueuer interface {
	EnqueueAIGeneration(jobID, jobType string) error
}

// ImageStorage abstracts image storage operations.
type ImageStorage interface {
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
	GenerateDownloadURL(ctx context.Context, path string, expiry time.Duration) (string, error)
}

// JobEventPublisher publishes real-time job events via pub/sub.
type JobEventPublisher interface {
	PublishJobEvent(ctx context.Context, userID uuid.UUID, eventType string, job *entity.GenerationJob) error
}

// KnowledgeSearcher provides RAG search capabilities for internal data only mode.
type KnowledgeSearcher interface {
	SearchKnowledge(ctx context.Context, courseID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.KnowledgeSource, error)
}

// TeamKnowledgeSearcher provides RAG search capabilities for team-level knowledge.
type TeamKnowledgeSearcher interface {
	SearchByTeam(ctx context.Context, teamID uuid.UUID, query string, topK int) ([]*entity.RetrievedChunk, error)
	GetReadyByTeam(ctx context.Context, teamID uuid.UUID) ([]*entity.KnowledgeSource, error)
}

// TeamResolver resolves the team for a tenant.
type TeamResolver interface {
	GetTeamByTenant(ctx context.Context, tenantID uuid.UUID) (*entity.Team, error)
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
//   - job_orchestrator.go:      job creation, routing, processing, lifecycle
//   - content_editor.go:        synchronous content CRUD operations
type AIGenerationService struct {
	userRepo                 repository.UserRepository
	jobRepo                  repository.GenerationJobRepository
	aiSettingsRepo           repository.TenantAISettingsRepository
	aiProviderFactory        AIProviderFactory
	notifier                 JobNotifier
	completionNotifier       CourseCompletionNotifier
	outlineNotifier          OutlineCompletionNotifier
	taskEnqueuer             TaskEnqueuer
	imageStorage             ImageStorage
	contentStorage           *storage.TenantAwareStorage
	jobEventPublisher        JobEventPublisher
	knowledgeSearcher        KnowledgeSearcher         // For course-level RAG queries
	teamKnowledgeSearcher    TeamKnowledgeSearcher     // For team-level RAG queries
	teamResolver             TeamResolver              // Resolves team for tenant
	knowledgeSettingsProvider KnowledgeSettingsProvider // For tenant knowledge settings
	ragPipeline              *StagedRAGPipeline        // Composable RAG retrieval with provenance
	planHandler              *generation.PlanHandler   // Handles course planning jobs
	logger                   service.Logger
}

// NewAIGenerationService creates a new AI generation service.
func NewAIGenerationService(
	userRepo repository.UserRepository,
	jobRepo repository.GenerationJobRepository,
	aiSettingsRepo repository.TenantAISettingsRepository,
	aiProviderFactory AIProviderFactory,
	notifier JobNotifier,
	completionNotifier CourseCompletionNotifier,
	outlineNotifier OutlineCompletionNotifier,
	taskEnqueuer TaskEnqueuer,
	imageStorage ImageStorage,
	contentStorage *storage.TenantAwareStorage,
	logger service.Logger,
) *AIGenerationService {
	return &AIGenerationService{
		userRepo:           userRepo,
		jobRepo:            jobRepo,
		aiSettingsRepo:     aiSettingsRepo,
		aiProviderFactory:  aiProviderFactory,
		notifier:           notifier,
		completionNotifier: completionNotifier,
		outlineNotifier:    outlineNotifier,
		taskEnqueuer:       taskEnqueuer,
		imageStorage:       imageStorage,
		contentStorage:     contentStorage,
		logger:             logger,
	}
}

// SetKnowledgeSearcher sets the knowledge searcher for Internal Data Only mode.
func (s *AIGenerationService) SetKnowledgeSearcher(searcher KnowledgeSearcher) {
	s.knowledgeSearcher = searcher
}

// SetTeamKnowledgeSearcher sets the team knowledge searcher for team-level RAG.
func (s *AIGenerationService) SetTeamKnowledgeSearcher(searcher TeamKnowledgeSearcher) {
	s.teamKnowledgeSearcher = searcher
}

// SetTeamResolver sets the team resolver for looking up team by tenant.
func (s *AIGenerationService) SetTeamResolver(resolver TeamResolver) {
	s.teamResolver = resolver
}

// SetJobEventPublisher sets the optional job event publisher for real-time streaming.
func (s *AIGenerationService) SetJobEventPublisher(publisher JobEventPublisher) {
	s.jobEventPublisher = publisher
}

// SetKnowledgeSettingsProvider sets the provider for tenant knowledge settings.
func (s *AIGenerationService) SetKnowledgeSettingsProvider(provider KnowledgeSettingsProvider) {
	s.knowledgeSettingsProvider = provider
}

// SetRAGPipeline sets the composable RAG pipeline for knowledge retrieval.
func (s *AIGenerationService) SetRAGPipeline(pipeline *StagedRAGPipeline) {
	s.ragPipeline = pipeline
}

// SetPlanHandler sets the plan handler for course planning jobs.
func (s *AIGenerationService) SetPlanHandler(handler *generation.PlanHandler) {
	s.planHandler = handler
}
