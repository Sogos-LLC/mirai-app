package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
)

// ShareLinkRepository manages course share links.
type ShareLinkRepository interface {
	Create(ctx context.Context, link *entity.ShareLink) error
	GetByToken(ctx context.Context, token string) (*entity.ShareLink, error)
	GetByID(ctx context.Context, id uuid.UUID) (*entity.ShareLink, error)
	ListByCourseID(ctx context.Context, courseID uuid.UUID) ([]*entity.ShareLink, error)
	UpdateEmails(ctx context.Context, id uuid.UUID, emails []string) (*entity.ShareLink, error)
	Deactivate(ctx context.Context, id uuid.UUID) error
}

// VerificationCodeRepository manages share verification codes.
type VerificationCodeRepository interface {
	Create(ctx context.Context, code *entity.VerificationCode) error
	Verify(ctx context.Context, shareLinkID uuid.UUID, email, code string) (*entity.VerificationCode, error)
	MarkUsed(ctx context.Context, id uuid.UUID) error
}

// ReviewCommentRepository manages share review comments.
type ReviewCommentRepository interface {
	Create(ctx context.Context, comment *entity.ReviewComment) error
	ListByLesson(ctx context.Context, courseID uuid.UUID, lessonID string) ([]*entity.ReviewComment, error)
	ListByCourse(ctx context.Context, courseID uuid.UUID) ([]*entity.ReviewComment, error)
}
