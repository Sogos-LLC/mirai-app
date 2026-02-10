package service

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/application/workflow"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/infrastructure/auth"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

// ShareContentStarter abstracts starting the share content workflow.
// Defined locally to avoid a circular import with the temporal package.
type ShareContentStarter interface {
	StartShareContent(ctx context.Context, input workflow.ShareContentInput) (string, error)
}

// CourseShareService handles course sharing operations.
type CourseShareService struct {
	shareLinkRepo    repository.ShareLinkRepository
	verificationRepo repository.VerificationCodeRepository
	commentRepo      repository.ReviewCommentRepository
	courseRepo       repository.CourseRepository
	userRepo         repository.UserRepository
	contentStorage   *storage.TenantAwareStorage
	exportService    *CourseExportService
	sessionManager   *auth.ShareSessionManager
	emailProvider    domainservice.EmailProvider
	workflowStarter  ShareContentStarter
	frontendURL      string
}

// NewCourseShareService creates a new course share service.
func NewCourseShareService(
	shareLinkRepo repository.ShareLinkRepository,
	verificationRepo repository.VerificationCodeRepository,
	commentRepo repository.ReviewCommentRepository,
	courseRepo repository.CourseRepository,
	userRepo repository.UserRepository,
	contentStorage *storage.TenantAwareStorage,
	exportService *CourseExportService,
	sessionManager *auth.ShareSessionManager,
	emailProvider domainservice.EmailProvider,
	workflowStarter ShareContentStarter,
	frontendURL string,
) *CourseShareService {
	return &CourseShareService{
		shareLinkRepo:    shareLinkRepo,
		verificationRepo: verificationRepo,
		commentRepo:      commentRepo,
		courseRepo:       courseRepo,
		userRepo:         userRepo,
		contentStorage:   contentStorage,
		exportService:    exportService,
		sessionManager:   sessionManager,
		emailProvider:    emailProvider,
		workflowStarter:  workflowStarter,
		frontendURL:      frontendURL,
	}
}

// CreateShareLink creates a new share link for a course.
// Emails are required — returns InvalidArgument if empty.
// Creates the link with status "pending" and starts a background workflow
// to snapshot content and send emails.
func (s *CourseShareService) CreateShareLink(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID, allowedEmails []string, creatorEmail string) (*entity.ShareLink, string, error) {
	if len(allowedEmails) == 0 {
		return nil, "", fmt.Errorf("at least one reviewer email is required")
	}

	tenantID, ok := tenant.FromContext(ctx)
	if !ok {
		return nil, "", fmt.Errorf("missing tenant context")
	}

	// Resolve kratosID to internal user ID (created_by FK references users.id)
	user, err := s.userRepo.GetByKratosID(ctx, kratosID)
	if err != nil || user == nil {
		return nil, "", fmt.Errorf("failed to resolve user: %w", err)
	}

	token, err := generateSecureShareToken()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate token: %w", err)
	}

	// Look up course title for emails
	course, err := s.courseRepo.GetByID(ctx, courseID)
	if err != nil || course == nil {
		return nil, "", fmt.Errorf("course not found")
	}

	link := &entity.ShareLink{
		TenantID:      tenantID,
		CourseID:      courseID,
		CreatedBy:     user.ID,
		Token:         token,
		AllowedEmails: allowedEmails,
		Status:        "pending",
	}

	if err := s.shareLinkRepo.Create(ctx, link); err != nil {
		return nil, "", fmt.Errorf("failed to create share link: %w", err)
	}

	shareURL := fmt.Sprintf("%s/shared/%s", s.frontendURL, token)

	// Start background workflow to snapshot content + send emails
	if s.workflowStarter != nil {
		// Use email prefix as creator name fallback
		creatorName := creatorEmail
		if idx := strings.Index(creatorEmail, "@"); idx > 0 {
			creatorName = creatorEmail[:idx]
		}

		_, err := s.workflowStarter.StartShareContent(ctx, workflow.ShareContentInput{
			ShareLinkID:   link.ID.String(),
			TenantID:      tenantID.String(),
			CourseID:      courseID.String(),
			CreatorEmail:  creatorEmail,
			CreatorName:   creatorName,
			CourseTitle:   course.Title,
			AllowedEmails: allowedEmails,
			ShareURL:      shareURL,
		})
		if err != nil {
			// Non-fatal: link is created, workflow just didn't start
			// Status will remain "pending"
			_ = err
		}
	}

	return link, shareURL, nil
}

