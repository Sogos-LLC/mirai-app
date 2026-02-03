-- Drop course audit log table
DROP POLICY IF EXISTS course_audit_log_isolation ON course_audit_log;
DROP TABLE IF EXISTS course_audit_log;
