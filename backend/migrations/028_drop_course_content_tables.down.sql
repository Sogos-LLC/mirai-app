-- This is a destructive migration - data cannot be restored
-- The down migration only recreates empty tables for schema compatibility
-- All course content is now stored in MinIO only

-- Recreate enums
CREATE TYPE outline_approval_status AS ENUM ('pending_review', 'approved', 'rejected', 'revision_requested');
CREATE TYPE lesson_component_type AS ENUM ('text', 'heading', 'image', 'quiz');
CREATE TYPE heading_level AS ENUM ('h1', 'h2', 'h3', 'h4');

-- Note: Tables would need to be recreated from 011_create_ai_tables.up.sql
-- This down migration is intentionally minimal as this is a greenfield project
-- and we don't want to restore the old broken architecture
SELECT 'WARNING: Down migration does not restore tables. This is intentional.';
