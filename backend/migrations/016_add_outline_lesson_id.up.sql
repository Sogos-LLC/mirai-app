-- Add outline_lesson_id column to generation_jobs table
-- This column references the outline lesson that a job is generating content for
-- Separate from lesson_id which references the generated_lesson after completion

-- Add the new column
ALTER TABLE generation_jobs
    ADD COLUMN outline_lesson_id UUID REFERENCES outline_lessons(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_generation_jobs_outline_lesson ON generation_jobs(outline_lesson_id);
