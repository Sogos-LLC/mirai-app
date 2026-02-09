package sqlc

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	gen "github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/tenant"
)

// ShareLinkRepository implements repository.ShareLinkRepository with sqlc.
type ShareLinkRepository struct {
	db *sql.DB
}

// NewShareLinkRepository creates a new share link repository.
func NewShareLinkRepository(db *sql.DB) repository.ShareLinkRepository {
	return &ShareLinkRepository{db: db}
}

func (r *ShareLinkRepository) Create(ctx context.Context, link *entity.ShareLink) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseShareLink, error) {
		return q.CreateShareLink(ctx, gen.CreateShareLinkParams{
			TenantID:      link.TenantID,
			CourseID:      link.CourseID,
			CreatedBy:     link.CreatedBy,
			Token:         link.Token,
			AllowedEmails: link.AllowedEmails,
		})
	})
	if err != nil {
		return err
	}
	link.ID = result.ID
	link.IsActive = result.IsActive
	link.CreatedAt = result.CreatedAt
	link.UpdatedAt = result.UpdatedAt
	return nil
}

func (r *ShareLinkRepository) GetByToken(ctx context.Context, token string) (*entity.ShareLink, error) {
	// Token lookup is cross-tenant (public access), use superadmin bypass for RLS
	ctx = tenant.WithSuperAdmin(ctx, true)
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseShareLink, error) {
		return q.GetShareLinkByToken(ctx, token)
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return mapShareLink(result), nil
}

func (r *ShareLinkRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.ShareLink, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseShareLink, error) {
		return q.GetShareLinkByID(ctx, id)
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	return mapShareLink(result), nil
}

func (r *ShareLinkRepository) ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.ShareLink, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.CourseShareLink, error) {
		return q.ListShareLinksByCourseID(ctx, courseID)
	})
	if err != nil {
		return nil, err
	}
	links := make([]*entity.ShareLink, len(results))
	for i, r := range results {
		links[i] = mapShareLink(r)
	}
	return links, nil
}

func (r *ShareLinkRepository) UpdateEmails(ctx context.Context, id uuid.UUID, emails []string) (*entity.ShareLink, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.CourseShareLink, error) {
		return q.UpdateShareLinkEmails(ctx, gen.UpdateShareLinkEmailsParams{
			ID:            id,
			AllowedEmails: emails,
		})
	})
	if err != nil {
		return nil, err
	}
	return mapShareLink(result), nil
}

func (r *ShareLinkRepository) Deactivate(ctx context.Context, id uuid.UUID) error {
	return database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeactivateShareLink(ctx, id)
	})
}

func mapShareLink(row gen.CourseShareLink) *entity.ShareLink {
	return &entity.ShareLink{
		ID:            row.ID,
		TenantID:      row.TenantID,
		CourseID:      row.CourseID,
		CreatedBy:     row.CreatedBy,
		Token:         row.Token,
		AllowedEmails: row.AllowedEmails,
		IsActive:      row.IsActive,
		CreatedAt:     row.CreatedAt,
		UpdatedAt:     row.UpdatedAt,
	}
}

// VerificationCodeRepository implements repository.VerificationCodeRepository with sqlc.
type VerificationCodeRepository struct {
	db *sql.DB
}

// NewVerificationCodeRepository creates a new verification code repository.
func NewVerificationCodeRepository(db *sql.DB) repository.VerificationCodeRepository {
	return &VerificationCodeRepository{db: db}
}

func (r *VerificationCodeRepository) Create(ctx context.Context, code *entity.VerificationCode) error {
	// Verification codes are not tenant-scoped (share_verification_codes has no RLS)
	q := gen.New(r.db)
	result, err := q.CreateVerificationCode(ctx, gen.CreateVerificationCodeParams{
		ShareLinkID: code.ShareLinkID,
		Email:       code.Email,
		Code:        code.Code,
		ExpiresAt:   code.ExpiresAt,
	})
	if err != nil {
		return err
	}
	code.ID = result.ID
	code.CreatedAt = result.CreatedAt
	return nil
}

func (r *VerificationCodeRepository) Verify(ctx context.Context, shareLinkID uuid.UUID, email, code string) (*entity.VerificationCode, error) {
	q := gen.New(r.db)
	result, err := q.GetVerificationCode(ctx, gen.GetVerificationCodeParams{
		ShareLinkID: shareLinkID,
		Email:       email,
		Code:        code,
	})
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}
	vc := &entity.VerificationCode{
		ID:          result.ID,
		ShareLinkID: result.ShareLinkID,
		Email:       result.Email,
		Code:        result.Code,
		ExpiresAt:   result.ExpiresAt,
		CreatedAt:   result.CreatedAt,
	}
	if result.VerifiedAt != nil {
		vc.VerifiedAt = *result.VerifiedAt
	}
	return vc, nil
}

func (r *VerificationCodeRepository) MarkUsed(ctx context.Context, id uuid.UUID) error {
	q := gen.New(r.db)
	return q.MarkVerificationCodeUsed(ctx, id)
}

// ReviewCommentRepository implements repository.ReviewCommentRepository with sqlc.
type ReviewCommentRepository struct {
	db *sql.DB
}

// NewReviewCommentRepository creates a new review comment repository.
func NewReviewCommentRepository(db *sql.DB) repository.ReviewCommentRepository {
	return &ReviewCommentRepository{db: db}
}

func (r *ReviewCommentRepository) Create(ctx context.Context, comment *entity.ReviewComment) error {
	// Review comments are not tenant-scoped
	q := gen.New(r.db)
	result, err := q.CreateReviewComment(ctx, gen.CreateReviewCommentParams{
		ShareLinkID:   comment.ShareLinkID,
		CourseID:      comment.CourseID,
		LessonID:      comment.LessonID,
		ReviewerEmail: comment.ReviewerEmail,
		Comment:       comment.Comment,
	})
	if err != nil {
		return err
	}
	comment.ID = result.ID
	comment.CreatedAt = result.CreatedAt
	return nil
}

func (r *ReviewCommentRepository) ListByLesson(ctx context.Context, courseID uuid.UUID, lessonID string) ([]*entity.ReviewComment, error) {
	q := gen.New(r.db)
	results, err := q.ListReviewCommentsByLesson(ctx, gen.ListReviewCommentsByLessonParams{
		CourseID: courseID,
		LessonID: lessonID,
	})
	if err != nil {
		return nil, err
	}
	return mapReviewComments(results), nil
}

func (r *ReviewCommentRepository) ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.ReviewComment, error) {
	q := gen.New(r.db)
	results, err := q.ListReviewCommentsByCourse(ctx, courseID)
	if err != nil {
		return nil, err
	}
	return mapReviewComments(results), nil
}

func mapReviewComments(rows []gen.ShareReviewComment) []*entity.ReviewComment {
	comments := make([]*entity.ReviewComment, len(rows))
	for i, row := range rows {
		comments[i] = &entity.ReviewComment{
			ID:            row.ID,
			ShareLinkID:   row.ShareLinkID,
			CourseID:      row.CourseID,
			LessonID:      row.LessonID,
			ReviewerEmail: row.ReviewerEmail,
			Comment:       row.Comment,
			CreatedAt:     row.CreatedAt,
		}
	}
	return comments
}
