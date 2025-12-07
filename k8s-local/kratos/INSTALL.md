# Kratos Installation Guide - Local Development

Step-by-step instructions to deploy Ory Kratos for the Mirai k3d local environment.

## Prerequisites Checklist

- [x] k3d cluster is running
- [x] PostgreSQL is deployed in `mirai` namespace (via `k8s-local/infrastructure/postgres`)
- [x] Traefik is installed and running
- [x] TLS certificate exists: `mirai-local-tls` secret in `mirai` namespace
- [x] `/etc/hosts` includes: `127.0.0.1 mirai.local auth.mirai.local get-mirai.local api.mirai.local`

## Installation Steps

### Step 1: Create Kratos Database

Kratos requires its own database within PostgreSQL. Connect to the PostgreSQL pod and create it:

```bash
# Connect to PostgreSQL
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres

# In the PostgreSQL prompt, run:
CREATE DATABASE kratos;

# Verify
\l

# Exit
\q
```

Expected output should show `kratos` database in the list.

### Step 2: Deploy Mailpit and Secrets

Apply the kustomization which includes Mailpit and Kratos secrets:

```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/
```

Verify deployment:

```bash
# Check Mailpit pod
kubectl get pods -n mirai -l app=mailpit

# Check secret
kubectl get secret -n mirai kratos-secret
```

Expected: Mailpit pod should be in `Running` state.

### Step 3: Add Ory Helm Repository

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update
```

Verify:
```bash
helm search repo ory/kratos
```

### Step 4: Install Kratos via Helm

```bash
helm install kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai \
  --wait \
  --timeout 5m
```

This will:
- Deploy Kratos deployment (main server)
- Deploy Kratos StatefulSet (courier for sending emails)
- Run migration job to set up database schema
- Create services: `kratos-public` (port 80) and `kratos-admin` (port 80)

### Step 5: Verify Kratos Installation

```bash
# Check all Kratos resources
kubectl get all -n mirai -l app.kubernetes.io/name=kratos

# Check Kratos deployment
kubectl get deploy -n mirai -l app.kubernetes.io/name=kratos

# Check Kratos StatefulSet (courier)
kubectl get statefulset -n mirai -l app.kubernetes.io/name=kratos

# Check migration job
kubectl get jobs -n mirai -l app.kubernetes.io/name=kratos

# View Kratos logs
kubectl logs -n mirai -l app.kubernetes.io/name=kratos --tail=50
```

Expected output:
- Deployment: 1/1 READY
- StatefulSet: 1/1 READY
- Job: 1/1 COMPLETED
- Logs: No errors, should show "server started" messages

### Step 6: Fix IngressRoute (If Needed)

The existing IngressRoute in `k8s-local/ingress/ingressroutes.yaml` references `namespace: kratos`.
Since we're deploying to `mirai` namespace, we need to update it.

**Option A: Edit the existing file** (Recommended)

Edit `/Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/ingressroutes.yaml`:

Find this section:
```yaml
services:
  - name: kratos-public
    namespace: kratos  # <-- REMOVE THIS LINE
    port: 80
```

Change to:
```yaml
services:
  - name: kratos-public
    port: 80
```

Then reapply:
```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/
```

**Option B: Apply the fix separately**

```bash
kubectl apply -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/ingressroute-fix.yaml
```

### Step 7: Test Kratos Public API

```bash
# Test health endpoint
curl -k https://auth.mirai.local/health/ready

# Expected: {"status":"ok"}

# Test alive endpoint
curl -k https://auth.mirai.local/health/alive

# Expected: {"status":"ok"}

# Check version
curl -k https://auth.mirai.local/version

