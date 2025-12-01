-- Rebuild core tables with tenant_id support
-- This migration drops existing tables (test data only) and recreates with tenant isolation
-- NOTE: Production is still in prototype phase - all existing data can be deleted

-- Drop existing tables in correct order (respecting foreign keys)
DROP TABLE IF EXISTS pending_registrations CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- Recreate companies with tenant_id
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    team_size VARCHAR(50),
    plan VARCHAR(20) NOT NULL DEFAULT 'starter',
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50) NOT NULL DEFAULT 'none',
    seat_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT plan_check CHECK (plan IN ('starter', 'pro', 'enterprise')),
    CONSTRAINT subscription_status_check CHECK (subscription_status IN ('none', 'active', 'past_due', 'canceled'))
);

CREATE INDEX idx_companies_tenant_id ON companies(tenant_id);
CREATE INDEX idx_companies_stripe_customer_id ON companies(stripe_customer_id);

-- Recreate users with tenant_id and new LMS roles
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    kratos_id UUID NOT NULL UNIQUE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'instructor',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT role_check CHECK (role IN ('admin', 'instructor', 'sme'))
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_kratos_id ON users(kratos_id);
CREATE INDEX idx_users_company_id ON users(company_id);

-- Recreate teams with tenant_id
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_tenant_id ON teams(tenant_id);
CREATE INDEX idx_teams_company_id ON teams(company_id);

-- Recreate team_members with tenant_id
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(team_id, user_id),
    CONSTRAINT team_role_check CHECK (role IN ('lead', 'member'))
);

CREATE INDEX idx_team_members_tenant_id ON team_members(tenant_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- Recreate invitations with tenant_id and new LMS roles
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    token VARCHAR(255) NOT NULL UNIQUE,
    invited_by_user_id UUID REFERENCES users(id),
    accepted_by_user_id UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT invitation_role_check CHECK (role IN ('admin', 'instructor', 'sme')),
    CONSTRAINT invitation_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX idx_invitations_tenant_id ON invitations(tenant_id);
CREATE INDEX idx_invitations_company_id ON invitations(company_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_status ON invitations(status);

-- Recreate pending_registrations with tenant_id (nullable during registration flow)
CREATE TABLE pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id),
    checkout_session_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    team_size VARCHAR(50),
    plan VARCHAR(20) NOT NULL,
    seat_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT pending_plan_check CHECK (plan IN ('starter', 'pro', 'enterprise')),
    CONSTRAINT pending_status_check CHECK (status IN ('pending', 'paid', 'provisioning', 'failed'))
);

CREATE INDEX idx_pending_registrations_checkout ON pending_registrations(checkout_session_id);
CREATE INDEX idx_pending_registrations_email ON pending_registrations(email);
CREATE INDEX idx_pending_registrations_expires_at ON pending_registrations(expires_at);
CREATE INDEX idx_pending_registrations_status ON pending_registrations(status) WHERE status = 'paid';
