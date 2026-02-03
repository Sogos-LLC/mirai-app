-- Allow global/tenant-level knowledge sources (where team_id, course_id, and session_id are all NULL)
-- Global knowledge is scoped by tenant_id via RLS, so it doesn't need additional scope constraints

-- Drop the constraint that required at least one scope
ALTER TABLE knowledge_sources
  DROP CONSTRAINT IF EXISTS knowledge_sources_scope_check;

-- Add comment for documentation
COMMENT ON TABLE knowledge_sources IS 'Knowledge sources can be scoped to: course (course_id), session (session_id), team (team_id), or global/tenant (all NULL)';
