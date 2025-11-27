# Mirai Authentication Architecture

## Overview

The Mirai SaaS application uses **Ory Kratos** for headless authentication with a multi-domain architecture designed for separation of concerns and security.

## Domain Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Cloudflare Tunnel                                │
├───────────────────┬───────────────────┬──────────────────────────────────┤
│ get-mirai.sogos.io│ mirai.sogos.io    │ mirai-auth.sogos.io              │
│ Marketing Site    │ Authenticated App │ Kratos Auth API                  │
└───────────────────┴───────────────────┴──────────────────────────────────┘
         │                   │                        │
         ▼                   ▼                        ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  mirai-marketing│  │  mirai-frontend │  │  Ory Kratos     │
│  (Next.js)      │  │  (Next.js)      │  │  (Helm Chart)   │
│  Separate Pod   │  │  Full App       │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                   │                        │
         │                   │                        ▼
         │                   │              ┌─────────────────┐
         │                   │              │  PostgreSQL     │
         │                   │              │  (Kratos DB)    │
         │                   │              └─────────────────┘
         │                   ▼
         │           ┌─────────────────┐
         │           │  Go Backend     │
         │           │  (Gin + Kratos) │
         │           └─────────────────┘
         │                   │
         │                   ▼
         │           ┌─────────────────┐
         │           │  PostgreSQL     │
         │           │  (App DB)       │
         │           └─────────────────┘
         │
         └──────────── Auth links redirect to mirai.sogos.io ──────────────┘
