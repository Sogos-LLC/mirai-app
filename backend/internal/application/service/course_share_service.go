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
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	domainservice "github.com/sogos/mirai-backend/internal/domain/service"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
	"github.com/sogos/mirai-backend/internal/infrastructure/auth"
	"github.com/sogos/mirai-backend/internal/infrastructure/storage"
)

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
		frontendURL:      frontendURL,
	}
}

// CreateShareLink creates a new share link for a course.
func (s *CourseShareService) CreateShareLink(ctx context.Context, kratosID uuid.UUID, courseID uuid.UUID, allowedEmails []string) (*entity.ShareLink, string, error) {
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

	// Ensure allowedEmails is never nil (postgres TEXT[] NOT NULL)
	if allowedEmails == nil {
		allowedEmails = []string{}
	}

	link := &entity.ShareLink{
		TenantID:      tenantID,
		CourseID:      courseID,
		CreatedBy:     user.ID,
		Token:         token,
		AllowedEmails: allowedEmails,
	}

	if err := s.shareLinkRepo.Create(ctx, link); err != nil {
		return nil, "", fmt.Errorf("failed to create share link: %w", err)
	}

	shareURL := fmt.Sprintf("%s/shared/%s", s.frontendURL, token)
	return link, shareURL, nil
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
func (s *CourseShareService) VerifyShareToken(ctx context.Context, token string) (valid bool, courseTitle string, requiresEmail bool, err error) {
	link, err := s.shareLinkRepo.GetByToken(ctx, token)
	if err != nil {
		return false, "", false, fmt.Errorf("failed to look up token: %w", err)
	}
	if link == nil || !link.IsActive {
		return false, "", false, nil
	}

	// Load course title using tenant context
	tenantCtx := tenant.WithTenantID(ctx, link.TenantID)
	course, err := s.courseRepo.GetByID(tenantCtx, link.CourseID)
	if err != nil || course == nil {
		return false, "", false, nil
	}

	requiresEmail = len(link.AllowedEmails) > 0
	return true, course.Title, requiresEmail, nil
}

// SendVerificationCode sends a 6-digit code to the email if on the allowed list.
func (s *CourseShareService) SendVerificationCode(ctx context.Context, token, email string) (bool, error) {
	link, err := s.shareLinkRepo.GetByToken(ctx, token)
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
	link, err := s.shareLinkRepo.GetByToken(ctx, token)
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

	// Read S3 content
	var s3Content struct {
		Settings struct {
			DesiredOutcome string `json:"desiredOutcome"`
		} `json:"settings"`
		Content struct {
			Sections []map[string]interface{} `json:"sections"`
		} `json:"content"`
		GeneratedLessons []struct {
			ID         string          `json:"id"`
			Components json.RawMessage `json:"components"`
		} `json:"generatedLessons"`
	}
	if err := s.contentStorage.ReadCourseContent(tenantCtx, claims.TenantID, claims.CourseID, &s3Content); err != nil {
		return nil, fmt.Errorf("failed to read content: %w", err)
	}

	// Build lesson component counts
	lessonComponentCounts := make(map[string]int)
	for _, gl := range s3Content.GeneratedLessons {
		var comps []interface{}
		json.Unmarshal(gl.Components, &comps)
		lessonComponentCounts[gl.ID] = len(comps)
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

// GetSharedLesson returns lesson content and comments for a shared viewer.
func (s *CourseShareService) GetSharedLesson(ctx context.Context, sessionToken, lessonID string) (title string, contentJSON string, comments []*entity.ReviewComment, err error) {
	claims, err := s.sessionManager.ValidateToken(sessionToken)
	if err != nil {
		return "", "", nil, fmt.Errorf("invalid session: %w", err)
	}

	tenantCtx := tenant.WithTenantID(ctx, claims.TenantID)

	// Read S3 content
	var s3Content struct {
		GeneratedLessons []struct {
			ID         string          `json:"id"`
			Components json.RawMessage `json:"components"`
		} `json:"generatedLessons"`
		Content struct {
			Sections []map[string]interface{} `json:"sections"`
		} `json:"content"`
	}
	if err := s.contentStorage.ReadCourseContent(tenantCtx, claims.TenantID, claims.CourseID, &s3Content); err != nil {
		return "", "", nil, fmt.Errorf("failed to read content: %w", err)
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

	// Find lesson content
	for _, gl := range s3Content.GeneratedLessons {
		if gl.ID == lessonID {
			contentJSON = string(gl.Components)
			break
		}
	}

	if contentJSON == "" {
		return "", "", nil, fmt.Errorf("lesson not found")
	}

	// Get comments
	comments, err = s.commentRepo.ListByLesson(ctx, claims.CourseID, lessonID)
	if err != nil {
		return "", "", nil, fmt.Errorf("failed to load comments: %w", err)
	}

	return title, contentJSON, comments, nil
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

// generateSecureShareToken generates a URL-safe token for share links.
func generateSecureShareToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
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
	if len(link.AllowedEmails) == 0 {
		return true
	}
	for _, allowed := range link.AllowedEmails {
		if strings.EqualFold(allowed, email) {
			return true
		}
	}
	return false
}
