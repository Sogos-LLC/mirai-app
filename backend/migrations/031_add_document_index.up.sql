-- Migration 031: Add document_index column for RAG navigation
-- This stores a structured index of document topics/concepts for AI to use as a "map"

ALTER TABLE knowledge_sources
  ADD COLUMN document_index JSONB;

-- Add comment explaining the column
COMMENT ON COLUMN knowledge_sources.document_index IS
  'Structured index of document contents: main_topics, key_concepts, estimated_lesson_count. Used by AI for course planning.';
