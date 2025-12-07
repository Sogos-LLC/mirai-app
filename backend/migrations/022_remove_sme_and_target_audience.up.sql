-- Migration: Remove SME and Target Audience features
-- This is a greenfield cleanup - no data preservation needed

-- Step 1: Remove foreign key constraints from notifications that reference SME tables
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_task_id_fkey;
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_sme_id_fkey;

-- Step 2: Drop the task_id and sme_id columns from notifications
ALTER TABLE notifications DROP COLUMN IF EXISTS task_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS sme_id;

-- Step 3: Drop RLS policies on SME tables
DROP POLICY IF EXISTS sme_chunks_isolation ON sme_knowledge_chunks;
DROP POLICY IF EXISTS sme_submissions_isolation ON sme_task_submissions;
DROP POLICY IF EXISTS sme_tasks_isolation ON sme_tasks;
DROP POLICY IF EXISTS sme_team_access_isolation ON sme_team_access;
DROP POLICY IF EXISTS sme_isolation ON subject_matter_experts;

-- Step 4: Drop RLS policies on Target Audience tables
DROP POLICY IF EXISTS audience_templates_isolation ON target_audience_templates;

-- Step 5: Drop SME tables in dependency order
DROP TABLE IF EXISTS sme_knowledge_chunks CASCADE;
DROP TABLE IF EXISTS sme_task_submissions CASCADE;
DROP TABLE IF EXISTS sme_tasks CASCADE;
DROP TABLE IF EXISTS sme_team_access CASCADE;
DROP TABLE IF EXISTS subject_matter_experts CASCADE;

-- Step 6: Drop Target Audience tables
DROP TABLE IF EXISTS target_audience_templates CASCADE;

-- Step 7: Drop SME enum types
DROP TYPE IF EXISTS sme_content_type;
DROP TYPE IF EXISTS sme_task_status;
DROP TYPE IF EXISTS sme_status;
DROP TYPE IF EXISTS sme_scope;

-- Step 8: Drop Target Audience enum types
DROP TYPE IF EXISTS experience_level;
DROP TYPE IF EXISTS target_audience_status;

-- Step 9: Update notification_type enum to remove SME-related values
-- Create new enum with only course-related notification types
CREATE TYPE notification_type_new AS ENUM (
    'outline_ready',           -- Course outline generation complete
    'generation_complete',     -- Course content generation complete
    'generation_failed',       -- Course generation failed
    'approval_requested'       -- Content awaiting approval
);

-- Update notifications table to use new enum
ALTER TABLE notifications
    ALTER COLUMN type TYPE notification_type_new
    USING (
        CASE type::text
            WHEN 'outline_ready' THEN 'outline_ready'::notification_type_new
            WHEN 'generation_complete' THEN 'generation_complete'::notification_type_new
            WHEN 'generation_failed' THEN 'generation_failed'::notification_type_new
            WHEN 'approval_requested' THEN 'approval_requested'::notification_type_new
            -- For removed types, default to 'outline_ready' (or delete those rows)
            ELSE 'outline_ready'::notification_type_new
        END
    );

-- Drop old enum and rename new one
DROP TYPE notification_type;
ALTER TYPE notification_type_new RENAME TO notification_type;
