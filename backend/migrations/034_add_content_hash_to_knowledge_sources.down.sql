-- Rollback content_hash column

DROP INDEX IF EXISTS idx_knowledge_sources_content_hash;

ALTER TABLE knowledge_sources
DROP COLUMN IF EXISTS content_hash;
