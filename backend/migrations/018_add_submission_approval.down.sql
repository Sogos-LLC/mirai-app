-- Remove submission approval workflow fields

DROP INDEX IF EXISTS idx_sme_submissions_approval;

ALTER TABLE sme_task_submissions
DROP COLUMN IF EXISTS reviewer_notes,
DROP COLUMN IF EXISTS approved_content,
DROP COLUMN IF EXISTS is_approved,
DROP COLUMN IF EXISTS approved_at,
DROP COLUMN IF EXISTS approved_by_user_id;

-- Note: PostgreSQL doesn't support removing enum values easily
-- The 'awaiting_review' and 'changes_requested' values will remain in the enum
-- This is acceptable as they won't cause issues when not used
