-- Revert to original policy without superadmin bypass.
DROP POLICY IF EXISTS course_share_links_tenant_isolation ON course_share_links;

CREATE POLICY course_share_links_tenant_isolation ON course_share_links
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
