# Mirai Authentication & User Management Build Plan

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Cloudflare Tunnel                                │
├─────────────────┬─────────────────┬──────────────────────┬──────────────────┤
│ get-mirai.sogos │ mirai.sogos.io  │ mirai-auth.sogos.io  │ mirai-api.sogos  │
│ (Landing Page)  │ (App Frontend)  │ (Kratos Auth)        │ (Go Backend)     │
└─────────────────┴─────────────────┴──────────────────────┴──────────────────┘
         │                  │                 │               │
         ▼                  ▼                 ▼               ▼
┌─────────────────────────────────┐  ┌──────────────┐  ┌──────────────┐
│     Next.js Frontend            │  │    Kratos    │  │  Go Backend  │
│     (mirai namespace)           │  │  (kratos ns) │  │  (mirai ns)  │
└─────────────────────────────────┘  └──────┬───────┘  └──────┬───────┘
                                            │                 │
                                            ▼                 ▼
                                   ┌──────────────┐  ┌──────────────┐
                                   │  Kratos DB   │  │   App DB     │
                                   │ (postgres ns)│  │  (mirai ns)  │
                                   └──────────────┘  └──────────────┘
```

---

## Current Status (Completed)

### Infrastructure - DEPLOYED
- **PostgreSQL (Kratos)**: Running in `postgres` namespace with NFS storage
- **Ory Kratos**: Running in `kratos` namespace (Helm deployment)
- **Cloudflare Tunnel**: Configured for domains
- **Mailgun**: Configured for email delivery (sandbox domain)

### Frontend Auth - IMPLEMENTED
- All auth pages: login, registration, recovery, verification, settings, error
- Kratos client library with full flow support
- Auth Redux slice with session management
- Route protection middleware
- ProfileDropdown component in Header
- Landing page with Hero, Features, PricingCards (3 tiers), Footer

### Domains
| Domain | Purpose | Status |
|--------|---------|--------|
| `get-mirai.sogos.io` | Marketing landing page | Configured |
| `mirai.sogos.io` | Authenticated application | Configured |
| `mirai-auth.sogos.io` | Kratos public API | Configured |
| `mirai-api.sogos.io` | Go Backend API | **NEW - To be added** |

---

## Data Model

### Identity (Kratos Traits - for authentication)
```json
{
  "email": "string (login identifier)",
  "name": { "first": "string", "last": "string" }
}
```

### Application Database Schema (Go Backend)

```sql
-- Companies (Organizations)
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    plan VARCHAR(20) NOT NULL DEFAULT 'starter', -- starter, pro, enterprise
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Users (linked to Kratos identities)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kratos_id UUID NOT NULL UNIQUE,  -- Links to Kratos identity
    company_id UUID REFERENCES companies(id),
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- owner, admin, member
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Teams (within companies)
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Team Memberships
CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID REFERENCES teams(id) NOT NULL,
    user_id UUID REFERENCES users(id) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member', -- lead, member
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);
```

### Hierarchy
```
Company (Organization)
  ├── Users (owner, admin, member)
  └── Teams
      └── Team Members (lead, member)
```

---

## Pricing Tiers (Landing Page)

| Tier | Price | Key Features |
|------|-------|--------------|
| **Starter** | $29/mo | 5 team members, 10 courses, basic analytics |
| **Pro** | $99/mo | 25 team members, unlimited courses, AI generation, SSO |
| **Enterprise** | Custom | Unlimited everything, white-label, SLA |

---

## Implementation Plan

### Phase 1: Go Backend Service

#### 1.1 Project Structure
```
backend/
├── cmd/
│   └── server/
│       └── main.go           # Entry point
├── internal/
│   ├── config/
│   │   └── config.go         # Environment config
│   ├── database/
│   │   ├── postgres.go       # DB connection
│   │   └── migrations/       # SQL migrations
│   ├── handlers/
│   │   ├── health.go         # Health checks
│   │   ├── company.go        # Company endpoints
│   │   ├── team.go           # Team endpoints
│   │   └── user.go           # User endpoints
│   ├── middleware/
│   │   └── auth.go           # Kratos session validation
│   ├── models/
│   │   └── models.go         # Data structures
│   └── repository/
│       ├── company.go        # Company DB operations
│       ├── team.go           # Team DB operations
│       └── user.go           # User DB operations
├── Dockerfile
├── go.mod
└── go.sum
```

#### 1.2 Go Framework
Use **Gin** - lightweight, fast, well-documented:
```go
// Example structure
r := gin.Default()
r.Use(middleware.KratosAuth())  // Validate Kratos session

