package service

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// IdentityProvider abstracts Kratos identity operations.
type IdentityProvider interface {
	// CreateIdentity creates a new identity with the given credentials.
	CreateIdentity(ctx context.Context, req CreateIdentityRequest) (*Identity, error)

	// CreateIdentityWithHash creates a new identity with a pre-hashed password.
	// This is used when provisioning accounts from pending registrations.
	CreateIdentityWithHash(ctx context.Context, req CreateIdentityWithHashRequest) (*Identity, error)

	// GetIdentity retrieves an identity by its ID.
	GetIdentity(ctx context.Context, identityID string) (*Identity, error)

	// CheckEmailExists checks if an email is already registered.
	CheckEmailExists(ctx context.Context, email string) (bool, error)

	// PerformLogin performs a self-service login and returns a session token.
	// This uses the Kratos API flow (not browser flow) to get a session token.
	PerformLogin(ctx context.Context, email, password string) (*SessionToken, error)

	// CreateSessionForIdentity creates a session for an identity using Kratos admin API.
	// This is useful when we need to issue a session token without the user's password.
	CreateSessionForIdentity(ctx context.Context, identityID string) (*SessionToken, error)

	// ValidateSession validates a session and returns the session info.
	ValidateSession(ctx context.Context, cookies []*http.Cookie) (*Session, error)
}

// CreateIdentityRequest contains the data needed to create a new identity.
type CreateIdentityRequest struct {
	Email     string
	Password  string
	FirstName string
	LastName  string
}

// CreateIdentityWithHashRequest contains data for creating an identity with a pre-hashed password.
type CreateIdentityWithHashRequest struct {
	Email        string
	PasswordHash string // bcrypt hash
	FirstName    string
	LastName     string
}

// Identity represents a Kratos identity.
type Identity struct {
	ID        string
	Email     string
	FirstName string
	LastName  string
}

// Session represents a Kratos session.
type Session struct {
	ID         string
	IdentityID uuid.UUID
	Email      string
	FirstName  string
	LastName   string
	Active     bool
}

// SessionToken contains the token data needed to set a session cookie.
type SessionToken struct {
	Token     string // The session token value
	ExpiresAt int64  // Unix timestamp when the session expires
}

// PaymentProvider abstracts Stripe payment operations.
type PaymentProvider interface {
	// CreateCustomer creates a new Stripe customer.
	CreateCustomer(ctx context.Context, req CreateCustomerRequest) (*Customer, error)

	// CreateCheckoutSession creates a Stripe checkout session.
	CreateCheckoutSession(ctx context.Context, req CheckoutRequest) (*CheckoutSession, error)

	// CreatePortalSession creates a Stripe customer portal session.
	CreatePortalSession(ctx context.Context, customerID, returnURL string) (*PortalSession, error)

	// GetSubscription retrieves a subscription by ID.
	GetSubscription(ctx context.Context, subscriptionID string) (*Subscription, error)

	// UpdateSubscriptionQuantity updates the seat count on a subscription.
	UpdateSubscriptionQuantity(ctx context.Context, subscriptionID string, quantity int) error

	// GetCheckoutSession retrieves a checkout session by ID.
	GetCheckoutSession(ctx context.Context, sessionID string) (*CheckoutSession, error)

	// VerifyWebhook verifies a webhook signature and parses the event.
	VerifyWebhook(payload []byte, signature string) (*WebhookEvent, error)
}

// CreateCustomerRequest contains data for creating a Stripe customer.
type CreateCustomerRequest struct {
	Email     string
	Name      string
	CompanyID uuid.UUID
}

// Customer represents a Stripe customer.
type Customer struct {
	ID string
}

// CheckoutRequest contains data for creating a checkout session.
type CheckoutRequest struct {
	CustomerID uuid.UUID
	CompanyID  uuid.UUID
	Email      string
	Plan       valueobject.Plan
	SeatCount  int
	SuccessURL string
	CancelURL  string
}

