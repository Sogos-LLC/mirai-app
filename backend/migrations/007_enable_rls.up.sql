-- Enable Row Level Security for tenant isolation
-- Application must set app.tenant_id session variable before queries

-- Enable RLS on all tenant-scoped tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE scorm_packages ENABLE ROW LEVEL SECURITY;

-- Tenants: users can only see their own tenant, superadmin sees all
CREATE POLICY tenants_isolation ON tenants
    FOR ALL
    USING (id = current_tenant_id() OR is_superadmin());

-- Companies: tenant isolation
CREATE POLICY companies_isolation ON companies
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Users: tenant isolation
CREATE POLICY users_isolation ON users
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Teams: tenant isolation
CREATE POLICY teams_isolation ON teams
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Team members: tenant isolation
CREATE POLICY team_members_isolation ON team_members
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Invitations: tenant isolation with special case for token lookup
-- Allow public token lookup without tenant context (for invitation acceptance)
CREATE POLICY invitations_isolation ON invitations
    FOR ALL
    USING (
        tenant_id = current_tenant_id()
        OR is_superadmin()
        OR (current_tenant_id() IS NULL AND token IS NOT NULL)
    )
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Courses: tenant isolation
CREATE POLICY courses_isolation ON courses
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Course modules: tenant isolation
CREATE POLICY modules_isolation ON course_modules
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Lessons: tenant isolation
CREATE POLICY lessons_isolation ON lessons
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- SCORM packages: tenant isolation
CREATE POLICY scorm_isolation ON scorm_packages
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- pending_registrations: special case - pre-tenant records
-- These are created before tenant assignment, allow superadmin and null tenant_id
ALTER TABLE pending_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_registrations_isolation ON pending_registrations
    FOR ALL
    USING (
        is_superadmin()
        OR tenant_id = current_tenant_id()
        OR tenant_id IS NULL
    )
    WITH CHECK (is_superadmin() OR tenant_id IS NULL);
