-- Add content_hash column to knowledge_sources for duplicate detection
-- Hash is SHA-256 hex string (64 characters)

ALTER TABLE knowledge_sources
ADD COLUMN content_hash VARCHAR(64);

-- Index for fast duplicate lookups within a tenant
CREATE INDEX idx_knowledge_sources_content_hash ON knowledge_sources(tenant_id, content_hash);

COMMENT ON COLUMN knowledge_sources.content_hash IS 'SHA-256 hash of file content for duplicate detection';
