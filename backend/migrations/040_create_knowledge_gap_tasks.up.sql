-- Create knowledge gap tasks table for tracking SME assignments
CREATE TABLE knowledge_gap_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    gap_description TEXT NOT NULL,
    assigned_to_user_id UUID NOT NULL REFERENCES users(id),
    assigned_by_user_id UUID NOT NULL REFERENCES users(id),
    target_team_id UUID REFERENCES teams(id),
    status TEXT NOT NULL DEFAULT 'pending',
    knowledge_source_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX idx_knowledge_gap_tasks_tenant ON knowledge_gap_tasks(tenant_id);
CREATE INDEX idx_knowledge_gap_tasks_course ON knowledge_gap_tasks(course_id);
CREATE INDEX idx_knowledge_gap_tasks_assigned_to ON knowledge_gap_tasks(assigned_to_user_id);
CREATE INDEX idx_knowledge_gap_tasks_status ON knowledge_gap_tasks(status);

-- Enable RLS
ALTER TABLE knowledge_gap_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policy: tenant isolation
CREATE POLICY knowledge_gap_tasks_isolation ON knowledge_gap_tasks
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());