# Expected: JSON with Kratos version info
```

### Step 8: Access Mailpit Web UI

Forward port to access Mailpit:

```bash
kubectl port-forward -n mirai svc/mailpit 8025:8025
```

Open browser to: http://localhost:8025

You should see the Mailpit web interface (email inbox will be empty initially).

### Step 9: Test Registration Flow

1. Open https://mirai.local/auth/registration
2. Enter:
   - Email: test@mirai.local
   - First Name: Test
   - Last Name: User
   - Password: testpassword123
3. Submit the form
4. Check Mailpit for verification email (if verification is enabled)
5. Should redirect to https://mirai.local/dashboard on success

### Step 10: Verify Session Cookie

After registration, check browser DevTools:

1. Open DevTools (F12)
2. Go to Application tab > Cookies
3. Check for `.mirai.local` domain
4. Should see `ory_kratos_session` cookie

This cookie allows authentication across all `*.mirai.local` subdomains.

## Troubleshooting

### Kratos pod stuck in Init

Check migration job:
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos,app.kubernetes.io/component=migration --tail=100
```

Common issues:
- Database doesn't exist: Create `kratos` database manually
- Wrong database credentials: Check secret `kratos-secret`
- Database not accessible: Check PostgreSQL is running

### "connection refused" errors

Check services:
```bash
kubectl get svc -n mirai | grep kratos
```

Should see:
- `kratos-public` (ClusterIP, port 80)
- `kratos-admin` (ClusterIP, port 80)

### CORS errors in browser

1. Check Kratos logs:
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos --tail=100 | grep -i cors
```

2. Verify CORS config in values-local.yaml includes your origin

3. Check browser DevTools Network tab for preflight OPTIONS requests

### Emails not being sent

Check Mailpit:
```bash
kubectl logs -n mirai -l app=mailpit
```

Check Kratos courier (StatefulSet):
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos,app.kubernetes.io/component=courier
```

### Session cookies not working

1. Verify cookie domain is `.mirai.local` (with leading dot)
2. Check browser allows cookies for local development
3. Ensure using HTTPS (not HTTP)
4. Check SameSite policy in browser

## Updating Configuration

After modifying `values-local.yaml`:

```bash
helm upgrade kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai \
  --wait
```

After modifying secrets:

```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/
kubectl rollout restart deployment -n mirai -l app.kubernetes.io/name=kratos
kubectl rollout restart statefulset -n mirai -l app.kubernetes.io/name=kratos
```

## Useful Commands

```bash
# Get Kratos admin API access
kubectl port-forward -n mirai svc/kratos-admin 4434:80

# List all identities
curl http://localhost:4434/admin/identities | jq

# Create test identity
curl -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "user",
    "traits": {
      "email": "admin@mirai.local",
      "name": {
        "first": "Admin",
        "last": "User"
      }
    },
    "credentials": {
      "password": {
        "config": {
          "password": "adminpassword123"
        }
      }
    }
  }' | jq

# Delete an identity
curl -X DELETE http://localhost:4434/admin/identities/{identity-id}

# Get Kratos config
kubectl get configmap -n mirai -l app.kubernetes.io/name=kratos

# Describe Kratos deployment
kubectl describe deploy -n mirai -l app.kubernetes.io/name=kratos
```

## Uninstallation

To completely remove Kratos:

```bash
# Remove Helm release
helm uninstall kratos -n mirai

# Remove Mailpit and secrets
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/

# Optional: Drop Kratos database
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres -c "DROP DATABASE kratos;"
```

## Next Steps

After Kratos is running:

1. Test all auth flows (login, registration, recovery, settings)
2. Integrate frontend with Kratos session management
3. Configure backend to validate Kratos sessions
4. Set up proper error handling in frontend auth pages
5. Customize email templates if needed

## Integration Points

### Frontend Integration

- Session check: `GET https://auth.mirai.local/sessions/whoami`
- Login flow: `GET https://auth.mirai.local/self-service/login/browser`
- Registration: `GET https://auth.mirai.local/self-service/registration/browser`
- Recovery: `GET https://auth.mirai.local/self-service/recovery/browser`

### Backend Integration

Backend should validate session by calling:
```
GET https://auth.mirai.local/sessions/whoami
Cookie: ory_kratos_session={session-token}
```

Or use Kratos Admin API to check sessions.

## Security Notes

This configuration is for **LOCAL DEVELOPMENT ONLY**:

- Email verification is disabled
- Debug logging is enabled
- Sensitive values are leaked in logs
- Placeholder secrets are used
- CORS is permissive

**Never use these settings in production!**
