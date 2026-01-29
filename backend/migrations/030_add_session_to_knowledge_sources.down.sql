-- Revert session_id additions

-- Remove constraint
ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_course_or_session_check;

-- Drop index
DROP INDEX IF EXISTS idx_knowledge_sources_session;

-- Remove columns
ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS token_count;

ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS summary;

ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS session_id;

-- Make course_id required again
-- Note: This will fail if there are rows with NULL course_id
ALTER TABLE knowledge_sources
  ALTER COLUMN course_id SET NOT NULL;
