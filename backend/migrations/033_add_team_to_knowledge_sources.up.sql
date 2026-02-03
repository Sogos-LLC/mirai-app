-- Add team_id column for team-level knowledge sources
-- Team knowledge is shared across all courses for a team

-- Add team_id column (nullable - sources can be team-level OR course/session-level)
ALTER TABLE knowledge_sources
  ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

-- Add partial index for efficient team lookups
CREATE INDEX idx_knowledge_sources_team ON knowledge_sources(team_id)
  WHERE team_id IS NOT NULL;

-- Drop the old constraint that required course_id OR session_id
ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_course_or_session_check;

-- Add new constraint: must have course_id, session_id, OR team_id
ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_ownership_check
  CHECK (course_id IS NOT NULL OR session_id IS NOT NULL OR team_id IS NOT NULL);

-- Comment for documentation
COMMENT ON COLUMN knowledge_sources.team_id IS 'Team ID for team-level knowledge sources (shared across all team courses)';
