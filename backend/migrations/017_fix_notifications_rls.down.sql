-- Revert notifications RLS policy to original (user + tenant isolation)

-- Recreate the current_user_id function
CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.user_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- Drop the tenant-only policy
DROP POLICY IF EXISTS notifications_isolation ON notifications;

-- Recreate the original policy with user + tenant isolation
CREATE POLICY notifications_isolation ON notifications
    FOR ALL
    USING (
        (tenant_id = current_tenant_id() AND user_id = current_user_id())
        OR is_superadmin()
    )
    WITH CHECK (
        (tenant_id = current_tenant_id() AND user_id = current_user_id())
        OR is_superadmin()
    );
