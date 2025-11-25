# Authentication Implementation Plan - Ory Kratos

## Overview

Implement user authentication for Mirai SaaS application using Ory Kratos for identity management.

**Domains:**
- `get-mirai.sogos.io` - Public landing page (tier selection, marketing)
- `mirai.sogos.io` - Authenticated application
- `mirai-auth.sogos.io` - Kratos public API (for browser flows)
- `mailhog.sogos.io` - Email testing interface (dev only)

---

## Phase 1: Infrastructure (Kubernetes)

### 1.1 PostgreSQL Deployment
Create `k8s/postgres/` directory with:
- **Deployment**: PostgreSQL 15 Alpine container
- **PVC**: 10Gi NFS storage (`nfs-client` storage class)
- **Service**: ClusterIP on port 5432
- **Secret**: Database credentials (username, password, database name)
- **ConfigMap**: PostgreSQL configuration
- **Namespace**: `postgres` (or shared `data` namespace)

### 1.2 Ory Kratos Deployment (Helm)
```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm install kratos ory/kratos -f k8s/kratos/values.yaml -n kratos
```

Create `k8s/kratos/values.yaml` with:
- DSN pointing to PostgreSQL (via secretKeyRef)
- Identity schema with email + company/team traits
- SMTP connection to MailHog
- Self-service URLs pointing to frontend auth pages
- Browser return URLs to mirai.sogos.io

**Identity Schema** (stored in traits):
```json
{
  "traits": {
    "email": "string (identifier, recovery, verification)",
    "name": {
      "first": "string",
      "last": "string"
    },
    "company": {
      "name": "string",
      "role": "string (owner|admin|member)"
    }
  }
}
```

### 1.3 MailHog Deployment
Create `k8s/mailhog/` directory with:
- **Deployment**: mailhog/mailhog container
- **Service**: ClusterIP (SMTP: 1025, Web UI: 8025)
- **Namespace**: `mailhog`

### 1.4 Update Cloudflare Tunnel Config
Add to `homelab-platform/ingress/cloudflared-config.yaml`:
```yaml
- hostname: get-mirai.sogos.io
  service: http://mirai-frontend.mirai.svc.cluster.local:80
- hostname: auth.sogos.io
  service: http://kratos-public.kratos.svc.cluster.local:80
- hostname: mailhog.sogos.io
  service: http://mailhog.mailhog.svc.cluster.local:8025
```

---

## Phase 2: Frontend - Auth Pages

### 2.1 New Route Structure
```
frontend/src/app/
├── (public)/                    # NEW: Public routes (no auth required)
│   ├── layout.tsx              # Minimal layout (no sidebar)
│   ├── page.tsx                # Landing page (get-mirai.sogos.io)
│   ├── pricing/page.tsx        # Pricing tiers
│   └── auth/
│       ├── login/page.tsx      # Login form
│       ├── registration/page.tsx # Registration form
│       ├── recovery/page.tsx   # Password reset request
│       ├── verification/page.tsx # Email verification
│       └── settings/page.tsx   # Account settings (post-login)
├── (main)/                      # Existing: Protected routes
│   └── ... (existing pages)
└── api/
    └── auth/                    # NEW: Auth API routes
        ├── session/route.ts    # Get current session
        ├── logout/route.ts     # Logout handler
        └── whoami/route.ts     # Current user info
```

### 2.2 Landing Page Components
Create `frontend/src/components/landing/`:
- **Hero.tsx**: Main hero section with CTA
- **PricingCards.tsx**: 3-tier pricing display (Starter/Pro/Enterprise)
- **Features.tsx**: Feature highlights
- **Footer.tsx**: Public page footer
- **Navbar.tsx**: Public navigation (Login/Sign Up buttons)

### 2.3 Auth Form Components
Create `frontend/src/components/auth/`:
- **LoginForm.tsx**: Email/password login (integrates with Kratos flow)
- **RegistrationForm.tsx**: Registration with company name
- **RecoveryForm.tsx**: Password reset request
- **VerificationForm.tsx**: Email verification handling
- **AuthLayout.tsx**: Centered card layout for auth pages

---

## Phase 3: Frontend - Auth Integration

### 3.1 Kratos Client Library
Create `frontend/src/lib/kratos/`:
- **client.ts**: Kratos SDK initialization
- **flows.ts**: Helper functions for self-service flows
- **session.ts**: Session management utilities
- **types.ts**: TypeScript types for Kratos responses

### 3.2 Auth Redux Slice
Create `frontend/src/store/slices/authSlice.ts`:
```typescript
interface AuthState {
  session: Session | null;
  user: Identity | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
```