// CheckoutSession represents a Stripe checkout session.
type CheckoutSession struct {
	ID             string
	URL            string
	CustomerID     string
	SubscriptionID string
	CompanyID      uuid.UUID
	Plan           valueobject.Plan
}

// PortalSession represents a Stripe customer portal session.
type PortalSession struct {
	URL string
}

// Subscription represents a Stripe subscription.
type Subscription struct {
	ID                string
	CustomerID        string
	Status            valueobject.SubscriptionStatus
	Plan              valueobject.Plan
	CurrentPeriodEnd  int64
	CancelAtPeriodEnd bool
	SeatCount         int
	ItemID            string // First subscription item ID
}

// WebhookEvent represents a parsed Stripe webhook event.
type WebhookEvent struct {
	Type string
	Data WebhookEventData
}

// WebhookEventData contains the data for a webhook event.
type WebhookEventData struct {
	Raw             []byte // Raw JSON for the event object
	CheckoutSession *CheckoutSession
	Subscription    *Subscription
}

// Logger abstracts structured logging operations.
type Logger interface {
	// Debug logs a debug message.
	Debug(msg string, args ...any)

	// Info logs an info message.
	Info(msg string, args ...any)

	// Warn logs a warning message.
	Warn(msg string, args ...any)

	// Error logs an error message.
	Error(msg string, args ...any)

	// With returns a new logger with the given key-value pairs.
	With(args ...any) Logger

	// WithContext returns a new logger with context.
	WithContext(ctx context.Context) Logger
}

// BillingInfo contains the current billing status for a company.
type BillingInfo struct {
	Plan              valueobject.Plan
	Status            valueobject.SubscriptionStatus
	SeatCount         int
	PricePerSeat      int
	CurrentPeriodEnd  *int64
	CancelAtPeriodEnd bool
}

// CompanyWithOwner combines company data with owner info for registration response.
type CompanyWithOwner struct {
	Company *entity.Company
	Owner   *entity.User
}

// EmailProvider abstracts email sending operations.
type EmailProvider interface {
	// SendInvitation sends an invitation email.
	SendInvitation(ctx context.Context, req SendInvitationRequest) error

	// SendWelcome sends a welcome email after account provisioning.
	SendWelcome(ctx context.Context, req SendWelcomeRequest) error

	// SendTaskAssignment sends a task assignment notification email.
	SendTaskAssignment(ctx context.Context, req SendTaskAssignmentRequest) error

	// SendIngestionComplete sends an ingestion completion notification email.
	SendIngestionComplete(ctx context.Context, req SendIngestionCompleteRequest) error

	// SendIngestionFailed sends an ingestion failure notification email.
	SendIngestionFailed(ctx context.Context, req SendIngestionFailedRequest) error

	// SendGenerationComplete sends a generation completion notification email.
	SendGenerationComplete(ctx context.Context, req SendGenerationCompleteRequest) error

	// SendGenerationFailed sends a generation failure notification email.
	SendGenerationFailed(ctx context.Context, req SendGenerationFailedRequest) error

	// SendOutlineReady sends a notification when course outline is ready for review.
	SendOutlineReady(ctx context.Context, req SendOutlineReadyRequest) error

	// SendCourseComplete sends a notification when full course generation is complete.
	SendCourseComplete(ctx context.Context, req SendCourseCompleteRequest) error

	// SendAlert sends an administrative alert email (e.g., for orphaned payments).
	SendAlert(ctx context.Context, req SendAlertRequest) error

	// SendExportReady sends an export ready notification email with download link.
	SendExportReady(ctx context.Context, req SendExportReadyRequest) error
}

// SendInvitationRequest contains data for sending an invitation email.
type SendInvitationRequest struct {
	To          string
	InviterName string
	CompanyName string
	InviteURL   string
	ExpiresAt   string
}

// SendWelcomeRequest contains data for sending a welcome email.
type SendWelcomeRequest struct {
	To          string
	FirstName   string
	CompanyName string
	LoginURL    string
}

