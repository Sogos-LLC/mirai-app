package sqlc

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sogos/mirai-backend/internal/database"
	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/domain/entity"
	"github.com/sogos/mirai-backend/internal/domain/repository"
	"github.com/sogos/mirai-backend/internal/domain/valueobject"
)

// TeamRepository implements repository.TeamRepository using sqlc-generated code.
type TeamRepository struct {
	db *sql.DB
}

// NewTeamRepository creates a new sqlc-based team repository.
func NewTeamRepository(db *sql.DB) repository.TeamRepository {
	return &TeamRepository{db: db}
}

// Create creates a new team.
func (r *TeamRepository) Create(ctx context.Context, team *entity.Team) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Team, error) {
		return q.CreateTeam(ctx, gen.CreateTeamParams{
			TenantID:    team.TenantID,
			CompanyID:   team.CompanyID,
			Name:        team.Name,
			Description: toNullString(team.Description),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to create team: %w", err)
	}

	// Update entity with generated values
	team.ID = result.ID
	team.CreatedAt = result.CreatedAt
	team.UpdatedAt = result.UpdatedAt
	return nil
}

// GetByID retrieves a team by its ID.
func (r *TeamRepository) GetByID(ctx context.Context, id uuid.UUID) (*entity.Team, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Team, error) {
		return q.GetTeamByID(ctx, id)
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team: %w", err)
	}
	return toTeamEntity(&result), nil
}

// ListByCompanyID retrieves all teams in a company.
func (r *TeamRepository) ListByCompanyID(ctx context.Context, companyID uuid.UUID) ([]*entity.Team, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.Team, error) {
		return q.ListTeamsByCompanyID(ctx, companyID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list teams: %w", err)
	}

	teams := make([]*entity.Team, len(results))
	for i := range results {
		teams[i] = toTeamEntity(&results[i])
	}
	return teams, nil
}

// Update updates a team.
func (r *TeamRepository) Update(ctx context.Context, team *entity.Team) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.Team, error) {
		return q.UpdateTeam(ctx, gen.UpdateTeamParams{
			Name:        team.Name,
			Description: toNullString(team.Description),
			ID:          team.ID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to update team: %w", err)
	}

	// Update entity with new timestamp
	team.UpdatedAt = result.UpdatedAt
	return nil
}

// Delete deletes a team.
func (r *TeamRepository) Delete(ctx context.Context, id uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.DeleteTeam(ctx, id)
	})
	if err != nil {
		return fmt.Errorf("failed to delete team: %w", err)
	}
	return nil
}

// AddMember adds a member to a team.
func (r *TeamRepository) AddMember(ctx context.Context, member *entity.TeamMember) error {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TeamMember, error) {
		return q.AddTeamMember(ctx, gen.AddTeamMemberParams{
			TenantID: member.TenantID,
			TeamID:   member.TeamID,
			UserID:   member.UserID,
			Role:     member.Role.String(),
		})
	})
	if err != nil {
		return fmt.Errorf("failed to add team member: %w", err)
	}

	// Update entity with generated values
	member.ID = result.ID
	member.CreatedAt = result.CreatedAt
	return nil
}

// RemoveMember removes a member from a team.
func (r *TeamRepository) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	err := database.WithRLSExec(ctx, r.db, func(q *gen.Queries) error {
		return q.RemoveTeamMember(ctx, gen.RemoveTeamMemberParams{
			TeamID: teamID,
			UserID: userID,
		})
	})
	if err != nil {
		return fmt.Errorf("failed to remove team member: %w", err)
	}
	return nil
}

// ListMembers retrieves all members of a team.
func (r *TeamRepository) ListMembers(ctx context.Context, teamID uuid.UUID) ([]*entity.TeamMember, error) {
	results, err := database.WithRLSSlice(ctx, r.db, func(q *gen.Queries) ([]gen.TeamMember, error) {
		return q.ListTeamMembers(ctx, teamID)
	})
	if err != nil {
		return nil, fmt.Errorf("failed to list team members: %w", err)
	}

	members := make([]*entity.TeamMember, len(results))
	for i := range results {
		members[i] = toTeamMemberEntity(&results[i])
	}
	return members, nil
}

// GetMember retrieves a specific team member.
func (r *TeamRepository) GetMember(ctx context.Context, teamID, userID uuid.UUID) (*entity.TeamMember, error) {
	result, err := database.WithRLS(ctx, r.db, func(q *gen.Queries) (gen.TeamMember, error) {
		return q.GetTeamMember(ctx, gen.GetTeamMemberParams{
			TeamID: teamID,
			UserID: userID,
		})
	})
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get team member: %w", err)
	}
	return toTeamMemberEntity(&result), nil
}

// =============================================================================
// Type Conversion Helpers
// =============================================================================

// toTeamEntity converts a sqlc-generated Team to a domain entity.
func toTeamEntity(t *gen.Team) *entity.Team {
	return &entity.Team{
		ID:          t.ID,
		TenantID:    t.TenantID,
		CompanyID:   t.CompanyID,
		Name:        t.Name,
		Description: fromNullStringPtr(t.Description),
		CreatedAt:   t.CreatedAt,
		UpdatedAt:   t.UpdatedAt,
	}
}

// toTeamMemberEntity converts a sqlc-generated TeamMember to a domain entity.
func toTeamMemberEntity(m *gen.TeamMember) *entity.TeamMember {
	return &entity.TeamMember{
		ID:        m.ID,
		TenantID:  m.TenantID,
		TeamID:    m.TeamID,
		UserID:    m.UserID,
		Role:      valueobject.TeamRole(m.Role),
		CreatedAt: m.CreatedAt,
	}
}
