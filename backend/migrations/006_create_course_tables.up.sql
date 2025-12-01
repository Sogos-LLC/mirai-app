-- Create course tables for PostgreSQL metadata storage
-- Content bodies stored in MinIO, metadata in PostgreSQL

-- Courses table (metadata only, content in MinIO)
CREATE TABLE courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id),
    created_by UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    storage_key VARCHAR(500) NOT NULL,  -- MinIO path for full course content JSON
    thumbnail_key VARCHAR(500),          -- MinIO path for thumbnail
    folder_path VARCHAR(500),            -- Logical folder path in library
    tags TEXT[],                         -- Array of category tags
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT course_status_check CHECK (status IN ('draft', 'published', 'generated', 'archived'))
);

CREATE INDEX idx_courses_tenant ON courses(tenant_id);
CREATE INDEX idx_courses_company ON courses(company_id);
CREATE INDEX idx_courses_team ON courses(team_id);
CREATE INDEX idx_courses_created_by ON courses(created_by);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_folder_path ON courses(folder_path);

-- Course modules (sections/chapters within a course)
CREATE TABLE course_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modules_tenant ON course_modules(tenant_id);
CREATE INDEX idx_modules_course ON course_modules(course_id);
CREATE INDEX idx_modules_position ON course_modules(course_id, position);

-- Lessons within modules (content stored in MinIO)
CREATE TABLE lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    module_id UUID NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content_key VARCHAR(500),  -- MinIO path for lesson content (HTML/Markdown)
    position INTEGER NOT NULL DEFAULT 0,
    estimated_duration_minutes INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lessons_tenant ON lessons(tenant_id);
CREATE INDEX idx_lessons_module ON lessons(module_id);
CREATE INDEX idx_lessons_position ON lessons(module_id, position);

-- SCORM packages for course exports
CREATE TABLE scorm_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    format VARCHAR(20) NOT NULL DEFAULT 'scorm_2004',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    archive_key VARCHAR(500),  -- MinIO path for ZIP archive
    manifest_version VARCHAR(20),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT scorm_format_check CHECK (format IN ('scorm_12', 'scorm_2004', 'xapi', 'pdf')),
    CONSTRAINT scorm_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_scorm_tenant ON scorm_packages(tenant_id);
CREATE INDEX idx_scorm_course ON scorm_packages(course_id);
CREATE INDEX idx_scorm_status ON scorm_packages(status);