// SendTaskAssignmentRequest contains data for task assignment email.
type SendTaskAssignmentRequest struct {
	To           string
	AssigneeName string
	AssignerName string
	TaskTitle    string
	SMEName      string
	TaskURL      string
	DueDate      string
}

// SendIngestionCompleteRequest contains data for ingestion complete email.
type SendIngestionCompleteRequest struct {
	To        string
	UserName  string
	SMEName   string
	TaskTitle string
	SMEURL    string
}

// SendIngestionFailedRequest contains data for ingestion failed email.
type SendIngestionFailedRequest struct {
	To           string
	UserName     string
	SMEName      string
	TaskTitle    string
	ErrorMessage string
	TaskURL      string
}

// SendGenerationCompleteRequest contains data for generation complete email.
type SendGenerationCompleteRequest struct {
	To          string
	UserName    string
	CourseTitle string
	ContentType string // "outline" or "lesson"
	CourseURL   string
}

// SendGenerationFailedRequest contains data for generation failed email.
type SendGenerationFailedRequest struct {
	To           string
	UserName     string
	CourseTitle  string
	ContentType  string // "outline" or "lesson"
	ErrorMessage string
	CourseURL    string
}

// SendOutlineReadyRequest contains data for outline ready notification email.
type SendOutlineReadyRequest struct {
	To           string
	UserName     string
	CourseTitle  string
	SectionCount int
	LessonCount  int
	ReviewURL    string
}

// SendCourseCompleteRequest contains data for full course completion email with summary.
type SendCourseCompleteRequest struct {
	To                   string
	UserName             string
	CourseTitle          string
	SectionCount         int
	LessonCount          int
	TotalDurationMinutes int
	CourseURL            string
}

// SendAlertRequest contains data for administrative alert emails.
type SendAlertRequest struct {
	Subject string
	Body    string
}

// SendExportReadyRequest contains data for export ready notification email.
type SendExportReadyRequest struct {
	To          string
	UserName    string
	CourseTitle string
	Format      string // "SCORM 2004", etc.
	DownloadURL string
	ExpiresIn   string // Human readable expiry like "7 days"
}

// AIProvider abstracts AI generation operations (Gemini, OpenAI, etc.).
type AIProvider interface {
	// GenerateCourseOutline generates a course outline from SME knowledge.
	GenerateCourseOutline(ctx context.Context, req GenerateOutlineRequest) (*GenerateOutlineResult, error)

	// GenerateLessonContent generates content for a single lesson.
	GenerateLessonContent(ctx context.Context, req GenerateLessonRequest) (*GenerateLessonResult, error)

	// RegenerateComponent regenerates a single component with modifications.
	RegenerateComponent(ctx context.Context, req RegenerateComponentRequest) (*RegenerateComponentResult, error)

	// ProcessSMEContent processes and distills knowledge from SME submission.
	ProcessSMEContent(ctx context.Context, req ProcessSMEContentRequest) (*ProcessSMEContentResult, error)

	// TestConnection tests if the API key is valid.
	TestConnection(ctx context.Context) error

	// ==========================================================================
	// Wizard AI Generation Methods (synchronous, fast operations)
	// ==========================================================================

	// GenerateImprovedTitle improves the course name and generates a description.
	GenerateImprovedTitle(ctx context.Context, courseName string) (*GenerateTitleResult, error)

	// GenerateCourseOutcomes generates desired course outcomes from a course name.
	// Used by the "magic wand" button in wizard step 1.
	// If RAG context is provided, it will be used to enhance the outcomes.
	GenerateCourseOutcomes(ctx context.Context, req GenerateOutcomesRequest) (*GenerateOutcomesResult, error)

	// GenerateSMEPersonas generates 3 diverse SME personas based on course topic.
	GenerateSMEPersonas(ctx context.Context, title, description string) (*GenerateSMEPersonasResult, error)

	// GenerateAudiencePersonas generates 3 diverse audience personas.
	GenerateAudiencePersonas(ctx context.Context, req GenerateAudiencePersonasRequest) (*GenerateAudiencePersonasResult, error)

	// GenerateToneOptions generates 3 tone/style options for the course.
	GenerateToneOptions(ctx context.Context, req GenerateToneOptionsRequest) (*GenerateToneOptionsResult, error)

	// GenerateImage generates an image from a text prompt.
	GenerateImage(ctx context.Context, req GenerateImageRequest) (*GenerateImageResult, error)
}

