-- Migration: 029_create_knowledge_sources.up.sql
-- Knowledge sources for RAG-enhanced course generation

-- Knowledge source type enum
CREATE TYPE knowledge_source_type AS ENUM (
    'file_upload',
    'google_drive',
    'onedrive',
    's3',
    'google_sheets',
    'microsoft_365',
    'url'
);

-- Knowledge source status enum
CREATE TYPE knowledge_source_status AS ENUM (
    'pending',
    'processing',
    'ready',
    'failed'
);

-- Knowledge sources table (metadata only, vectors stored in Qdrant)
CREATE TABLE knowledge_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id UUID NOT NULL,

    type knowledge_source_type NOT NULL,
    status knowledge_source_status NOT NULL DEFAULT 'pending',

    name VARCHAR(255) NOT NULL,
    file_path VARCHAR(1024),
    mime_type VARCHAR(100),
    file_size_bytes BIGINT,

    chunk_count INTEGER DEFAULT 0,
    error_message TEXT,

    -- Detected video URLs stored as JSON array
    video_urls JSONB DEFAULT '[]'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_knowledge_sources_tenant ON knowledge_sources(tenant_id);
CREATE INDEX idx_knowledge_sources_course ON knowledge_sources(course_id);
CREATE INDEX idx_knowledge_sources_status ON knowledge_sources(status);

-- Enable RLS
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;

-- RLS policy for tenant isolation
CREATE POLICY knowledge_sources_isolation ON knowledge_sources
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Comments
COMMENT ON TABLE knowledge_sources IS 'Knowledge sources for RAG-enhanced course generation';
COMMENT ON COLUMN knowledge_sources.file_path IS 'MinIO path for uploaded files';
COMMENT ON COLUMN knowledge_sources.chunk_count IS 'Number of text chunks in vector store';
COMMENT ON COLUMN knowledge_sources.video_urls IS 'Detected video URLs for multimedia components';
