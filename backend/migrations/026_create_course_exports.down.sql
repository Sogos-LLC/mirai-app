-- Rollback: Drop course_exports table and related types

DROP TABLE IF EXISTS course_exports;
DROP TYPE IF EXISTS export_status;
DROP TYPE IF EXISTS export_format;
