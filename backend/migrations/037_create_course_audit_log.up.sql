-- Course Audit Log table for tracking approval and generation actions
-- Provides an audit trail for compliance and debugging

CREATE TABLE course_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id UUID NOT NULL,  -- Not a FK since course may be deleted

    -- Action type: outline_approved, curriculum_approved, curriculum_override,
    -- lessons_generated, knowledge_locked, outline_rejected, etc.
    action VARCHAR(50) NOT NULL,

    -- Who performed the action
    actor_id UUID NOT NULL REFERENCES users(id),

    -- Additional context (JSON)
    -- e.g., {"section_count": 5, "lesson_count": 20, "warnings_acknowledged": true}
    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_course_audit_log_tenant ON course_audit_log(tenant_id);
CREATE INDEX idx_course_audit_log_course ON course_audit_log(course_id, created_at DESC);
CREATE INDEX idx_course_audit_log_actor ON course_audit_log(actor_id);
CREATE INDEX idx_course_audit_log_action ON course_audit_log(action);

-- Enable RLS
ALTER TABLE course_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY course_audit_log_isolation ON course_audit_log
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
