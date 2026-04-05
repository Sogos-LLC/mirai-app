-- Fix course_share_links RLS policy to allow superadmin bypass.
-- The original policy (migration 045) used raw current_setting and lacked the
-- is_superadmin() bypass that all other tables have. This prevents cross-tenant
-- public access (e.g. share link token verification) from working.

DROP POLICY IF EXISTS course_share_links_tenant_isolation ON course_share_links;

CREATE POLICY course_share_links_tenant_isolation ON course_share_links
    USING (tenant_id = current_tenant_id() OR is_superadmin());