// BuildShareURL constructs the public share URL for a given token.
func (s *CourseShareService) BuildShareURL(token string) string {
	return fmt.Sprintf("%s/shared/%s", s.frontendURL, token)
}

// ListShareLinks lists all share links for a course.
func (s *CourseShareService) ListShareLinks(ctx context.Context, courseID uuid.UUID) ([]*entity.ShareLink, error) {
	links, err := s.shareLinkRepo.ListByCourseID(ctx, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to list share links: %w", err)
	}
	return links, nil
}

// UpdateShareLinkEmails updates the allowed emails for a share link.
func (s *CourseShareService) UpdateShareLinkEmails(ctx context.Context, shareLinkID uuid.UUID, emails []string) (*entity.ShareLink, error) {
	link, err := s.shareLinkRepo.UpdateEmails(ctx, shareLinkID, emails)
	if err != nil {
		return nil, fmt.Errorf("failed to update emails: %w", err)
	}
	return link, nil
}

// DeactivateShareLink deactivates a share link.
func (s *CourseShareService) DeactivateShareLink(ctx context.Context, shareLinkID uuid.UUID) error {
	if err := s.shareLinkRepo.Deactivate(ctx, shareLinkID); err != nil {
		return fmt.Errorf("failed to deactivate share link: %w", err)
	}
	return nil
}

// VerifyShareToken checks if a share token is valid and active.
// Returns the link status so the frontend can show "pending" spinner or email form.
func (s *CourseShareService) VerifyShareToken(ctx context.Context, token string) (valid bool, courseTitle string, status string, err error) {
	link, err := s.shareLinkRepo.GetByToken(ctx, normalizeShareToken(token))
	if err != nil {
		return false, "", "", fmt.Errorf("failed to look up token: %w", err)
	}
	if link == nil || !link.IsActive {
		return false, "", "", nil
	}

	// Load course title using tenant context
	tenantCtx := tenant.WithTenantID(ctx, link.TenantID)
	course, err := s.courseRepo.GetByID(tenantCtx, link.CourseID)
	if err != nil || course == nil {
		return false, "", "", nil
	}

	return true, course.Title, link.Status, nil
}

// SendVerificationCode sends a 6-digit code to the email if on the allowed list.
func (s *CourseShareService) SendVerificationCode(ctx context.Context, token, email string) (bool, error) {
	link, err := s.shareLinkRepo.GetByToken(ctx, normalizeShareToken(token))
	if err != nil || link == nil || !link.IsActive {
		return false, nil
	}

	// Check email is in allowed list
	email = strings.ToLower(strings.TrimSpace(email))
	if !s.isEmailAllowed(link, email) {
		return false, nil
	}

	// Generate 6-digit code
	code, err := generateVerificationCode()
	if err != nil {
		return false, fmt.Errorf("failed to generate code: %w", err)
	}

	// Store verification code
	vc := &entity.VerificationCode{
		ShareLinkID: link.ID,
		Email:       email,
		Code:        code,
		ExpiresAt:   time.Now().Add(10 * time.Minute),
	}
	if err := s.verificationRepo.Create(ctx, vc); err != nil {
		return false, fmt.Errorf("failed to store verification code: %w", err)
	}

	// Get course title for email
	tenantCtx := tenant.WithTenantID(ctx, link.TenantID)
	course, err := s.courseRepo.GetByID(tenantCtx, link.CourseID)
	courseTitle := "a course"
	if err == nil && course != nil {
		courseTitle = course.Title
	}

	// Send email
	if err := s.emailProvider.SendShareVerificationCode(ctx, domainservice.SendShareVerificationCodeRequest{
		To:          email,
		Code:        code,
		CourseTitle: courseTitle,
	}); err != nil {
		return false, fmt.Errorf("failed to send verification email: %w", err)
	}

	return true, nil
}

