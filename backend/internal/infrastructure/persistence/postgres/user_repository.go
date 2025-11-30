package postgres

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// UserRepository implements repository.UserRepository using PostgreSQL.
type UserRepository struct {
	db *sql.DB
}

// NewUserRepository creates a new PostgreSQL user repository.
func NewUserRepository(db *sql.DB) repository.UserRepository {
	return &UserRepository{db: db}
}

// Create creates a new user.
func (r *UserRepository) Create(ctx context.Context, user *entity.User) error {
	query := `
		INSERT INTO users (kratos_id, company_id, role)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query, user.KratosID, user.CompanyID, user.Role.String()).
		Scan(&user.ID, &user.CreatedAt, &user.UpdatedAt)
}

// GetByID retrieves a user by their ID.
func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.User, error) {
	query := `
		SELECT id, kratos_id, company_id, role, created_at, updated_at
		FROM users
		WHERE id = $1
	`
	user := &entity.User{}
	var roleStr string
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&user.ID,
		&user.KratosID,
		&user.CompanyID,
		&roleStr,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	user.Role = valueobject.Role(roleStr)
	return user, nil
}

// GetByKratosID retrieves a user by their Kratos identity ID.
func (r *UserRepository) GetByKratosID(ctx context.Context, kratosID uuid.UUID) (*entity.User, error) {
	query := `
		SELECT id, kratos_id, company_id, role, created_at, updated_at
		FROM users
		WHERE kratos_id = $1
	`
	user := &entity.User{}
	var roleStr string
	err := r.db.QueryRowContext(ctx, query, kratosID).Scan(
		&user.ID,
		&user.KratosID,
		&user.CompanyID,
		&roleStr,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	user.Role = valueobject.Role(roleStr)
	return user, nil
}

// GetOwnerByCompanyID retrieves the owner user of a company.
func (r *UserRepository) GetOwnerByCompanyID(ctx context.Context, companyID uuid.UUID) (*entity.User, error) {
	query := `
		SELECT id, kratos_id, company_id, role, created_at, updated_at
		FROM users
		WHERE company_id = $1 AND role = 'owner'
		LIMIT 1
	`
	user := &entity.User{}
	var roleStr string
	err := r.db.QueryRowContext(ctx, query, companyID).Scan(
		&user.ID,
		&user.KratosID,
		&user.CompanyID,
		&roleStr,
		&user.CreatedAt,
		&user.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get owner: %w", err)
	}
	user.Role = valueobject.Role(roleStr)
	return user, nil
}

// ListByCompanyID retrieves all users in a company.
func (r *UserRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.User, error) {
	query := `
		SELECT id, kratos_id, company_id, role, created_at, updated_at
		FROM users
		WHERE company_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, companyID)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*entity.User
	for rows.Next() {
		user := &entity.User{}
		var roleStr string
		if err := rows.Scan(
			&user.ID,
			&user.KratosID,
			&user.CompanyID,
			&roleStr,
			&user.CreatedAt,
			&user.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan user: %w", err)
		}
		user.Role = valueobject.Role(roleStr)
		users = append(users, user)
	}
	return users, nil
}

// Update updates a user.
func (r *UserRepository) Update(ctx context.Context, user *entity.User) error {
	query := `
		UPDATE users
		SET company_id = $1, role = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query, user.CompanyID, user.Role.String(), user.ID).
		Scan(&user.UpdatedAt)
}
