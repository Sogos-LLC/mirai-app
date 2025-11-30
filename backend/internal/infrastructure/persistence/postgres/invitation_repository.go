package postgres

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// InvitationRepository implements repository.InvitationRepository using PostgreSQL.
type InvitationRepository struct {
	db *sql.DB
}

// NewInvitationRepository creates a new PostgreSQL invitation repository.
func NewInvitationRepository(db *sql.DB) repository.InvitationRepository {
	return &InvitationRepository{db: db}
}

// Create creates a new invitation.
func (r *InvitationRepository) Create(ctx context.Context, inv *entity.Invitation) error {
	query := `
		INSERT INTO invitations (company_id, email, role, status, token, invited_by_user_id, expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		inv.CompanyID,
		inv.Email,
		inv.Role.String(),
		inv.Status.String(),
		inv.Token,
		inv.InvitedByUserID,
		inv.ExpiresAt,
	).Scan(&inv.ID, &inv.CreatedAt, &inv.UpdatedAt)
}

// GetByID retrieves an invitation by its ID.
func (r *InvitationRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Invitation, error) {
	query := `
		SELECT id, company_id, email, role, status, token, invited_by_user_id,
		       accepted_by_user_id, expires_at, created_at, updated_at
		FROM invitations
		WHERE id = $1
	`
	return r.scanInvitation(r.db.QueryRowContext(ctx, query, id))
}

// GetByToken retrieves an invitation by its token.
func (r *InvitationRepository) GetByToken(ctx context.Context, token string) (*entity.Invitation, error) {
	query := `
		SELECT id, company_id, email, role, status, token, invited_by_user_id,
		       accepted_by_user_id, expires_at, created_at, updated_at
		FROM invitations
		WHERE token = $1
	`
	return r.scanInvitation(r.db.QueryRowContext(ctx, query, token))
}

// GetByEmailAndCompanyID retrieves a pending invitation by email and company.
func (r *InvitationRepository) GetByEmailAndCompanyID(ctx context.Context, email string, companyID uuid.UUID) (*entity.Invitation, error) {
	query := `
		SELECT id, company_id, email, role, status, token, invited_by_user_id,
		       accepted_by_user_id, expires_at, created_at, updated_at
		FROM invitations
		WHERE email = $1 AND company_id = $2 AND status = 'pending' AND expires_at > NOW()
		LIMIT 1
	`
	return r.scanInvitation(r.db.QueryRowContext(ctx, query, email, companyID))
}

// ListByCompanyID retrieves all invitations for a company with optional status filters.
func (r *InvitationRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID, statusFilters ...valueobject.InvitationStatus) ([]*entity.Invitation, error) {
	query := `
		SELECT id, company_id, email, role, status, token, invited_by_user_id,
		       accepted_by_user_id, expires_at, created_at, updated_at
		FROM invitations
		WHERE company_id = $1
	`
	args := []interface{}{companyID}

	if len(statusFilters) > 0 {
		placeholders := make([]string, len(statusFilters))
		for i, status := range statusFilters {
			placeholders[i] = fmt.Sprintf("$%d", i+2)
			args = append(args, status.String())
		}
		query += " AND status IN (" + strings.Join(placeholders, ",") + ")"
	}

	query += " ORDER BY created_at DESC"

	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list invitations: %w", err)
	}
	defer rows.Close()

	var invitations []*entity.Invitation
	for rows.Next() {
		inv, err := r.scanInvitationFromRows(rows)
		if err != nil {
			return nil, fmt.Errorf("failed to scan invitation: %w", err)
		}
		invitations = append(invitations, inv)
	}
	return invitations, rows.Err()
}

// Update updates an invitation.
func (r *InvitationRepository) Update(ctx context.Context, inv *entity.Invitation) error {
	query := `
		UPDATE invitations
		SET status = $1, accepted_by_user_id = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query,
		inv.Status.String(),
		inv.AcceptedByUserID,
		inv.ID,
	).Scan(&inv.UpdatedAt)
}

// CountPendingByCompanyID counts pending invitations for a company.
func (r *InvitationRepository) CountPendingByCompanyID(ctx context.Context, companyID uuid.UUID) (int, error) {
	query := `
		SELECT COUNT(*)
		FROM invitations
		WHERE company_id = $1 AND status = 'pending' AND expires_at > NOW()
	`
	var count int
	err := r.db.QueryRowContext(ctx, query, companyID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to count pending invitations: %w", err)
	}
	return count, nil
}

// scanInvitation scans a single invitation from a query row.
func (r *InvitationRepository) scanInvitation(row *sql.Row) (*entity.Invitation, error) {
	inv := &entity.Invitation{}
	var roleStr, statusStr string

	err := row.Scan(
		&inv.ID,
		&inv.CompanyID,
		&inv.Email,
		&roleStr,
		&statusStr,
		&inv.Token,
		&inv.InvitedByUserID,
		&inv.AcceptedByUserID,
		&inv.ExpiresAt,
		&inv.CreatedAt,
		&inv.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}

	inv.Role = valueobject.Role(roleStr)
	inv.Status = valueobject.InvitationStatus(statusStr)
	return inv, nil
}

// scanInvitationFromRows scans a single invitation from a rows iterator.
func (r *InvitationRepository) scanInvitationFromRows(rows *sql.Rows) (*entity.Invitation, error) {
	inv := &entity.Invitation{}
	var roleStr, statusStr string

	err := rows.Scan(
		&inv.ID,
		&inv.CompanyID,
		&inv.Email,
		&roleStr,
		&statusStr,
		&inv.Token,
		&inv.InvitedByUserID,
		&inv.AcceptedByUserID,
		&inv.ExpiresAt,
		&inv.CreatedAt,
		&inv.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	inv.Role = valueobject.Role(roleStr)
	inv.Status = valueobject.InvitationStatus(statusStr)
	return inv, nil
}