// VerifyEmailCode validates the code and returns a session token.
func (s *CourseShareService) VerifyEmailCode(ctx context.Context, token, email, code string) (sessionToken, courseTitle string, err error) {
	link, err := s.shareLinkRepo.GetByToken(ctx, normalizeShareToken(token))
	if err != nil || link == nil || !link.IsActive {
		return "", "", fmt.Errorf("invalid share link")
	}

	email = strings.ToLower(strings.TrimSpace(email))

	vc, err := s.verificationRepo.Verify(ctx, link.ID, email, code)
	if err != nil {
		return "", "", fmt.Errorf("verification failed: %w", err)
	}
	if vc == nil {
		return "", "", fmt.Errorf("invalid or expired code")
	}

	// Mark as used
	if err := s.verificationRepo.MarkUsed(ctx, vc.ID); err != nil {
		return "", "", fmt.Errorf("failed to mark code as used: %w", err)
	}

	// Create session token
	sessionToken, err = s.sessionManager.CreateToken(link.ID, link.TenantID, link.CourseID, email)
	if err != nil {
		return "", "", fmt.Errorf("failed to create session: %w", err)
	}

	// Get course title
	tenantCtx := tenant.WithTenantID(ctx, link.TenantID)
	course, courseErr := s.courseRepo.GetByID(tenantCtx, link.CourseID)
	if courseErr == nil && course != nil {
		courseTitle = course.Title
	}

	return sessionToken, courseTitle, nil
}

// SharedCourseData is the response structure for GetSharedCourse.
type SharedCourseData struct {
	CourseID       string          `json:"course_id"`
	Title          string          `json:"title"`
	DesiredOutcome string          `json:"desired_outcome"`
	Sections       []SharedSection `json:"sections"`
}

// SharedSection represents a section in shared view.
type SharedSection struct {
	ID      string         `json:"id"`
	Title   string         `json:"title"`
	Lessons []SharedLesson `json:"lessons"`
}

// SharedLesson represents a lesson in shared view.
type SharedLesson struct {
	ID             string `json:"id"`
	Title          string `json:"title"`
	ComponentCount int    `json:"component_count"`
}

// GetSharedCourse returns the course structure for a shared viewer.
func (s *CourseShareService) GetSharedCourse(ctx context.Context, sessionToken string) (*SharedCourseData, error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return nil, fmt.Errorf("invalid session: %w", err)
	}

	tenantCtx := tenant.WithTenantID(ctx, claims.TenantID)
	course, err := s.courseRepo.GetByID(tenantCtx, claims.CourseID)
	if err != nil || course == nil {
		return nil, fmt.Errorf("course not found")
	}

	// Determine content path: prefer snapshot, fall back to live
	contentPath := s.contentStorage.CoursePath(claims.TenantID, claims.CourseID)
	saCtx := tenant.WithSuperAdmin(ctx, true)
	link, linkErr := s.shareLinkRepo.GetByID(saCtx, claims.ShareLinkID)
	if linkErr == nil && link != nil && link.SnapshotPath != "" {
		contentPath = link.SnapshotPath
	}

	// Read S3 content
	var s3Content struct {
		Settings struct {
			DesiredOutcome string `json:"desiredOutcome"`
		} `json:"settings"`
		Content struct {
			Sections []map[string]interface{} `json:"sections"`
		} `json:"content"`
		GeneratedLessons []struct {
			ID              string          `json:"id"`
			OutlineLessonID string          `json:"outlineLessonId"`
			Components      json.RawMessage `json:"components"`
		} `json:"generatedLessons"`
	}
	if err := s.contentStorage.Inner().ReadJSON(ctx, contentPath, &s3Content); err != nil {
		return nil, fmt.Errorf("failed to read content: %w", err)
	}

	// Build lesson component counts keyed by outlineLessonId (what the outline references)
	lessonComponentCounts := make(map[string]int)
	for _, gl := range s3Content.GeneratedLessons {
		var comps []interface{}
		json.Unmarshal(gl.Components, &comps)
		lessonComponentCounts[gl.OutlineLessonID] = len(comps)
	}

	result := &SharedCourseData{
		CourseID:       claims.CourseID.String(),
		Title:          course.Title,
		DesiredOutcome: s3Content.Settings.DesiredOutcome,
	}

	for _, sectionData := range s3Content.Content.Sections {
		sectionID, _ := sectionData["id"].(string)
		sectionTitle, _ := sectionData["title"].(string)

		section := SharedSection{
			ID:    sectionID,
			Title: sectionTitle,
		}

		var lessons []interface{}
		if l, ok := sectionData["lessons"].([]interface{}); ok {
			lessons = l
		}

		for _, lessonRaw := range lessons {
			lessonData, ok := lessonRaw.(map[string]interface{})
			if !ok {
				continue
			}
			lessonID, _ := lessonData["id"].(string)
			lessonTitle, _ := lessonData["title"].(string)

			section.Lessons = append(section.Lessons, SharedLesson{
				ID:             lessonID,
				Title:          lessonTitle,
				ComponentCount: lessonComponentCounts[lessonID],
			})
		}

		result.Sections = append(result.Sections, section)
	}

	return result, nil
}