// =============================================================================
// Wizard AI Generation Types
// =============================================================================

// GenerateTitleResult contains the improved title and description.
type GenerateTitleResult struct {
	ImprovedTitle string
	Description   string
	TokensUsed    int64
}

// GenerateOutcomesRequest contains inputs for course outcome generation.
type GenerateOutcomesRequest struct {
	CourseName string
	RAGContext []RAGChunk // Optional RAG context from knowledge sources
}

// RAGChunk represents a chunk of content retrieved from the vector database.
type RAGChunk struct {
	SourceID        string
	SourceName      string
	Content         string
	RelevanceScore  float32
}

// GenerateOutcomesResult contains AI-generated course outcomes.
type GenerateOutcomesResult struct {
	Outcomes   string // Freeform text with bullet points describing what learners will achieve
	Citations  []KnowledgeCitation
	TokensUsed int64
}

// KnowledgeCitation represents a reference to a knowledge source used in generation.
type KnowledgeCitation struct {
	SourceID       string
	SourceName     string
	Excerpt        string
	RelevanceScore float32
}

// WizardSMEPersona represents an SME persona generated by AI for the wizard.
type WizardSMEPersona struct {
	ID          string
	JobTitle    string
	Description string
	Skills      []string
	Voice       string
}

// GenerateSMEPersonasResult contains 3 diverse SME personas.
type GenerateSMEPersonasResult struct {
	Personas   []WizardSMEPersona
	TokensUsed int64
}

// WizardAudiencePersona represents an audience persona generated by AI.
type WizardAudiencePersona struct {
	ID          string
	Name        string
	Role        string
	Description string
	Goals       []string
}

// GenerateAudiencePersonasRequest contains context for audience generation.
type GenerateAudiencePersonasRequest struct {
	Title       string
	Description string
	SMEPersonas []WizardSMEPersona // Selected SME personas for context
}

// GenerateAudiencePersonasResult contains 3 diverse audience personas.
type GenerateAudiencePersonasResult struct {
	Personas   []WizardAudiencePersona
	TokensUsed int64
}

// WizardToneOption represents a tone option generated by AI.
type WizardToneOption struct {
	ID            string
	Name          string
	Description   string
	LevelOfDetail string // brief, moderate, comprehensive
}

// GenerateToneOptionsRequest contains context for tone generation.
type GenerateToneOptionsRequest struct {
	Title           string
	Description     string
	AudiencePersonas []WizardAudiencePersona // Selected audience personas for context
}

// GenerateToneOptionsResult contains 3 tone options.
type GenerateToneOptionsResult struct {
	Options    []WizardToneOption
	TokensUsed int64
}

// GenerateOutlineRequest contains inputs for outline generation.
type GenerateOutlineRequest struct {
	CourseTitle       string
	DesiredOutcome    string
	SMEKnowledge      []SMEKnowledgeInput // Knowledge from selected SMEs
	TargetAudience    TargetAudienceInput // Target audience profile
	AdditionalContext string

	// Internal Data Only mode fields
	InternalDataOnly bool                   // When true, use only RAG content
	DocumentIndices  []DocumentIndexInput   // Structured indices of uploaded documents
	RAGContext       []RAGChunkInput        // Retrieved chunks from knowledge sources

	// Constraints derived from knowledge scope (when available)
	Constraints *CourseConstraintsInput // Hard bounds AI must respect
}

