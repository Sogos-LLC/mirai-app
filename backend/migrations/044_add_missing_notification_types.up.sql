-- Add notification types that were added in Go code but missing from PostgreSQL enum.
-- The enum was last rebuilt in migration 022 with only 4 values.
-- These types are needed for exports, submissions, and knowledge gap task notifications.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'submission_ready_for_review';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'submission_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'changes_requested';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'export_complete';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'export_failed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'gap_task_assigned';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'gap_task_completed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'gap_tasks_submitted';
