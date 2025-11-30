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

// TeamRepository implements repository.TeamRepository using PostgreSQL.
type TeamRepository struct {
	db *sql.DB
}

// NewTeamRepository creates a new PostgreSQL team repository.
func NewTeamRepository(db *sql.DB) repository.TeamRepository {
	return &TeamRepository{db: db}
}

// Create creates a new team.
func (r *TeamRepository) Create(ctx context.Context, team *entity.Team) error {
	query := `
		INSERT INTO teams (company_id, name, description)
		VALUES ($1, $2, $3)
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query, team.CompanyID, team.Name, team.Description).
		Scan(&team.ID, &team.CreatedAt, &team.UpdatedAt)
}

// GetByID retrieves a team by its ID.
func (r *TeamRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Team, error) {
	query := `
		SELECT id, company_id, name, description, created_at, updated_at
		FROM teams
		WHERE id = $1
	`
	team := &entity.Team{}
	err := r.db.QueryRowContext(ctx, query, id).Scan(
		&team.ID,
		&team.CompanyID,
		&team.Name,
		&team.Description,
		&team.CreatedAt,
		&team.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team: %w", err)
	}
	return team, nil
}

// ListByCompanyID retrieves all teams in a company.
func (r *TeamRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.Team, error) {
	query := `
		SELECT id, company_id, name, description, created_at, updated_at
		FROM teams
		WHERE company_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, companyID)
	if err != nil {
		return nil, fmt.Errorf("failed to list teams: %w", err)
	}
	defer rows.Close()

	var teams []*entity.Team
	for rows.Next() {
		team := &entity.Team{}
		if err := rows.Scan(
			&team.ID,
			&team.CompanyID,
			&team.Name,
			&team.Description,
			&team.CreatedAt,
			&team.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan team: %w", err)
		}
		teams = append(teams, team)
	}
	return teams, nil
}

// Update updates a team.
func (r *TeamRepository) Update(ctx context.Context, team *entity.Team) error {
	query := `
		UPDATE teams
		SET name = $1, description = $2, updated_at = NOW()
		WHERE id = $3
		RETURNING updated_at
	`
	return r.db.QueryRowContext(ctx, query, team.Name, team.Description, team.ID).
		Scan(&team.UpdatedAt)
}

// Delete deletes a team.
func (r *TeamRepository) Delete(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM teams WHERE id = $1`
	result, err := r.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("failed to delete team: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("team not found")
	}
	return nil
}

// AddMember adds a member to a team.
func (r *TeamRepository) AddMember(ctx context.Context, member *entity.TeamMember) error {
	query := `
		INSERT INTO team_members (team_id, user_id, role)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`
	return r.db.QueryRowContext(ctx, query, member.TeamID, member.UserID, member.Role.String()).
		Scan(&member.ID, &member.CreatedAt)
}

// RemoveMember removes a member from a team.
func (r *TeamRepository) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	query := `DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`
	result, err := r.db.ExecContext(ctx, query, teamID, userID)
	if err != nil {
		return fmt.Errorf("failed to remove team member: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}
	if rows == 0 {
		return fmt.Errorf("team member not found")
	}
	return nil
}

// ListMembers retrieves all members of a team.
func (r *TeamRepository) ListMembers(ctx context.Context, teamID uuid.UUID) ([]*entity.TeamMember, error) {
	query := `
		SELECT id, team_id, user_id, role, created_at
		FROM team_members
		WHERE team_id = $1
		ORDER BY created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, teamID)
	if err != nil {
		return nil, fmt.Errorf("failed to list team members: %w", err)
	}
	defer rows.Close()

	var members []*entity.TeamMember
	for rows.Next() {
		member := &entity.TeamMember{}
		var roleStr string
		if err := rows.Scan(
			&member.ID,
			&member.TeamID,
			&member.UserID,
			&roleStr,
			&member.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan team member: %w", err)
		}
		member.Role = valueobject.TeamRole(roleStr)
		members = append(members, member)
	}
	return members, nil
}

// GetMember retrieves a specific team member.
func (r *TeamRepository) GetMember(ctx context.Context, teamID, userID uuid.UUID) (*entity.TeamMember, error) {
	query := `
		SELECT id, team_id, user_id, role, created_at
		FROM team_members
		WHERE team_id = $1 AND user_id = $2
	`
	member := &entity.TeamMember{}
	var roleStr string
	err := r.db.QueryRowContext(ctx, query, teamID, userID).Scan(
		&member.ID,
		&member.TeamID,
		&member.UserID,
		&roleStr,
		&member.CreatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team member: %w", err)
	}
	member.Role = valueobject.TeamRole(roleStr)
	return member, nil
}
