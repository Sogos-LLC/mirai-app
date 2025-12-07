# Kratos Quick Start - TL;DR

Fast installation for those who know what they're doing.

## One-Line Install

```bash
# 1. Create database
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres -c "CREATE DATABASE kratos;"

# 2. Deploy Mailpit and secrets
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/

# 3. Install Kratos
helm repo add ory https://k8s.ory.sh/helm/charts && \
helm repo update && \
helm install kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai --wait

# 4. Fix IngressRoute (edit to remove namespace: kratos line)
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/
```

## Verify

```bash
# Check pods
kubectl get pods -n mirai | grep -E "(kratos|mailpit)"

# Test API
curl -k https://auth.mirai.local/health/ready

# Access Mailpit
kubectl port-forward -n mirai svc/mailpit 8025:8025
# Open: http://localhost:8025
```

## Test Auth Flow

1. Open: https://mirai.local/auth/registration
2. Create account
3. Check Mailpit for emails: http://localhost:8025
4. Login at: https://mirai.local/auth/login

## Key URLs

- Public API: `https://auth.mirai.local`
- Login UI: `https://mirai.local/auth/login`
- Registration: `https://mirai.local/auth/registration`
- Recovery: `https://mirai.local/auth/recovery`
- Settings: `https://mirai.local/auth/settings`
- Mailpit UI: `http://localhost:8025` (via port-forward)

## Admin Access

```bash
# Port forward admin API
kubectl port-forward -n mirai svc/kratos-admin 4434:80

# List identities
curl http://localhost:4434/admin/identities | jq
```

## Common Issues

**Pods not starting**: Check database exists and is accessible
```bash
kubectl logs -n mirai -l app.kubernetes.io/name=kratos --tail=50
```

**CORS errors**: Verify values-local.yaml has correct allowed_origins

**Emails not sent**: Check Mailpit and courier logs
```bash
kubectl logs -n mirai -l app=mailpit
kubectl logs -n mirai -l app.kubernetes.io/component=courier
```

**Session not persisting**: Cookie domain must be `.mirai.local`

## Files Reference

```
k8s-local/kratos/
├── values-local.yaml       # Helm values (main config)
├── secrets.yaml            # Database DSN and session secrets
├── mailpit.yaml            # Email testing service
├── kustomization.yaml      # Kustomize manifest
├── ingressroute-fix.yaml   # Corrected IngressRoute
├── INSTALL.md              # Detailed installation guide
├── README.md               # Architecture and usage docs
└── QUICK_START.md          # This file
```

## Update/Restart

```bash
# Update Helm release
helm upgrade kratos ory/kratos \
  -f /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/values-local.yaml \
  -n mirai

# Restart after secret changes
kubectl rollout restart deployment -n mirai -l app.kubernetes.io/name=kratos
kubectl rollout restart statefulset -n mirai -l app.kubernetes.io/name=kratos
```

## Uninstall

```bash
helm uninstall kratos -n mirai
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/
kubectl exec -n mirai mirai-db-1 -it -- psql -U postgres -c "DROP DATABASE kratos;"
```

## Session Management

Frontend checks session via:
```bash
curl -k https://auth.mirai.local/sessions/whoami \
  -H "Cookie: ory_kratos_session={token}"
```

Response includes user traits (email, name) if session is valid.

## Development Tips

- Email verification is **disabled** for easier testing
- Debug logging is **enabled** (check logs for detailed info)
- Sessions last **24 hours**
- Cookie domain is `.mirai.local` (works across subdomains)
- Recovery uses **code** method (check Mailpit for codes)

## Security Warnings

This config is **LOCAL DEV ONLY**:
- Uses placeholder secrets
- Leaks sensitive values in logs
- Permissive CORS settings
- Email verification disabled

**NEVER use in production!**
