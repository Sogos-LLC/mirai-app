package postgres

import (
	"database/sql"
	"fmt"

	_ "github.com/lib/pq"
)

// DB holds the database connection.
type DB struct {
	*sql.DB
}

// NewDB creates a new database connection.
func NewDB(databaseURL string) (*DB, error) {
	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Test the connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	// Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)

	return &DB{db}, nil
}

// Close closes the database connection.
func (db *DB) Close() error {
	return db.DB.Close()
}
