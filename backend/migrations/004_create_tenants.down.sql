-- Rollback tenants table and helper functions

DROP FUNCTION IF EXISTS is_superadmin();
DROP FUNCTION IF EXISTS current_tenant_id();
DROP INDEX IF EXISTS idx_tenants_status;
DROP INDEX IF EXISTS idx_tenants_slug;
DROP TABLE IF EXISTS tenants;
