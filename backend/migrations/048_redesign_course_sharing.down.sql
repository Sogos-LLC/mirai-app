DROP INDEX IF EXISTS idx_course_share_links_status;

ALTER TABLE course_share_links
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS snapshot_path;
