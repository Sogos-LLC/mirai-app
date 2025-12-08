-- Add positional flags for contextual course generation
-- These flags help the AI understand where each section/lesson is in the course structure

-- Add first/last section flags to outline_sections
ALTER TABLE outline_sections
ADD COLUMN is_first_section BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN is_last_section BOOLEAN NOT NULL DEFAULT FALSE;

-- Add first flags to outline_lessons (last flags already exist)
ALTER TABLE outline_lessons
ADD COLUMN is_first_in_section BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN is_first_in_course BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for querying first/last sections
CREATE INDEX idx_outline_sections_position_flags ON outline_sections(outline_id, is_first_section, is_last_section);

-- Create index for querying first/last lessons
CREATE INDEX idx_outline_lessons_position_flags ON outline_lessons(section_id, is_first_in_section, is_first_in_course);
