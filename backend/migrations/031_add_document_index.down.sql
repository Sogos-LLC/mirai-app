-- Rollback migration 031: Remove document_index column

ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS document_index;
