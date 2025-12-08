-- Migration: Fix RLS policy on course_exports table
-- The original policy was missing the superadmin bypass that other tables have.
-- This is needed for the polling mechanism that catches orphaned jobs across tenants.

-- Drop the old policy
DROP POLICY IF EXISTS course_exports_tenant_isolation ON course_exports;

-- Create the corrected policy with superadmin bypass
-- is_superadmin() checks if app.is_superadmin session variable is set to 'true'
-- current_tenant_id() returns the app.tenant_id session variable as UUID
CREATE POLICY course_exports_tenant_isolation ON course_exports
    USING ((tenant_id = current_tenant_id()) OR is_superadmin());
