-- Remove outline_lesson_id column from generation_jobs table
DROP INDEX IF EXISTS idx_generation_jobs_outline_lesson;
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS outline_lesson_id;
