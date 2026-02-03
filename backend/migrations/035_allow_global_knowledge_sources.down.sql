-- Restore the scope check constraint (this will fail if global knowledge sources exist)
ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_scope_check
  CHECK (course_id IS NOT NULL OR session_id IS NOT NULL OR team_id IS NOT NULL);
