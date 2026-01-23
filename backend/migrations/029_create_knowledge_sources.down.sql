-- Migration: 029_create_knowledge_sources.down.sql
-- Rollback knowledge sources table

DROP TRIGGER IF EXISTS update_knowledge_sources_updated_at ON knowledge_sources;
DROP POLICY IF EXISTS knowledge_sources_isolation ON knowledge_sources;
DROP TABLE IF EXISTS knowledge_sources;
DROP TYPE IF EXISTS knowledge_source_status;
DROP TYPE IF EXISTS knowledge_source_type;
