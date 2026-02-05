-- Add missing enum values for workflow resumption
ALTER TYPE generation_job_status ADD VALUE IF NOT EXISTS 'awaiting_approval';
ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'course_creation';
ALTER TYPE generation_job_type ADD VALUE IF NOT EXISTS 'course_planning';

-- Add columns for workflow resumption
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pending_step INTEGER;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS step_data_json TEXT;
