-- Rollback: Revert to original RLS policy (without superadmin bypass)

DROP POLICY IF EXISTS course_exports_tenant_isolation ON course_exports;

CREATE POLICY course_exports_tenant_isolation ON course_exports
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
