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
}

// GenerateOutlineRequest contains inputs for outline generation.
type GenerateOutlineRequest struct {
	CourseTitle       string
	DesiredOutcome    string
	SMEKnowledge      []SMEKnowledgeInput // Knowledge from selected SMEs
	TargetAudience    TargetAudienceInput // Target audience profile
	AdditionalContext string
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
	Title       string
	Description string
	Order       int
	Lessons     []OutlineLessonResult
}

// OutlineLessonResult represents a generated lesson in the outline.
type OutlineLessonResult struct {
	Title                    string
	Description              string
	Order                    int
	EstimatedDurationMinutes int
	LearningObjectives       []string
	IsLastInSection          bool
	IsLastInCourse           bool
}

// GenerateLessonRequest contains inputs for lesson content generation.
type GenerateLessonRequest struct {
	CourseTitle        string
	SectionTitle       string
	LessonTitle        string
	LessonDescription  string
	LearningObjectives []string
	SMEKnowledge       []SMEKnowledgeInput
	TargetAudience     TargetAudienceInput
	PreviousLessonTitle string // For continuity
	NextLessonTitle    string  // For segue
	IsLastInSection    bool
	IsLastInCourse     bool
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
