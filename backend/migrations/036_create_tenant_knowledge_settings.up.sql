-- Tenant Knowledge Settings table for RAG/knowledge configuration
-- Separate from AI Settings to keep concerns isolated

CREATE TABLE tenant_knowledge_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,

    -- Allow courses to use global (tenant-wide) knowledge sources
    allow_global_knowledge BOOLEAN NOT NULL DEFAULT true,

    -- Threshold for low grounding warnings (0.0-1.0)
    low_grounding_threshold REAL NOT NULL DEFAULT 0.6,

    -- Enforce internal data only mode for all courses
    -- When true, courses cannot use AI-synthesized content
    enforce_internal_only BOOLEAN NOT NULL DEFAULT false,

    -- Require curriculum map approval before lesson generation
    require_curriculum_approval BOOLEAN NOT NULL DEFAULT true,

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID REFERENCES users(id)
);

CREATE INDEX idx_tenant_knowledge_settings_tenant ON tenant_knowledge_settings(tenant_id);

-- Enable RLS
ALTER TABLE tenant_knowledge_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY tenant_knowledge_settings_isolation ON tenant_knowledge_settings
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