api := r.Group("/api/v1")
{
    api.GET("/me", handlers.GetCurrentUser)
    api.GET("/company", handlers.GetCompany)
    api.GET("/teams", handlers.ListTeams)
    api.POST("/teams", handlers.CreateTeam)
    api.GET("/teams/:id/members", handlers.ListTeamMembers)
    api.POST("/teams/:id/members", handlers.AddTeamMember)
}
```

#### 1.3 Kratos Auth Middleware
```go
func KratosAuth() gin.HandlerFunc {
    return func(c *gin.Context) {
        // Forward cookies to Kratos /sessions/whoami
        resp, err := http.Get(kratosURL + "/sessions/whoami",
            cookies: c.Request.Cookies())
        if err != nil || resp.StatusCode != 200 {
            c.AbortWithStatusJSON(401, gin.H{"error": "unauthorized"})
            return
        }
        // Extract kratos_id and add to context
        c.Set("kratos_id", session.Identity.ID)
        c.Next()
    }
}
```

#### 1.4 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/me` | Get current user + company |
| POST | `/api/v1/onboard` | Create company/user after registration |
| GET | `/api/v1/company` | Get company details |
| PUT | `/api/v1/company` | Update company |
| GET | `/api/v1/teams` | List teams in company |
| POST | `/api/v1/teams` | Create team |
| GET | `/api/v1/teams/:id` | Get team details |
| PUT | `/api/v1/teams/:id` | Update team |
| DELETE | `/api/v1/teams/:id` | Delete team |
| GET | `/api/v1/teams/:id/members` | List team members |
| POST | `/api/v1/teams/:id/members` | Add member to team |
| DELETE | `/api/v1/teams/:id/members/:uid` | Remove member |

### Phase 2: App Database (PostgreSQL)

#### 2.1 K8s Deployment
```yaml
# k8s/mirai-db/postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mirai-db
  namespace: mirai
spec:
  # Similar to Kratos DB but separate instance
  # Uses same NFS storage pattern
```

#### 2.2 Database Migrations
Use golang-migrate for schema management.

### Phase 3: Frontend Integration

#### 3.1 API Client
```typescript
// frontend/src/lib/api/client.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL; // https://mirai-api.sogos.io

export async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include', // Send cookies for auth
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}
```

#### 3.2 Onboarding Flow
After Kratos registration:
1. User completes Kratos flow → session created
2. Frontend calls `POST /api/v1/onboard` with company name + selected tier
3. Backend creates company + user records
4. Redirect to dashboard

#### 3.3 Teams UI
- Add Teams page at `/teams`
- List teams with member count
- Create/edit team modals
- Team member management

### Phase 4: Cloudflare Tunnel Update
Add `mirai-api.sogos.io` route:
```yaml
- hostname: mirai-api.sogos.io
  service: http://mirai-backend.mirai.svc.cluster.local:8080
```

---

## Test User Setup

After deployment, register test user:
- **Email**: sojohnnysaid@gmail.com
- **Password**: password
- **Name**: John Said
- **Company**: Test Company
- **Plan**: Pro (selected during registration)

### Mock Payment Flow
1. User clicks "Get Started" on Pro tier → `/auth/registration?tier=pro`
2. Complete Kratos registration form
3. Verify email (code sent to sojohnnysaid@gmail.com)
4. After verification, redirect to `/onboard`
5. Onboard page shows "Complete Setup" with company name field
6. Submit → creates company + user in app DB
7. Redirect to dashboard

---

## Manual Testing Checklist

### Landing Page (get-mirai.sogos.io)
- [ ] Hero section displays correctly
- [ ] Features section shows 6 feature cards
- [ ] Pricing section shows 3 tiers
- [ ] "Get Started" buttons link to registration with tier parameter
- [ ] Sign In link works
- [ ] Footer links are present