```

**Key Change**: The marketing site (`get-mirai.sogos.io`) runs as a **separate deployment** (`mirai-marketing`) from the main app. This allows independent scaling and keeps authentication flows on the app domain only.

## Domain Responsibilities

### 1. `get-mirai.sogos.io` - Marketing Site (Separate Deployment)
**Purpose**: Public-facing marketing site with pricing information

**Features**:
- Hero section with product overview
- Features showcase
- Pricing tiers (Starter, Pro, Enterprise)
- "Get Started" / "Sign In" buttons link to `mirai.sogos.io`
- Future: Blog, Docs, Help Center

**Routing Behavior**:
- `/` → Landing page (always, even if authenticated)
- `/pricing` → Pricing page
- `/auth/*` → **Redirects to `mirai.sogos.io/auth/*`**
- `/dashboard`, etc. → **Redirects to `mirai.sogos.io`**

**Tech Stack**: Next.js 14 (App Router) - Stripped build without `(main)` routes

**Deployment**:
- **Pod**: `mirai-marketing` (separate from `mirai-frontend`)
- **Image**: `ghcr.io/.../mirai-marketing`
- **Dockerfile**: `frontend/Dockerfile.marketing`
- **Resources**: 128Mi memory, 50m CPU (lighter than full app)

**Key Files**:
- `frontend/src/app/(public)/page.tsx` - Landing page
- `frontend/src/components/landing/` - Landing components (Navbar, Hero, PricingCards)
- `frontend/src/middleware.marketing.ts` - Redirects auth/app routes to main app
- `k8s/frontend-marketing/` - Kubernetes manifests

### 2. `mirai.sogos.io` - Authenticated Application
**Purpose**: Main application for authenticated users AND all authentication flows

**Features**:
- Dashboard
- Teams management
- User profile settings
- Onboarding flow for new users
- Protected routes requiring authentication
- **All auth pages** (`/auth/login`, `/auth/registration`, etc.)

**Routing Behavior**:
- `/` → Authenticated? → `/dashboard` | Not authenticated? → **Redirect to `get-mirai.sogos.io`**
- `/auth/*` → Authentication flows (login, registration, recovery, etc.)
- `/dashboard`, `/settings`, etc. → Protected routes (require auth)

**Auth Flow**:
1. Unauthenticated users on `/` are redirected to marketing site
2. Users click "Sign In" on marketing → sent to `mirai.sogos.io/auth/login`
3. Login handled via Kratos at `mirai-auth.sogos.io`
4. Session cookie set on `.sogos.io` domain (shared across subdomains)
5. Successful auth redirects to `/dashboard`

**Tech Stack**: Next.js 14 (App Router) + Redux Toolkit

**Deployment**:
- **Pod**: `mirai-frontend`
- **Image**: `ghcr.io/.../mirai-frontend`
- **Dockerfile**: `frontend/Dockerfile`
- **Resources**: 256Mi memory, 100m CPU

**Key Files**:
- `frontend/src/app/(main)/` - Authenticated pages
- `frontend/src/app/(public)/auth/` - Auth flow pages
- `frontend/src/middleware.ts` - Route protection and redirects
- `frontend/src/store/slices/authSlice.ts` - Auth state management
- `k8s/frontend/` - Kubernetes manifests

### 3. `mirai-auth.sogos.io` - Kratos Authentication API
**Purpose**: Headless authentication service (Ory Kratos)

**Endpoints**:
- `/self-service/registration/browser` - Start registration flow
- `/self-service/login/browser` - Start login flow
- `/self-service/recovery/browser` - Password recovery
- `/self-service/verification/browser` - Email verification
- `/self-service/settings/browser` - Account settings
- `/sessions/whoami` - Validate session

**Authentication Method**: Cookie-based sessions

**Tech Stack**: Ory Kratos (Helm deployment)

**Key Files**:
- `k8s/kratos/values.yaml` - Kratos configuration
- `k8s/kratos/identity-schema.json` - User traits schema

### 4. `mirai-api.sogos.io` - Backend API
**Purpose**: Application business logic and data layer

**Features**:
- Company management
- Team management
- User profile operations
- Kratos session validation middleware

**Auth Flow**:
1. Frontend sends requests with session cookie
2. Backend middleware forwards cookies to Kratos `/sessions/whoami`
3. Kratos validates session and returns identity
4. Backend extracts `kratos_id` and performs authorized operations

**Tech Stack**: Go (Gin framework) + PostgreSQL

**Key Files**:
- `backend/internal/middleware/auth.go` - Kratos session validation
- `backend/internal/handlers/` - API endpoints
- `backend/internal/models/` - Data models

## Registration Flow

### Step-by-Step Process

1. **User visits marketing site** (`get-mirai.sogos.io`)
   - Clicks "Get Started" on pricing tier (e.g., Pro plan)
   - **Link goes directly to `mirai.sogos.io/auth/registration?tier=pro`**

2. **Registration page on app domain** (`mirai.sogos.io/auth/registration?tier=pro`)
   - Frontend initializes Kratos registration flow
   - Calls `https://mirai-auth.sogos.io/self-service/registration/browser`

3. **Kratos creates flow**
   - Returns flow ID and form schema
   - Frontend renders registration form

4. **User submits form**
   - Email, password, first name, last name
   - Frontend posts to Kratos registration API

5. **Email verification**
   - Kratos sends verification code to email (via Mailpit)
   - User enters code to verify email

6. **Onboarding** (`mirai.sogos.io/onboard`)
   - User enters company name
   - Selects pricing tier (if not already selected)
   - Frontend calls `POST /api/v1/onboard` on backend

7. **Backend creates records**
   - Creates company in app database
   - Links user to company with `kratos_id`
   - Sets user role as "owner"

8. **Redirect to dashboard** (`mirai.sogos.io/dashboard`)
   - User is fully authenticated and onboarded

## Session Management

### Cookie Configuration

**Kratos Session Cookie**:
- Name: `ory_kratos_session`
- Domain: `.sogos.io` (shared across all subdomains)
- Path: `/`
- HttpOnly: `true`
- Secure: `true` (HTTPS only)
- SameSite: `Lax`

**Benefits of shared cookie**:
- Single sign-on across all mirai subdomains
- No need for token exchange between domains
- Secure cookie storage in browser

### Session Validation

**Frontend** (Next.js middleware):
```typescript
// Check session on protected routes
const session = await kratosClient.toSession();
if (!session) {
  redirect('/auth/login');
}
```

**Backend** (Go middleware):
```go
// Forward cookies to Kratos for validation
resp := http.Get(kratosURL + "/sessions/whoami",
  cookies: request.Cookies())
if resp.StatusCode != 200 {
  return 401 Unauthorized
}
```

## Data Model

### Kratos Identity (Authentication)
```json
{
  "id": "uuid (kratos_id)",
  "traits": {
    "email": "user@example.com",
    "name": {
      "first": "John",
      "last": "Doe"
    }
  }
}
```

### Application Database (Business Logic)
```sql
-- Companies (organizations)
CREATE TABLE companies (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    plan VARCHAR(20) DEFAULT 'starter', -- starter, pro, enterprise
    created_at TIMESTAMP DEFAULT NOW()
);

-- Users (linked to Kratos)
CREATE TABLE users (
    id UUID PRIMARY KEY,
    kratos_id UUID UNIQUE NOT NULL, -- Links to Kratos identity
    company_id UUID REFERENCES companies(id),
    role VARCHAR(20) DEFAULT 'member', -- owner, admin, member
    created_at TIMESTAMP DEFAULT NOW()
);

-- Teams
CREATE TABLE teams (
    id UUID PRIMARY KEY,
    company_id UUID REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Team memberships
CREATE TABLE team_members (
    id UUID PRIMARY KEY,
    team_id UUID REFERENCES teams(id),
    user_id UUID REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'member', -- lead, member
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);
```

## Deployment Architecture

### Kubernetes Namespaces

- **`kratos`**: Kratos pods, services, and ConfigMaps
- **`mirai`**: Frontend, backend, app database, Redis
- **`postgres`**: Shared PostgreSQL for Kratos database
- **`ingress`**: Cloudflare tunnel for external access

### ArgoCD Applications

- **`mirai-frontend`**: Path `k8s/frontend/` - Main authenticated app
- **`mirai-marketing`**: Path `k8s/frontend-marketing/` - Marketing site
- **`mirai-backend`**: Path `k8s/backend/` - Go API
- **`platform-ingress`**: Cloudflare tunnel configuration

All applications have automated sync enabled.

### GitOps Workflow

1. **Code change** pushed to `main` branch
2. **GitHub Actions** builds Docker images:
   - `build-frontend.yml` → `mirai-frontend` image
   - `build-marketing.yml` → `mirai-marketing` image
   - `build-backend.yml` → `mirai-backend` image
3. **Workflow updates** `k8s/{frontend|frontend-marketing|backend}/kustomization.yaml` with new image tag
4. **ArgoCD detects** change in Git
5. **Automated sync** deploys new version to cluster

## Troubleshooting

### Issue: 404 on `mirai-auth.sogos.io`

**Symptoms**: All requests to Kratos return 404

**Root Causes**:
1. **Cloudflare cache**: Old 404 responses cached at edge
2. **DNS not propagated**: Tunnel route not registered
3. **Config not loaded**: Cloudflared not seeing updated ConfigMap

**Solutions**:

```bash
# 1. Purge Cloudflare cache
# Dashboard: dash.cloudflare.com → sogos.io → Caching → Purge Cache

# 2. Verify DNS route exists
cloudflared tunnel route dns <TUNNEL_ID> mirai-auth.sogos.io

# 3. Restart cloudflared to reload config
kubectl rollout restart deployment cloudflared -n ingress

# 4. Test with cache bypass
curl -I "https://mirai-auth.sogos.io/health/ready?nocache=$(date +%s)"

# 5. Check cloudflared can reach Kratos
kubectl run test --rm -i --restart=Never -n ingress \
  --image=curlimages/curl:latest \
  --overrides='{"spec":{"tolerations":[{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]}}' \
  -- curl -v http://kratos-public.kratos.svc.cluster.local/health/ready
```

### Issue: Backend pods CrashLoopBackOff

**Symptoms**: Backend pod shows `Error: exec: "./server": permission denied`

**Root Cause**: Binary not executable by non-root user (UID 10000)

**Solution**:

```dockerfile
# Dockerfile must place binary in accessible location
WORKDIR /app
COPY --from=builder /src/server /app/server
RUN chmod 755 /app/server
USER 10000
ENTRYPOINT ["./server"]
```

**Why this happens**:
- Backend runs as UID 10000 (security context)
- `readOnlyRootFilesystem: true` prevents writes
- Binary in `/root/` is not accessible to UID 10000
- Moving to `/app/` with explicit permissions fixes it

### Issue: Test pods timeout on creation

**Symptoms**: `kubectl run` pods never start, timeout after 1 minute

**Root Cause**: All nodes tainted as `control-plane:NoSchedule`

**Solution**:

```bash
# Add toleration to test pods
kubectl run tmp-test --rm -i --restart=Never -n ingress \
  --image=curlimages/curl:latest \
  --overrides='{"spec":{"tolerations":[{"key":"node-role.kubernetes.io/control-plane","operator":"Exists","effect":"NoSchedule"}]}}' \
  -- curl http://target-service
```

**Why this happens**:
- Homelab uses 3 control-plane nodes (no dedicated workers)
- Control-plane taint prevents scheduling by default
- All production workloads have tolerations configured
- Test pods need explicit toleration

### Issue: Grafana pod has stale NFS mount

**Symptoms**: `stat ./server: stale NFS file handle`

**Root Cause**: NFS provisioner restarted, old mounts became stale

**Solution**:

```bash
# 1. Delete the deployment
kubectl delete deployment grafana -n monitoring

# 2. Delete the PVC to force new volume
kubectl delete pvc grafana-storage -n monitoring

# 3. Restart NFS provisioner
kubectl delete pod -n nfs-provisioner -l app=nfs-client-provisioner

# 4. Wait for provisioner to come up
kubectl wait --for=condition=ready pod -n nfs-provisioner -l app=nfs-client-provisioner --timeout=60s

# 5. ArgoCD will recreate grafana with fresh mount
```

### Issue: Prometheus pod has stale NFS mount

**Symptoms**:
- Logs show `stale NFS file handle` errors
- Metrics collection stops
- Alert rules not evaluating

**Root Cause**: NFS provisioner restarted, old mounts became stale

**Solution**:

```bash
# 1. Scale Prometheus to 0 to release lock
kubectl scale deployment prometheus -n monitoring --replicas=0

# 2. Delete the PVC to force new volume
kubectl delete pvc prometheus-storage -n monitoring

# 3. Restart NFS provisioner
kubectl delete pod -n nfs-provisioner -l app=nfs-client-provisioner

# 4. Wait for provisioner to come up
kubectl wait --for=condition=ready pod -n nfs-provisioner -l app=nfs-client-provisioner --timeout=60s

# 5. Scale Prometheus back up (ArgoCD will sync config)
kubectl scale deployment prometheus -n monitoring --replicas=1

# 6. Wait for Prometheus to be ready
kubectl wait --for=condition=ready pod -l app=prometheus -n monitoring --timeout=60s
```

**Additional troubleshooting**:
- If pod still won't start with "lock DB directory" error, scale to 0 and back to 1
- Verify alert rules loaded: `kubectl exec -n monitoring deployment/prometheus -- ls -la /etc/prometheus/`
- Check ConfigMap has all files: `kubectl get configmap prometheus-config -n monitoring -o jsonpath='{.data}' | python3 -c "import sys, json; print(list(json.load(sys.stdin).keys()))"`

### Issue: Session not working across domains

**Symptoms**: User logged in on `mirai.sogos.io` but appears logged out on `get-mirai.sogos.io`

**Root Cause**: Cookie domain not set to `.sogos.io`

**Solution**:

Check Kratos configuration:
```yaml
# k8s/kratos/values.yaml
serve:
  public:
    base_url: https://mirai-auth.sogos.io
session:
  cookie:
    domain: .sogos.io  # Leading dot for subdomain sharing
    same_site: Lax
```

After updating, restart Kratos:
```bash
helm upgrade kratos ory/kratos -f k8s/kratos/values.yaml -n kratos
```

## Monitoring & Debugging

### Check Kratos Health

```bash
# Internal check
kubectl exec -n kratos deployment/kratos -- \
  wget -q -O- http://localhost:4434/health/ready

# External check
curl https://mirai-auth.sogos.io/health/ready
```

### Check Backend Health

```bash
# Internal check
kubectl exec -n mirai deployment/mirai-backend -- \
  wget -q -O- http://localhost:8080/health

# External check
curl https://mirai-api.sogos.io/health
```

### View Kratos Sessions

```bash
# Get all sessions (admin API)
kubectl exec -n kratos deployment/kratos -- \
  wget -q -O- http://kratos-admin:80/admin/identities
```

### View Backend Logs

```bash
# Real-time logs
kubectl logs -n mirai -l app=mirai-backend -f

# Last 100 lines
kubectl logs -n mirai -l app=mirai-backend --tail=100
```

### Test Registration Flow Manually

```bash
# 1. Initialize registration
curl -X GET "https://mirai-auth.sogos.io/self-service/registration/browser" \
  -v 2>&1 | grep "location:"

# 2. Check flow details (replace FLOW_ID)
curl "https://mirai-auth.sogos.io/self-service/registration/flows?id=FLOW_ID" \
  | jq .
```

## Security Considerations

### Cookie Security
- ✅ HttpOnly: Prevents JavaScript access
- ✅ Secure: HTTPS only
- ✅ SameSite=Lax: CSRF protection
- ✅ Domain scoped: `.sogos.io` only

### Pod Security
- ✅ Non-root user (UID 10000)
- ✅ Read-only root filesystem
- ✅ Drop all capabilities
- ✅ No privilege escalation
- ✅ Seccomp profile: RuntimeDefault

### Network Security
- ✅ Cloudflare tunnel: No exposed ports
- ✅ Service mesh ready: Istio compatible
- ✅ TLS termination: At Cloudflare edge
- ✅ Internal traffic: Kubernetes DNS only

### Database Security
- ✅ Credentials in secrets: Not in YAML
- ✅ Network policies: Namespace isolation
- ✅ Encrypted connections: TLS for external
- ✅ Minimal permissions: App user limited

## Email Configuration

**Provider**: Mailpit (email testing/catching service)

**Settings**:
- SMTP: `smtp://mailpit.default.svc.cluster.local:1025`
- Web UI: `https://mailpit.sogos.io`
- No authentication required
- All emails are captured and viewable in web UI

**Note**: Mailpit catches all outgoing emails for testing purposes. Emails are not delivered to actual recipients.

## Adding New Domains

To add a new subdomain to the architecture:

1. **Update Cloudflare tunnel config**:
```yaml
# homelab-platform/ingress/cloudflared-config.yaml
ingress:
  - hostname: newapp.sogos.io
    service: http://newapp-service.namespace.svc.cluster.local:80
```

2. **Register DNS route**:
```bash
cloudflared tunnel route dns <TUNNEL_ID> newapp.sogos.io
```

3. **Restart cloudflared**:
```bash
kubectl rollout restart deployment cloudflared -n ingress
```

4. **Update CORS if needed** (for Kratos access):
```yaml
# k8s/kratos/values.yaml
serve:
  public:
    cors:
      allowed_origins:
        - https://newapp.sogos.io
```

5. **Purge Cloudflare cache**:
- Dashboard → sogos.io → Caching → Purge Everything

## References

- [Ory Kratos Documentation](https://www.ory.sh/docs/kratos)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps)
- [Next.js Authentication Patterns](https://nextjs.org/docs/app/building-your-application/authentication)
- [Kubernetes Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
