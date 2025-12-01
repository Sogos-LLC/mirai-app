-- Add folders table for course organization
-- Folders enable hierarchical course library organization

CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL DEFAULT 'FOLDER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT folder_type_check CHECK (type IN ('LIBRARY', 'TEAM', 'PERSONAL', 'FOLDER'))
);

CREATE INDEX idx_folders_tenant ON folders(tenant_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_type ON folders(type);

-- Enable RLS on folders table
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Folders: tenant isolation
CREATE POLICY folders_isolation ON folders
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Update courses table to use folder_id FK instead of folder_path
-- First add the new column
ALTER TABLE courses ADD COLUMN folder_id UUID REFERENCES folders(id);

-- Add index for folder lookups
CREATE INDEX idx_courses_folder_id ON courses(folder_id);

-- Rename columns to match entity definitions
ALTER TABLE courses RENAME COLUMN storage_key TO content_path;
ALTER TABLE courses RENAME COLUMN created_by TO created_by_user_id;
ALTER TABLE courses RENAME COLUMN tags TO category_tags;

-- Rename thumbnail_key to thumbnail_path for consistency
ALTER TABLE courses RENAME COLUMN thumbnail_key TO thumbnail_path;
