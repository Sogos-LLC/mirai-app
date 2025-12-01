-- Rollback to original schema without tenant_id
-- NOTE: This will lose all data since we're dropping and recreating tables

DROP TABLE IF EXISTS pending_registrations CASCADE;
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS companies CASCADE;

-- Recreate original tables (from 001_initial_schema.up.sql)
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    team_size VARCHAR(50),
    plan VARCHAR(20) NOT NULL DEFAULT 'starter',
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'none',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT plan_check CHECK (plan IN ('starter', 'pro', 'enterprise'))
);

CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id ON companies(stripe_customer_id);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kratos_id UUID NOT NULL UNIQUE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT role_check CHECK (role IN ('owner', 'admin', 'member'))
);

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, user_id),
    CONSTRAINT team_role_check CHECK (role IN ('lead', 'member'))
);

CREATE TABLE IF NOT EXISTS invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    token VARCHAR(255) NOT NULL UNIQUE,
    invited_by_user_id UUID REFERENCES users(id) NOT NULL,
    accepted_by_user_id UUID REFERENCES users(id),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT invitation_role_check CHECK (role IN ('owner', 'admin', 'member')),
    CONSTRAINT invitation_status_check CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS idx_users_kratos_id ON users(kratos_id);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_company_id ON invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Recreate pending_registrations from 003
CREATE TABLE pending_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_session_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    team_size VARCHAR(50),
    plan VARCHAR(20) NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
    seat_count INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'provisioning', 'failed')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pending_registrations_checkout_session ON pending_registrations(checkout_session_id);
CREATE INDEX idx_pending_registrations_expires_at ON pending_registrations(expires_at);
CREATE INDEX idx_pending_registrations_status ON pending_registrations(status) WHERE status = 'paid';
CREATE INDEX idx_pending_registrations_email ON pending_registrations(email);

-- Re-add seat_count from migration 002
ALTER TABLE companies ADD COLUMN IF NOT EXISTS seat_count INTEGER DEFAULT 0;
