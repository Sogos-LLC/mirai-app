-- Rollback folders table and courses column changes

-- Revert column renames
ALTER TABLE courses RENAME COLUMN thumbnail_path TO thumbnail_key;
ALTER TABLE courses RENAME COLUMN category_tags TO tags;
ALTER TABLE courses RENAME COLUMN created_by_user_id TO created_by;
ALTER TABLE courses RENAME COLUMN content_path TO storage_key;

-- Remove folder_id FK
DROP INDEX IF EXISTS idx_courses_folder_id;
ALTER TABLE courses DROP COLUMN IF EXISTS folder_id;

-- Remove folders RLS policy
DROP POLICY IF EXISTS folders_isolation ON folders;

-- Remove folders table
DROP INDEX IF EXISTS idx_folders_type;
DROP INDEX IF EXISTS idx_folders_parent;
DROP INDEX IF EXISTS idx_folders_tenant;
DROP TABLE IF EXISTS folders;
