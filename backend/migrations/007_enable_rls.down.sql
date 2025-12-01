-- Rollback RLS policies

-- Drop all policies
DROP POLICY IF EXISTS pending_registrations_isolation ON pending_registrations;
DROP POLICY IF EXISTS scorm_isolation ON scorm_packages;
DROP POLICY IF EXISTS lessons_isolation ON lessons;
DROP POLICY IF EXISTS modules_isolation ON course_modules;
DROP POLICY IF EXISTS courses_isolation ON courses;
DROP POLICY IF EXISTS invitations_isolation ON invitations;
DROP POLICY IF EXISTS team_members_isolation ON team_members;
DROP POLICY IF EXISTS teams_isolation ON teams;
DROP POLICY IF EXISTS users_isolation ON users;
DROP POLICY IF EXISTS companies_isolation ON companies;
DROP POLICY IF EXISTS tenants_isolation ON tenants;

-- Disable RLS on all tables
ALTER TABLE pending_registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE scorm_packages DISABLE ROW LEVEL SECURITY;
ALTER TABLE lessons DISABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules DISABLE ROW LEVEL SECURITY;
ALTER TABLE courses DISABLE ROW LEVEL SECURITY;
ALTER TABLE invitations DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE teams DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE tenants DISABLE ROW LEVEL SECURITY;
