-- Drop course content tables - moving all content to MinIO
-- Keep: generation_jobs (job tracking), tenant_ai_settings (API keys), courses (metadata)

-- First remove foreign key constraints
ALTER TABLE generation_jobs DROP CONSTRAINT IF EXISTS fk_generation_jobs_lesson;
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS lesson_id;
ALTER TABLE generation_jobs DROP COLUMN IF EXISTS outline_lesson_id;

-- Drop RLS policies first
DROP POLICY IF EXISTS lesson_components_isolation ON lesson_components;
DROP POLICY IF EXISTS generated_lessons_isolation ON generated_lessons;
DROP POLICY IF EXISTS outline_lessons_isolation ON outline_lessons;
DROP POLICY IF EXISTS outline_sections_isolation ON outline_sections;
DROP POLICY IF EXISTS course_outlines_isolation ON course_outlines;
DROP POLICY IF EXISTS course_gen_inputs_isolation ON course_generation_inputs;

-- Drop tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS lesson_components CASCADE;
DROP TABLE IF EXISTS generated_lessons CASCADE;
DROP TABLE IF EXISTS outline_lessons CASCADE;
DROP TABLE IF EXISTS outline_sections CASCADE;
DROP TABLE IF EXISTS course_outlines CASCADE;
DROP TABLE IF EXISTS course_generation_inputs CASCADE;

-- Drop enums that are no longer needed
DROP TYPE IF EXISTS outline_approval_status CASCADE;
DROP TYPE IF EXISTS lesson_component_type CASCADE;
DROP TYPE IF EXISTS heading_level CASCADE;