// CourseConstraintsInput provides deterministic bounds for outline generation.
// When provided, the AI MUST generate within these constraints.
type CourseConstraintsInput struct {
	MinSections          int
	MaxSections          int
	MinLessonsPerSection int
	MaxLessonsPerSection int
	MinTotalLessons      int
	MaxTotalLessons      int
	RecommendedDepth     string // "basic", "intermediate", "advanced"
}

// DocumentIndexInput represents a document's structured index for AI navigation.
type DocumentIndexInput struct {
	SourceID             string   // Knowledge source ID
	SourceName           string   // Document name
	Title                string   // Document title
	MainTopics           []string // Major sections/topics
	KeyConcepts          []string // Important terms and concepts
	EstimatedLessonCount int      // How many lessons this content could support
	ContentDepth         string   // "basic", "intermediate", "advanced"
}

// RAGChunkInput represents a retrieved knowledge chunk for content generation.
type RAGChunkInput struct {
	ChunkID         string  // Unique chunk identifier for provenance tracking
	SourceID        string  // Knowledge source ID for citation
	SourceName      string  // Document name for citation
	Content         string  // The actual chunk content
	ChunkIndex      int     // Position in original document
	SimilarityScore float32 // Relevance score from vector search
	Scope           string  // Source scope: "course", "team", or "global"
}

// SMEKnowledgeInput represents knowledge from an SME.
type SMEKnowledgeInput struct {
	SMEName    string
	Domain     string
	Summary    string
	Chunks     []string // Knowledge chunks
	Keywords   []string // Combined keywords
}

// TargetAudienceInput represents the target audience profile.
type TargetAudienceInput struct {
	Role              string
	ExperienceLevel   string
	LearningGoals     []string
	Prerequisites     []string
	Challenges        []string
	Motivations       []string
	IndustryContext   string
	TypicalBackground string
}

// GenerateOutlineResult contains the generated outline.
type GenerateOutlineResult struct {
	Sections    []OutlineSectionResult
	TokensUsed  int64
}

// OutlineSectionResult represents a generated section.
type OutlineSectionResult struct {
	Title          string
	Description    string
	Order          int
	Lessons        []OutlineLessonResult
	IsFirstSection bool // First section in course
	IsLastSection  bool // Last section in course

	// Section metadata for curriculum planning
	Level                string   // Learning level: "introduce", "develop", "master"
	Intent               string   // Primary intent: "teach", "assess", "reinforce"
	Emphasis             string   // Relative importance: "low", "medium", "high"
	MappedOutcomeIndices []int    // Indices of course outcomes this section addresses
	GroundingScore       float32  // How grounded in knowledge sources (0.0-1.0)
	ContributingChunkIDs []string // IDs of RAG chunks that informed this section
}

// OutlineLessonResult represents a generated lesson in the outline.
type OutlineLessonResult struct {
	Title                    string
	Description              string
	Order                    int
	EstimatedDurationMinutes int
	LearningObjectives       []string
	IsFirstInSection         bool // First lesson in section
	IsLastInSection          bool // Last lesson in section
	IsFirstInCourse          bool // First lesson in entire course
	IsLastInCourse           bool // Last lesson in entire course

	// Grounding (inherited from section at outline time, refined during lesson generation)
	GroundingScore float32 // How grounded in knowledge sources (0.0-1.0)
}

