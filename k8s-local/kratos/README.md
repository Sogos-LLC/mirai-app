# Kratos Authentication - Local Development

This directory contains Ory Kratos configuration for the Mirai k3d local development environment.

## Architecture

- **Kratos Public API**: `https://auth.mirai.local` (exposed via Traefik)
- **Frontend Auth UI**: `https://mirai.local/auth/*` (login, registration, recovery, etc.)
- **Database**: PostgreSQL in `mirai` namespace (database: `kratos`)
- **Email Testing**: Mailpit (catches all emails for local testing)
- **Session Cookie Domain**: `.mirai.local` (works across subdomains)

## Prerequisites

1. PostgreSQL database must be running in `mirai` namespace
2. Traefik IngressRoute for `auth.mirai.local` must be configured
3. DNS: Add `127.0.0.1 mirai.local auth.mirai.local` to `/etc/hosts`

## Installation

### 1. Add Ory Helm Repository

```bash
helm repo add ory https://k8s.ory.sh/helm/charts
helm repo update
```

### 2. Create Kratos Database

Connect to PostgreSQL and create the Kratos database:

```bash
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres
```

```sql
CREATE DATABASE kratos;
\q
```

### 3. Deploy Mailpit and Secrets

```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/
```

### 4. Install Kratos via Helm

```bash
helm install kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai
```

### 5. Verify Installation

```bash
# Check Kratos pods
kubectl get pods -n mirai -l app.kubernetes.io/name=kratos

# Check Mailpit
kubectl get pods -n mirai -l app=mailpit

# Check Kratos logs
kubectl logs -n mirai -l app.kubernetes.io/name=kratos --tail=50

# Test Kratos public endpoint
curl -k https://auth.mirai.local/health/ready
```

## Accessing Services

### Kratos Public API

```bash
# Via Traefik ingress
curl -k https://auth.mirai.local/health/ready

# Get version info
curl -k https://auth.mirai.local/health/alive
```

### Mailpit Web UI

Forward port to access Mailpit web interface:

```bash
kubectl port-forward -n mirai svc/mailpit 8025:8025
```

Then open http://localhost:8025 to view all emails sent by Kratos.

### Kratos Admin API (Internal Only)

```bash
# Port forward for admin operations
kubectl port-forward -n mirai svc/kratos-admin 4434:80

# List identities
curl http://localhost:4434/admin/identities

# Create test identity
curl -X POST http://localhost:4434/admin/identities \
  -H "Content-Type: application/json" \
  -d '{
    "schema_id": "user",
    "traits": {
      "email": "test@mirai.local",
      "name": {
        "first": "Test",
        "last": "User"
      }
    }
  }'
```

## Testing Authentication Flows

### 1. Registration

1. Open https://mirai.local/auth/registration
2. Fill in email and name
3. Check Mailpit (http://localhost:8025) for verification email (if enabled)
4. Complete registration flow

### 2. Login

1. Open https://mirai.local/auth/login
2. Enter credentials
3. Should redirect to https://mirai.local/dashboard on success

### 3. Password Recovery

1. Open https://mirai.local/auth/recovery
2. Enter email address
3. Check Mailpit for recovery code
4. Enter code to reset password

### 4. Account Settings

1. Login first
2. Navigate to https://mirai.local/auth/settings
3. Update profile or change password

## Configuration

### Identity Schema

The user identity schema is embedded in `values-local.yaml` and includes:

- `email` (required): User's email address, used for login and recovery
- `name.first` (required): First name
- `name.last` (required): Last name

Schema location: Embedded in Helm values, mounted at `/etc/config/identity.schema.json`

### Session Configuration

- **Lifespan**: 24 hours
- **Cookie Domain**: `.mirai.local` (allows cookies to work across `mirai.local` and `auth.mirai.local`)
- **Same Site**: Lax (allows cookies in cross-site navigation)

### Email Configuration

- **SMTP Server**: `mailpit.mirai.svc.cluster.local:1025` (no authentication)
- **From Address**: `noreply@mirai.local`
- **From Name**: `Mirai Local`
- **Verification**: Disabled for easier local testing
- **Recovery**: Enabled with code method

### Security Notes

- **Development Mode**: Enabled for verbose logging
- **Leak Sensitive Values**: Enabled in logs (LOCAL DEV ONLY)
- **CORS Debug**: Enabled for troubleshooting
- **Email Verification**: Disabled to skip email verification step

## Secrets

All secrets are in `secrets.yaml` with placeholder values:

- `dsn`: PostgreSQL connection string
- `secretsDefault`: 32-character session encryption key

**WARNING**: These are LOCAL DEV ONLY values. Never use in production.

To generate new secrets for production:

```bash
# Generate 32-byte random secret
openssl rand -base64 32
```

## Updating Kratos

After modifying `values-local.yaml`:

```bash
helm upgrade kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai
```

## Uninstalling

```bash
# Remove Helm release
helm uninstall kratos -n mirai

# Remove Mailpit and secrets
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/

# Optional: Drop Kratos database
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres -c "DROP DATABASE kratos;"
```

## Troubleshooting

### Kratos pods not starting

Check logs:
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos
```

Common issues:
- Database not accessible (check PostgreSQL is running)
- Database `kratos` doesn't exist (create it manually)
- Secret not found (apply kustomization first)

### CORS errors in browser

Check that:
- `allowed_origins` in `values-local.yaml` includes your frontend URL
- `allow_credentials: true` is set
- Cookie domain is `.mirai.local`

### Emails not being sent

Check Mailpit:
```bash
kubectl logs -n mirai -l app=mailpit
```

Check Kratos courier logs:
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos -c kratos-courier
```

### Session cookies not persisting

Check:
- Cookie domain is `.mirai.local` (with leading dot)
- Browser allows third-party cookies for local development
- HTTPS is being used (cookies with `SameSite=Lax` require secure context)

### Admin API not accessible

The admin API is internal only. Use port-forwarding:
```bash
kubectl port-forward -n mirai svc/kratos-admin 4434:80
```

## Integration with Frontend

The frontend uses Connect-RPC to integrate with Kratos. See:

- `frontend/src/lib/kratos/` - Kratos client integration
- `frontend/src/app/(public)/auth/` - Auth UI pages

### Session Management

Frontend checks session via:
```typescript
GET https://auth.mirai.local/sessions/whoami
```

Kratos returns session cookie that's valid across `.mirai.local` domain.

## Database Schema

Kratos manages its own database schema via automigration. Tables include:

- `identities` - User identity records
- `identity_credentials` - Password hashes
- `sessions` - Active user sessions
- `courier_messages` - Outbound emails
- And more...

Never modify these tables manually. Use Kratos Admin API instead.

## References

- [Ory Kratos Documentation](https://www.ory.sh/docs/kratos)
- [Kratos Helm Chart](https://github.com/ory/k8s/tree/master/helm/charts/kratos)
- [Identity Schema Guide](https://www.ory.sh/docs/kratos/manage-identities/identity-schema)
- [Self-Service Flows](https://www.ory.sh/docs/kratos/self-service)
