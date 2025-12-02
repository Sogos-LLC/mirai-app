-- Fix notifications RLS policy
-- The original policy required both tenant_id AND user_id but app.user_id was never set
-- Change to tenant-only isolation (consistent with other tables)
-- User-level filtering is handled by the application layer

-- Drop the existing policy
DROP POLICY IF EXISTS notifications_isolation ON notifications;

-- Create new policy with tenant-only isolation (matching other tables)
CREATE POLICY notifications_isolation ON notifications
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Drop the unused current_user_id function
DROP FUNCTION IF EXISTS current_user_id();
