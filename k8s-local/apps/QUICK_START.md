# Mirai Apps - Quick Start Guide

## Prerequisites
Ensure infrastructure is deployed first:
```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/
```

## Build and Deploy Workflow

### 1. Build Docker Images
```bash
cd /Users/john/homelab-cluster/apps/mirai

# Backend
docker build -t mirai-backend:local backend/

# Frontend
docker build -t mirai-frontend:local frontend/

# Marketing
docker build -t mirai-marketing:local frontend-marketing/
```

### 2. Import to k3d
```bash
# Import all at once
k3d image import \
  mirai-backend:local \
  mirai-frontend:local \
  mirai-marketing:local \
  -c mirai-local
```

### 3. Deploy Applications
```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/apps/
```

### 4. Verify Deployment
```bash
# Watch pods start
kubectl get pods -n mirai -w

# Check status
kubectl get deployments -n mirai

# View logs
kubectl logs -n mirai -l app=mirai-backend --tail=50 -f
```

## Update After Code Changes

```bash
# Rebuild specific service
docker build -t mirai-backend:local backend/

# Re-import
k3d image import mirai-backend:local -c mirai-local

# Restart deployment
kubectl rollout restart deployment/mirai-backend -n mirai

# Watch rollout
kubectl rollout status deployment/mirai-backend -n mirai
```

## Access Services

Add to `/etc/hosts`:
```
127.0.0.1 mirai.local marketing.mirai.local api.mirai.local auth.mirai.local
```

Then access:
- Main App: https://mirai.local
- Marketing: https://marketing.mirai.local
- API: https://api.mirai.local
- Auth: https://auth.mirai.local

## Troubleshooting

### Check image is imported
```bash
docker exec k3d-mirai-local-server-0 crictl images | grep mirai
```

### Check secrets exist
```bash
kubectl get secrets -n mirai
```

### Describe pod for details
```bash
kubectl describe pod -n mirai -l app=mirai-backend
```

### View all resources
```bash
kubectl get all -n mirai
```

## Clean Up

```bash
# Delete apps only (keep infrastructure)
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/apps/

# Or delete specific deployment
kubectl delete deployment mirai-backend -n mirai
```

## Development Tips

- Use `kubectl logs -f` to stream logs in real-time
- Use `kubectl port-forward` to debug services directly
- Check `kubectl get events -n mirai` for issues
- Environment variables are defined in patch files
- Secrets must be created before deploying apps
