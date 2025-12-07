package database

import (
	"context"
	"database/sql"

	"github.com/sogos/mirai-backend/internal/database/gen"
	"github.com/sogos/mirai-backend/internal/infrastructure/persistence/postgres"
)

// WithRLS executes sqlc queries within an RLS-protected transaction.
// This bridges sqlc-generated code with the existing RLS infrastructure.
//
// Usage:
//
//	result, err := database.WithRLS(ctx, db, func(q *gen.Queries) (gen.Course, error) {
//	    return q.GetCourseByID(ctx, id)
//	})
func WithRLS[T any](ctx context.Context, db *sql.DB, fn func(q *gen.Queries) (T, error)) (T, error) {
	return postgres.RLSQuery(ctx, db, func(tx *sql.Tx) (T, error) {
		q := gen.New(tx)
		return fn(q)
	})
}

// WithRLSExec executes sqlc queries that don't return results within an RLS-protected transaction.
//
// Usage:
//
//	err := database.WithRLSExec(ctx, db, func(q *gen.Queries) error {
//	    return q.DeleteCourse(ctx, id)
//	})
func WithRLSExec(ctx context.Context, db *sql.DB, fn func(q *gen.Queries) error) error {
	return postgres.RLSExec(ctx, db, func(tx *sql.Tx) error {
		q := gen.New(tx)
		return fn(q)
	})
}

// WithRLSSlice executes sqlc queries that return slices within an RLS-protected transaction.
// This is a convenience wrapper that properly handles empty slices.
//
// Usage:
//
//	courses, err := database.WithRLSSlice(ctx, db, func(q *gen.Queries) ([]gen.Course, error) {
//	    return q.ListCourses(ctx, params)
//	})
func WithRLSSlice[T any](ctx context.Context, db *sql.DB, fn func(q *gen.Queries) ([]T, error)) ([]T, error) {
	return postgres.RLSQuery(ctx, db, func(tx *sql.Tx) ([]T, error) {
		q := gen.New(tx)
		return fn(q)
	})
}
