-- Migration: 023_add_wizard_support.up.sql
-- Add support for course wizard and new component types

-- Add new component types to lesson_component_type enum
ALTER TYPE lesson_component_type ADD VALUE IF NOT EXISTS 'code';
ALTER TYPE lesson_component_type ADD VALUE IF NOT EXISTS 'callout';

-- Add heading levels h5, h6
ALTER TYPE heading_level ADD VALUE IF NOT EXISTS 'h5';
ALTER TYPE heading_level ADD VALUE IF NOT EXISTS 'h6';

-- Callout style enum for callout components
CREATE TYPE callout_style AS ENUM ('info', 'warning', 'success', 'error', 'tip');

-- Tone detail level enum for wizard
CREATE TYPE tone_detail_level AS ENUM ('brief', 'moderate', 'comprehensive');

-- Wizard state table for saving progress between sessions
-- Each user can have only one active wizard state at a time
CREATE TABLE wizard_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Current wizard step
    current_step VARCHAR(50) NOT NULL DEFAULT 'courseName',

    -- Store wizard data as JSONB for flexibility
    -- Contains: courseName, improvedTitle, description, smePersonas,
    -- selectedSmeIds, audiencePersonas, selectedAudienceIds,
    -- toneOptions, selectedToneId, additionalContext
    data JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active wizard per user per tenant
CREATE UNIQUE INDEX idx_wizard_states_user ON wizard_states(tenant_id, user_id);

-- Index for tenant-based queries
CREATE INDEX idx_wizard_states_tenant ON wizard_states(tenant_id);

-- Enable Row Level Security
ALTER TABLE wizard_states ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their own wizard states within their tenant
CREATE POLICY wizard_states_isolation ON wizard_states
    FOR ALL
    USING (tenant_id = current_tenant_id() OR is_superadmin())
    WITH CHECK (tenant_id = current_tenant_id() OR is_superadmin());

-- Add persona columns to course_generation_inputs for wizard data storage
-- These store the final selected personas and tone when outline is generated
ALTER TABLE course_generation_inputs
    ADD COLUMN IF NOT EXISTS sme_personas JSONB,
    ADD COLUMN IF NOT EXISTS audience_personas JSONB,
    ADD COLUMN IF NOT EXISTS tone_option JSONB,
    ADD COLUMN IF NOT EXISTS course_description TEXT;

-- Comments for documentation
COMMENT ON TABLE wizard_states IS 'Stores wizard progress for course creation, allowing users to resume later';
COMMENT ON COLUMN wizard_states.current_step IS 'Current wizard step: courseName, titleDescription, smeSelection, audienceSelection, toneSelection, additionalContext, generateOutline, outlineReview';
COMMENT ON COLUMN wizard_states.data IS 'JSONB containing all wizard form data accumulated across steps';
COMMENT ON COLUMN course_generation_inputs.sme_personas IS 'Selected SME personas from wizard as JSONB array';
COMMENT ON COLUMN course_generation_inputs.audience_personas IS 'Selected audience personas from wizard as JSONB array';
COMMENT ON COLUMN course_generation_inputs.tone_option IS 'Selected tone option from wizard as JSONB object';
