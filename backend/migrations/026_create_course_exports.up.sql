-- Migration: Create course_exports table for SCORM export job tracking
-- This table tracks export jobs similar to generation_jobs

-- Create enum types for export format and status
CREATE TYPE export_format AS ENUM ('scorm_12', 'scorm_2004', 'xapi', 'pdf');
CREATE TYPE export_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Create course_exports table
CREATE TABLE course_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    format export_format NOT NULL,
    status export_status NOT NULL DEFAULT 'pending',
    version INT NOT NULL DEFAULT 1,
    file_path VARCHAR(500),           -- MinIO path to ZIP file
    file_size_bytes BIGINT,
    error_message TEXT,
    progress_percent INT NOT NULL DEFAULT 0,
    progress_message TEXT,
    created_by_user_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Enable Row Level Security
ALTER TABLE course_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_exports FORCE ROW LEVEL SECURITY;

-- RLS policy for tenant isolation
CREATE POLICY course_exports_tenant_isolation ON course_exports
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Indexes for common query patterns
CREATE INDEX idx_course_exports_tenant ON course_exports(tenant_id);
CREATE INDEX idx_course_exports_course ON course_exports(course_id);
CREATE INDEX idx_course_exports_status ON course_exports(status);
CREATE INDEX idx_course_exports_created_by ON course_exports(created_by_user_id);

-- Composite index for pending job polling
CREATE INDEX idx_course_exports_pending ON course_exports(status, created_at)
    WHERE status = 'pending';

COMMENT ON TABLE course_exports IS 'Tracks SCORM and other format export jobs for courses';
COMMENT ON COLUMN course_exports.file_path IS 'MinIO object path for the exported ZIP file';
COMMENT ON COLUMN course_exports.progress_percent IS 'Export progress from 0-100';