### Registration Flow
- [ ] Navigate to `/auth/registration?tier=pro`
- [ ] Fill form: email, password, first name, last name
- [ ] Submit form successfully
- [ ] Receive verification email (check inbox - sojohnnysaid@gmail.com)
- [ ] Verify email via code
- [ ] Redirected to onboarding page
- [ ] Enter company name, submit
- [ ] Company + user created in app DB
- [ ] Redirected to dashboard

### Login Flow
- [ ] Navigate to `/auth/login`
- [ ] Enter credentials
- [ ] Successfully logged in
- [ ] Redirected to dashboard
- [ ] Session persists on page refresh

### Profile Management
- [ ] Click profile icon in header
- [ ] Dropdown shows user name, email, company
- [ ] "Profile" link goes to settings
- [ ] "Sign Out" logs user out
- [ ] Redirected to landing page after logout

### Teams Management
- [ ] Navigate to `/teams`
- [ ] View list of teams (empty initially)
- [ ] Create new team
- [ ] Edit team name/description
- [ ] Add members to team
- [ ] Remove members from team
- [ ] Delete team

### Password Recovery
- [ ] Navigate to `/auth/recovery`
- [ ] Enter email address
- [ ] Receive recovery code (Mailgun)
- [ ] Enter code and set new password
- [ ] Login with new password works

### Route Protection
- [ ] Unauthenticated user visiting `/dashboard` redirected to login
- [ ] Authenticated user visiting `/auth/login` redirected to dashboard
- [ ] API calls without session return 401

---

## Critical Files to Create/Modify

### NEW: Go Backend
```
backend/
├── cmd/server/main.go
├── internal/config/config.go
├── internal/database/postgres.go
├── internal/database/migrations/*.sql
├── internal/handlers/*.go
├── internal/middleware/auth.go
├── internal/models/models.go
├── internal/repository/*.go
├── Dockerfile
├── go.mod
```

### NEW: App Database (K8s)
- `k8s/mirai-db/postgres-deployment.yaml`
- `k8s/mirai-db/postgres-secret.yaml`

### NEW: Backend K8s Deployment
- `k8s/backend/deployment.yaml`
- `k8s/backend/service.yaml`

### MODIFY: Frontend
- `frontend/src/lib/api/client.ts` - API client for backend
- `frontend/src/app/(main)/teams/page.tsx` - Teams page
- `frontend/src/app/(main)/onboard/page.tsx` - Onboarding after registration
- `frontend/src/components/teams/*` - Team UI components
- `frontend/src/store/slices/teamsSlice.ts` - Teams state

### MODIFY: Cloudflare Tunnel
- `homelab-platform/ingress/cloudflared-config.yaml` - Add mirai-api.sogos.io

### MODIFY: Kratos Identity Schema
- `k8s/kratos/values.yaml` - Remove company from traits (moved to app DB)

---

## Email Configuration

**Provider**: Mailgun (sandbox domain)
- **Domain**: sandbox6ade5f2c47a34afe88831b61b113fba5.mailgun.org
- **Authorized Recipient**: sojohnnysaid@gmail.com (sandbox limitation)
- **Note**: Only authorized recipients can receive emails in sandbox mode

---

## Implementation Order

1. **Update Kratos Identity Schema** - Remove company traits
2. **Deploy App Database** - New PostgreSQL for mirai namespace
3. **Build Go Backend** - Gin server with Kratos auth middleware
4. **Deploy Backend** - K8s deployment + service
5. **Update Cloudflare Tunnel** - Add api.sogos.io route
6. **Update Frontend** - API client, onboarding flow, teams UI
7. **Build & Deploy Frontend** - Docker build + k8s rollout
8. **Manual Testing** - Full flow with test user

---

## Post-MVP Enhancements

1. **Stripe Integration**: Real payment processing for tier upgrades
2. **Team Invitations**: Email invites with acceptance flow
3. **Production Email**: Verified Mailgun domain
4. **Role Permissions**: Granular access control in frontend/backend
5. **Audit Logging**: Track user actions for compliance
