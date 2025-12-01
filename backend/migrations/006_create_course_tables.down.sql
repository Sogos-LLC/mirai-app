-- Rollback course tables

DROP INDEX IF EXISTS idx_scorm_status;
DROP INDEX IF EXISTS idx_scorm_course;
DROP INDEX IF EXISTS idx_scorm_tenant;
DROP TABLE IF EXISTS scorm_packages;

DROP INDEX IF EXISTS idx_lessons_position;
DROP INDEX IF EXISTS idx_lessons_module;
DROP INDEX IF EXISTS idx_lessons_tenant;
DROP TABLE IF EXISTS lessons;

DROP INDEX IF EXISTS idx_modules_position;
DROP INDEX IF EXISTS idx_modules_course;
DROP INDEX IF EXISTS idx_modules_tenant;
DROP TABLE IF EXISTS course_modules;

DROP INDEX IF EXISTS idx_courses_folder_path;
DROP INDEX IF EXISTS idx_courses_status;
DROP INDEX IF EXISTS idx_courses_created_by;
DROP INDEX IF EXISTS idx_courses_team;
DROP INDEX IF EXISTS idx_courses_company;
DROP INDEX IF EXISTS idx_courses_tenant;
DROP TABLE IF EXISTS courses;
