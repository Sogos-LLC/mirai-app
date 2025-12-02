-- Add submission approval workflow fields
-- Enables human-in-the-loop review before knowledge is added to SME

-- Add new task statuses for the approval workflow
ALTER TYPE sme_task_status ADD VALUE IF NOT EXISTS 'awaiting_review';
ALTER TYPE sme_task_status ADD VALUE IF NOT EXISTS 'changes_requested';

-- Add approval fields to submissions
ALTER TABLE sme_task_submissions
ADD COLUMN reviewer_notes TEXT,
ADD COLUMN approved_content TEXT,
ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN approved_at TIMESTAMPTZ,
ADD COLUMN approved_by_user_id UUID REFERENCES users(id);

-- Index for finding submissions awaiting review
CREATE INDEX idx_sme_submissions_approval ON sme_task_submissions(is_approved) WHERE is_approved = FALSE;
