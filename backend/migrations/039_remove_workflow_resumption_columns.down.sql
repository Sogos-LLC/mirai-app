ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS pending_step INTEGER;
ALTER TABLE generation_jobs ADD COLUMN IF NOT EXISTS step_data_json TEXT;