// LessonComponentData represents a single component in a generated lesson.
type LessonComponentData struct {
	ID          string          `json:"id"`
	Type        string          `json:"type"`
	Order       int             `json:"order"`
	ContentJSON json.RawMessage `json:"contentJson"`
	Alignment   json.RawMessage `json:"alignment,omitempty"`
	Provenance  json.RawMessage `json:"provenance,omitempty"`
	Validated   bool            `json:"validated,omitempty"`
}

// GetSharedLesson returns lesson content and comments for a shared viewer.
// Reads from the snapshot path if available, otherwise falls back to live content.
func (s *CourseShareService) GetSharedLesson(ctx context.Context, sessionToken, lessonID string) (title string, components []LessonComponentData, comments []*entity.ReviewComment, err error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return "", nil, nil, fmt.Errorf("invalid session: %w", err)
	}

	// Determine content path: prefer snapshot, fall back to live
	contentPath := s.contentStorage.CoursePath(claims.TenantID, claims.CourseID)

	// Look up the share link to check for snapshot path (cross-tenant public access)
	saCtx := tenant.WithSuperAdmin(ctx, true)
	link, linkErr := s.shareLinkRepo.GetByID(saCtx, claims.ShareLinkID)
	if linkErr == nil && link != nil && link.SnapshotPath != "" {
		contentPath = link.SnapshotPath
	}

	// Read content
	var s3Content struct {
		GeneratedLessons []struct {
			ID              string                `json:"id"`
			OutlineLessonID string                `json:"outlineLessonId"`
			Components      []LessonComponentData `json:"components"`
		} `json:"generatedLessons"`
		Content struct {
			Sections []map[string]interface{} `json:"sections"`
		} `json:"content"`
	}
	if err := s.contentStorage.Inner().ReadJSON(ctx, contentPath, &s3Content); err != nil {
		return "", nil, nil, fmt.Errorf("failed to read content: %w", err)
	}

	// Find lesson title from outline
	for _, section := range s3Content.Content.Sections {
		if lessons, ok := section["lessons"].([]interface{}); ok {
			for _, lessonRaw := range lessons {
				if ld, ok := lessonRaw.(map[string]interface{}); ok {
					if id, _ := ld["id"].(string); id == lessonID {
						title, _ = ld["title"].(string)
					}
				}
			}
		}
	}

	// Find lesson content by outlineLessonId
	for _, gl := range s3Content.GeneratedLessons {
		if gl.OutlineLessonID == lessonID {
			components = gl.Components
			break
		}
	}

	if components == nil {
		return "", nil, nil, fmt.Errorf("lesson not found")
	}

	// Get comments
	comments, err = s.commentRepo.ListByLesson(ctx, claims.CourseID, lessonID)
	if err != nil {
		return "", nil, nil, fmt.Errorf("failed to load comments: %w", err)
	}

	return title, components, comments, nil
}