Actions:
- `checkSession` - Verify current session with Kratos
- `logout` - End session
- `setUser` - Update user state

### 3.3 Auth Middleware
Create `frontend/src/middleware.ts`:
- Protect `(main)` routes - redirect to login if no session
- Allow `(public)` routes without auth
- Check session via Kratos whoami endpoint

### 3.4 Header Profile Component
Update `frontend/src/components/layout/Header.tsx`:
- Add profile dropdown (right side)
- Show user name/email
- Menu items: Account Settings, Logout
- Use Lucide icons (User, Settings, LogOut)

---

## Phase 4: Environment Configuration

### 4.1 New Environment Variables
Add to frontend deployment:
```yaml
- name: KRATOS_PUBLIC_URL
  value: "http://kratos-public.kratos.svc.cluster.local:80"
- name: KRATOS_BROWSER_URL
  value: "https://auth.sogos.io"
- name: APP_URL
  value: "https://mirai.sogos.io"
- name: LANDING_URL
  value: "https://get-mirai.sogos.io"
```

### 4.2 Next.js Configuration
Update `next.config.js`:
- Add rewrites/redirects for auth flows
- Configure allowed domains for cookies

---

## Phase 5: Data Model (Future)

### 5.1 Company/Team Service (Deferred)
For complex team management, create separate backend service:
- PostgreSQL tables: companies, teams, memberships
- REST API for CRUD operations
- Kratos webhooks for user lifecycle events

For MVP, store basic company info in Kratos identity traits.

---

## Implementation Order

1. **Infrastructure First**
   - [ ] Deploy PostgreSQL
   - [ ] Deploy Kratos with Helm
   - [ ] Deploy MailHog
   - [ ] Update Cloudflare tunnel config

2. **Frontend Auth Pages**
   - [ ] Create (public) route group with layout
   - [ ] Build landing page
   - [ ] Build login/registration forms
   - [ ] Build password recovery flow

3. **Auth Integration**
   - [ ] Add Kratos client library
   - [ ] Create auth Redux slice
   - [ ] Implement middleware for route protection
   - [ ] Add profile dropdown to Header

4. **Testing & Polish**
   - [ ] Test full registration flow
   - [ ] Test login/logout flow
   - [ ] Test password recovery via MailHog
   - [ ] Test protected route redirects

---

## Files to Create/Modify

### New Files
```
k8s/
├── postgres/
│   ├── postgres-deployment.yaml
│   ├── postgres-secret.yaml.template
│   └── kustomization.yaml
├── kratos/
│   ├── values.yaml
│   ├── kratos-secret.yaml.template
│   └── identity-schema.json
├── mailhog/
│   └── mailhog-deployment.yaml

frontend/src/
├── app/
│   ├── (public)/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── pricing/page.tsx
│   │   └── auth/
│   │       ├── login/page.tsx
│   │       ├── registration/page.tsx
│   │       ├── recovery/page.tsx
│   │       └── verification/page.tsx
│   └── api/auth/
│       ├── session/route.ts
│       └── logout/route.ts
├── components/
│   ├── landing/
│   │   ├── Hero.tsx
│   │   ├── PricingCards.tsx
│   │   ├── Features.tsx
│   │   ├── Footer.tsx
│   │   └── Navbar.tsx
│   └── auth/
│       ├── LoginForm.tsx
│       ├── RegistrationForm.tsx
│       ├── RecoveryForm.tsx
│       └── AuthLayout.tsx
├── lib/kratos/
│   ├── client.ts
│   ├── flows.ts
│   ├── session.ts
│   └── types.ts
├── store/slices/authSlice.ts
└── middleware.ts
```

### Modified Files
```
frontend/src/components/layout/Header.tsx  (add profile dropdown)
frontend/src/store/index.ts               (add auth reducer)
frontend/src/app/(main)/layout.tsx        (auth check)
k8s/deployment.yaml                       (add Kratos env vars)
k8s/kustomization.yaml                    (add new resources)
homelab-platform/ingress/cloudflared-config.yaml (new hostnames)
```

---

## Security Considerations

- All secrets stored in Kubernetes Secrets (never hardcoded)
- CSRF protection via Kratos cookies
- Session cookies with HttpOnly, Secure, SameSite=Lax
- Password policies enforced by Kratos
- Rate limiting on auth endpoints (Kratos built-in)
- Email verification required before full access

---

## Notes

- MailHog is for development only - replace with real SMTP for production
- Stripe integration planned for Phase 2 (not in this implementation)
- Company/Team management service deferred until MVP validated
