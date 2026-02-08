-- Add completion_notes column for SMEs to leave notes when completing gap tasks
ALTER TABLE knowledge_gap_tasks ADD COLUMN completion_notes TEXT;