// AddReviewComment adds a review comment to a lesson.
func (s *CourseShareService) AddReviewComment(ctx context.Context, sessionToken, lessonID, commentText string) (*entity.ReviewComment, error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return nil, fmt.Errorf("invalid session: %w", err)
	}

	comment := &entity.ReviewComment{
		ShareLinkID:   claims.ShareLinkID,
		CourseID:      claims.CourseID,
		LessonID:      lessonID,
		ReviewerEmail: claims.Email,
		Comment:       commentText,
	}

	if err := s.commentRepo.Create(ctx, comment); err != nil {
		return nil, fmt.Errorf("failed to create comment: %w", err)
	}

	return comment, nil
}

// ListLessonReviewComments lists review comments for a specific lesson.
func (s *CourseShareService) ListLessonReviewComments(ctx context.Context, sessionToken, lessonID string) ([]*entity.ReviewComment, error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return nil, fmt.Errorf("invalid session: %w", err)
	}

	comments, err := s.commentRepo.ListByLesson(ctx, claims.CourseID, lessonID)
	if err != nil {
		return nil, fmt.Errorf("failed to list comments: %w", err)
	}

	return comments, nil
}

// ListCourseReviewComments lists all review comments for a course (owner view).
func (s *CourseShareService) ListCourseReviewComments(ctx context.Context, courseID uuid.UUID) ([]*entity.ReviewComment, error) {
	comments, err := s.commentRepo.ListByCourse(ctx, courseID)
	if err != nil {
		return nil, fmt.Errorf("failed to list comments: %w", err)
	}
	return comments, nil
}

// ExportSharedCoursePDF generates a PDF synchronously for a shared course.
func (s *CourseShareService) ExportSharedCoursePDF(ctx context.Context, sessionToken string) (downloadURL string, err error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return "", fmt.Errorf("invalid session: %w", err)
	}

	tenantCtx := tenant.WithTenantID(ctx, claims.TenantID)

	// Build course data
	courseData, err := s.exportService.BuildCourseDataForTenant(tenantCtx, claims.TenantID, claims.CourseID)
	if err != nil {
		return "", fmt.Errorf("failed to build course data: %w", err)
	}

	// Generate PDF
	result, err := s.exportService.GeneratePDF(*courseData)
	if err != nil {
		return "", fmt.Errorf("failed to generate PDF: %w", err)
	}

	// Upload to S3 as temp file (use tenant-scoped path)
	subpath := fmt.Sprintf("shared-exports/%s/%s.pdf", claims.CourseID.String(), uuid.New().String())
	fullPath := s.contentStorage.BuildPath(claims.TenantID, subpath)
	if err := s.contentStorage.PutContent(tenantCtx, fullPath, result.Data, "application/pdf"); err != nil {
		return "", fmt.Errorf("failed to upload PDF: %w", err)
	}

	// Generate presigned URL (1 hour expiry)
	downloadURL, err = s.contentStorage.GenerateDownloadURL(tenantCtx, claims.TenantID, subpath, 1*time.Hour)
	if err != nil {
		return "", fmt.Errorf("failed to generate download URL: %w", err)
	}

	return downloadURL, nil
}

// normalizeShareToken strips base64 padding from a share token for consistent lookup.
// Tokens were previously generated with padding (=), but padding chars cause issues in URLs.
func normalizeShareToken(token string) string {
	return strings.TrimRight(token, "=")
}

// generateSecureShareToken generates a URL-safe token for share links.
func generateSecureShareToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// generateVerificationCode generates a 6-digit verification code.
func generateVerificationCode() (string, error) {
	max := big.NewInt(1000000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// isEmailAllowed checks if an email is on the allowed list (case-insensitive).
func (s *CourseShareService) isEmailAllowed(link *entity.ShareLink, email string) bool {
	for _, allowed := range link.AllowedEmails {
		if strings.EqualFold(allowed, email) {
			return true
		}
	}
	return false
}
