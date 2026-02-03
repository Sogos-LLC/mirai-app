-- Revert team_id addition to knowledge_sources

-- Drop the new constraint
ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_ownership_check;

-- Restore the old constraint (course_id OR session_id only)
ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_course_or_session_check
  CHECK (course_id IS NOT NULL OR session_id IS NOT NULL);

-- Drop the index
DROP INDEX IF EXISTS idx_knowledge_sources_team;

-- Remove the team_id column
ALTER TABLE knowledge_sources
  DROP COLUMN IF EXISTS team_id;
