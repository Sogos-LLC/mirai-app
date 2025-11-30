-- Create Kratos database and user
CREATE USER kratos WITH PASSWORD 'kratoslocal';
CREATE DATABASE kratos OWNER kratos;
GRANT ALL PRIVILEGES ON DATABASE kratos TO kratos;

-- Create Mirai database and user
CREATE USER mirai WITH PASSWORD 'mirailocal';
CREATE DATABASE mirai OWNER mirai;
GRANT ALL PRIVILEGES ON DATABASE mirai TO mirai;

-- Connect to mirai database and create schema
\c mirai

-- Companies (Organizations)
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

-- Index for Stripe customer lookup (used by webhooks)
CREATE INDEX IF NOT EXISTS idx_companies_stripe_customer_id ON companies(stripe_customer_id);

-- Users (linked to Kratos identities)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kratos_id UUID NOT NULL UNIQUE,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT role_check CHECK (role IN ('owner', 'admin', 'member'))
);

-- Teams (within companies)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Team Memberships
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, user_id),
    CONSTRAINT team_role_check CHECK (role IN ('lead', 'member'))
);

-- Invitations (to join a company)
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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_kratos_id ON users(kratos_id);
CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_teams_company_id ON teams(company_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invitations_company_id ON invitations(company_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON invitations(status);

-- Grant privileges to mirai user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mirai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mirai;
