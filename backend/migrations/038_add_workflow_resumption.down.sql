ALTER TABLE generation_jobs DROP COLUMN IF EXISTS step_data_json;
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS pending_step;
-- Note: Cannot remove enum values in Postgres
