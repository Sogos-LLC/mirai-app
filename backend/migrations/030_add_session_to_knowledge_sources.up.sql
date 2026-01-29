-- Add session_id column for pre-course knowledge sources (wizard flow)
-- Sources can be created before a course exists, then linked when course is created

-- Make course_id nullable to allow session-only sources
ALTER TABLE knowledge_sources
  ALTER COLUMN course_id DROP NOT NULL;

-- Add session_id column
ALTER TABLE knowledge_sources
  ADD COLUMN session_id VARCHAR(64);

-- Add AI-generated summary (RAG verification)
ALTER TABLE knowledge_sources
  ADD COLUMN summary TEXT;

-- Add token count
ALTER TABLE knowledge_sources
  ADD COLUMN token_count INTEGER;

-- Create index for session lookups
CREATE INDEX idx_knowledge_sources_session ON knowledge_sources(session_id)
  WHERE session_id IS NOT NULL;

-- Add constraint: must have either course_id or session_id
ALTER TABLE knowledge_sources
  ADD CONSTRAINT knowledge_sources_course_or_session_check
  CHECK (course_id IS NOT NULL OR session_id IS NOT NULL);