// GenerateLessonRequest contains inputs for lesson content generation.
type GenerateLessonRequest struct {
	// Course context
	CourseTitle       string
	CourseDescription string
	CourseOutline     []OutlineSectionSummary // Full outline for context

	// Section context
	SectionTitle       string
	SectionDescription string
	SectionOrder       int
	IsFirstSection     bool
	IsLastSection      bool

	// Lesson context
	LessonTitle        string
	LessonDescription  string
	LessonOrder        int // Order within section
	LearningObjectives []string

	// Position flags
	IsFirstInSection bool // First lesson in this section
	IsLastInSection  bool // Last lesson in this section
	IsFirstInCourse  bool // First lesson in entire course
	IsLastInCourse   bool // Last lesson in entire course

	// Navigation context for segues
	PreviousLessonTitle   string // Previous lesson title
	PreviousLessonSummary string // Summary of previous lesson content
	NextLessonTitle       string // Next lesson title
	NextSectionTitle      string // Next section title (for section transitions)

	// Previously generated content in this section (for context building)
	PreviousLessonsInSection []GeneratedLessonSummary

	// Knowledge inputs
	SMEKnowledge   []SMEKnowledgeInput
	TargetAudience TargetAudienceInput

	// Additional user context for content generation
	AdditionalContext string

	// Internal Data Only mode fields
	InternalDataOnly bool            // When true, use only RAG content
	RAGContext       []RAGChunkInput // Retrieved chunks from knowledge sources
}

// OutlineSectionSummary provides outline context for lesson generation.
type OutlineSectionSummary struct {
	Title       string
	Description string
	Order       int
	LessonCount int
	Lessons     []OutlineLessonSummary
}

// OutlineLessonSummary provides lesson info within outline context.
type OutlineLessonSummary struct {
	Title              string
	Description        string
	Order              int
	LearningObjectives []string
}

// GeneratedLessonSummary provides summary of previously generated content.
type GeneratedLessonSummary struct {
	Title           string
	ComponentCount  int
	KeyPoints       []string // Main points covered (extracted from text components)
	SegueText       string   // How this lesson transitioned to the next
}

// GenerateLessonResult contains the generated lesson content.
type GenerateLessonResult struct {
	Components []LessonComponentResult
	SegueText  string // Transition to next lesson
	TokensUsed int64
}

// LessonComponentResult represents a generated component.
type LessonComponentResult struct {
	Type        string // text, heading, image, quiz
	Order       int
	ContentJSON string // JSON-encoded content based on type
}

// RegenerateComponentRequest contains inputs for component regeneration.
type RegenerateComponentRequest struct {
	ComponentType       string
	CurrentContentJSON  string
	ModificationPrompt  string
	LessonContext       string
	TargetAudience      TargetAudienceInput
}

// RegenerateComponentResult contains the regenerated component.
type RegenerateComponentResult struct {
	ContentJSON string
	TokensUsed  int64
}

// ProcessSMEContentRequest contains inputs for SME content processing.
type ProcessSMEContentRequest struct {
	SMEName       string
	SMEDomain     string
	ExtractedText string // Raw text from uploaded document
}

// ProcessSMEContentResult contains the processed SME knowledge.
type ProcessSMEContentResult struct {
	Summary    string
	Chunks     []SMEChunkResult
	TokensUsed int64
}

// SMEChunkResult represents a distilled knowledge chunk.
type SMEChunkResult struct {
	Content        string
	Topic          string
	Keywords       []string
	RelevanceScore float32
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

// ContentEnhancer abstracts AI content enhancement operations.
type ContentEnhancer interface {
	// SummarizeContent creates a concise summary of the provided content.
	SummarizeContent(ctx context.Context, content string) (string, error)

	// ImproveContent improves content by cleaning up, clarifying, and structuring.
	ImproveContent(ctx context.Context, content string) (string, error)
}

// FileStorage abstracts file storage operations for knowledge sources.
// This interface exposes only the file operations needed by domain services,
// keeping the domain layer decoupled from infrastructure storage details.
type FileStorage interface {
	// Delete removes a file from storage by its path.
	Delete(ctx context.Context, path string) error

	// Exists checks if a file exists at the given path.
	Exists(ctx context.Context, path string) (bool, error)

	// GetContent retrieves the raw content of a file.
	GetContent(ctx context.Context, path string) ([]byte, error)

	// PutContent stores content at the given path.
	PutContent(ctx context.Context, path string, content []byte, contentType string) error
}
