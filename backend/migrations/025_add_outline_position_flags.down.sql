-- Remove positional flags

DROP INDEX IF EXISTS idx_outline_sections_position_flags;
DROP INDEX IF EXISTS idx_outline_lessons_position_flags;

ALTER TABLE outline_sections
DROP COLUMN IF EXISTS is_first_section,
DROP COLUMN IF EXISTS is_last_section;

ALTER TABLE outline_lessons
DROP COLUMN IF EXISTS is_first_in_section,
DROP COLUMN IF EXISTS is_first_in_course;
