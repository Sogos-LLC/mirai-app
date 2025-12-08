-- Migration: 023_add_wizard_support.down.sql
-- Rollback wizard support (WARNING: destructive - enum values cannot be removed in PostgreSQL)

-- Remove columns from course_generation_inputs
ALTER TABLE course_generation_inputs
    DROP COLUMN IF EXISTS sme_personas,
    DROP COLUMN IF EXISTS audience_personas,
    DROP COLUMN IF EXISTS tone_option,
    DROP COLUMN IF EXISTS course_description;

-- Drop wizard_states table
DROP TABLE IF EXISTS wizard_states;

-- Drop enums (only if not used by any columns)
DROP TYPE IF EXISTS tone_detail_level;
DROP TYPE IF EXISTS callout_style;

-- NOTE: Cannot remove values from lesson_component_type or heading_level enums
-- PostgreSQL does not support removing enum values
-- The 'code', 'callout', 'h5', 'h6' values will remain in the enum
