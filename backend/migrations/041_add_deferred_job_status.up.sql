-- Add 'deferred' status for courses where user chose to assign gaps instead of proceeding
ALTER TYPE generation_job_status ADD VALUE IF NOT EXISTS 'deferred';
