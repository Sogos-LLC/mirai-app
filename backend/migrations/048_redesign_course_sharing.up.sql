ALTER TABLE course_share_links
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN snapshot_path TEXT;

-- Backfill existing rows as ready (they were created before snapshotting existed)
UPDATE course_share_links SET status = 'ready';

CREATE INDEX idx_course_share_links_status ON course_share_links(status);
