# Mirai Application Kustomize Overlays

This directory contains Kustomize overlays for local k3d development of the Mirai application components.

## Overview

The overlays in this directory patch the production manifests located in `../../k8s/` to make them suitable for local development. This approach ensures we maintain a single source of truth for our Kubernetes manifests while allowing environment-specific customizations.

## Structure

```
k8s-local/apps/
├── kustomization.yaml       # Main Kustomize configuration
├── backend-patch.yaml       # Patches for mirai-backend deployment
├── frontend-patch.yaml      # Patches for mirai-frontend deployment
├── marketing-patch.yaml     # Patches for mirai-marketing deployment
└── README.md               # This file
```

## What Gets Patched

### Common Changes (All Deployments)
- **Replicas**: Reduced to 1 (from 3 in production)
- **Image Pull Policy**: Set to `Never` (for local images)
- **Image Names**: Changed from `ghcr.io/sogos-llc/mirai-app/*` to `*:local`
- **Resources**: Reduced CPU and memory limits for local development
- **DNS/Tolerations/Topology**: Removed production-specific constraints
- **Health Probes**: Faster intervals for quicker feedback

### Backend Specific (`backend-patch.yaml`)
- **Environment Variables**:
  - `ALLOWED_ORIGIN`: `https://mirai.local`
  - `FRONTEND_URL`: `https://mirai.local`
  - `MARKETING_URL`: `https://marketing.mirai.local`
  - `BACKEND_URL`: `https://api.mirai.local`
  - `KRATOS_URL`: Local cluster service
  - `SMTP_HOST`: `mailpit.mailpit.svc.cluster.local`
  - `GIN_MODE`: `debug` (instead of `release`)
- **Resources**: 64Mi-128Mi RAM, 50m-200m CPU

### Frontend Specific (`frontend-patch.yaml`)
- **Environment Variables**:
  - `NEXT_PUBLIC_KRATOS_BROWSER_URL`: `https://auth.mirai.local`
  - `NEXT_PUBLIC_API_URL`: `https://api.mirai.local`
  - `NEXT_PUBLIC_APP_URL`: `https://mirai.local`
  - `NEXT_PUBLIC_LANDING_URL`: `https://marketing.mirai.local`
  - `REDIS_URL`: Local Redis service
  - `S3_ENDPOINT`: Local MinIO (from secret)
- **Resources**: 128Mi-256Mi RAM, 50m-200m CPU

### Marketing Specific (`marketing-patch.yaml`)
- **Environment Variables**:
  - `NEXT_PUBLIC_KRATOS_BROWSER_URL`: `https://auth.mirai.local`
  - `NEXT_PUBLIC_APP_URL`: `https://mirai.local`
  - `NEXT_PUBLIC_LANDING_URL`: `https://marketing.mirai.local`
- **Resources**: 64Mi-128Mi RAM, 25m-100m CPU

## Building Local Images

Before deploying, you need to build Docker images for each application:

### Backend
```bash
cd /Users/john/homelab-cluster/apps/mirai/backend
docker build -t mirai-backend:local .
```

### Frontend
```bash
cd /Users/john/homelab-cluster/apps/mirai/frontend
docker build -t mirai-frontend:local .
```

### Marketing
```bash
cd /Users/john/homelab-cluster/apps/mirai/frontend-marketing
docker build -t mirai-marketing:local .
```

## Importing Images to k3d

After building, import the images into your k3d cluster:

```bash
k3d image import mirai-backend:local -c mirai-local
k3d image import mirai-frontend:local -c mirai-local
k3d image import mirai-marketing:local -c mirai-local
```

Replace `mirai-local` with your actual k3d cluster name if different.

## Prerequisites

Before applying these manifests, ensure the following exist in the cluster:

### Namespaces
- `mirai` - Main application namespace
- `kratos` - Ory Kratos authentication
- `mailpit` - Email testing

### Secrets (in `mirai` namespace)
- `mirai-db-secret` - PostgreSQL connection string
  - Key: `dsn`
- `mirai-stripe-secret` - Stripe configuration
  - Keys: `secret-key`, `webhook-secret`, `starter-price-id`, `pro-price-id`
- `minio-secret` - MinIO/S3 credentials
  - Keys: `endpoint`, `region`, `accesskey`, `secretkey`
- `mirai-encryption-secret` - Encryption key for sensitive data
  - Key: `encryption-key`

### Services
- `kratos-public.kratos.svc.cluster.local` - Ory Kratos public API
- `kratos-admin.kratos.svc.cluster.local` - Ory Kratos admin API
- `redis.mirai.svc.cluster.local` - Redis cache
- `mailpit.mailpit.svc.cluster.local` - Email testing service
- MinIO service (endpoint in secret)

## Validating the Kustomization

Preview what will be applied without making changes:

```bash
cd /Users/john/homelab-cluster/apps/mirai/k8s-local/apps
kubectl kustomize .
```

This will show you the final manifests after all patches are applied.

## Applying the Manifests

### Using kubectl
```bash
cd /Users/john/homelab-cluster/apps/mirai/k8s-local/apps
kubectl apply -k .
```

### Using kustomize directly
```bash
cd /Users/john/homelab-cluster/apps/mirai/k8s-local/apps
kustomize build . | kubectl apply -f -
```

## Verifying Deployment

Check that all pods are running:

```bash
kubectl get pods -n mirai
```

Expected output should show:
- `mirai-backend-*` (1 pod)
- `mirai-frontend-*` (1 pod)
- `mirai-marketing-*` (1 pod)
- `redis-*` (1 pod)
- `asynqmon-*` (1 pod)

Check pod logs:
```bash
kubectl logs -n mirai -l app=mirai-backend --tail=50
kubectl logs -n mirai -l app=mirai-frontend --tail=50
kubectl logs -n mirai -l app=mirai-marketing --tail=50
```

## Accessing Services

The applications should be accessible through the ingress controller at:

- **Main App**: https://mirai.local
- **Marketing**: https://marketing.mirai.local
- **API**: https://api.mirai.local
- **Auth**: https://auth.mirai.local

Make sure these domains are configured in your `/etc/hosts` file or DNS to point to your k3d cluster's ingress IP.

## Updating Images

When you make code changes:

1. Rebuild the Docker image
2. Import it into k3d
3. Restart the deployment

```bash
# Example for backend
docker build -t mirai-backend:local /Users/john/homelab-cluster/apps/mirai/backend
k3d image import mirai-backend:local -c mirai-local
kubectl rollout restart deployment/mirai-backend -n mirai
```

## Troubleshooting

### Image Pull Errors
If you see `ImagePullBackOff` or `ErrImagePull`:
- Verify the image was imported: `docker exec k3d-mirai-local-server-0 crictl images | grep mirai`
- Check the `imagePullPolicy` is set to `Never`
- Re-import the image

### Service Connection Errors
If services can't connect to dependencies:
- Verify all infrastructure is deployed: `kubectl get pods -n mirai`
- Check service DNS resolution: `kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup redis.mirai.svc.cluster.local`
- Verify secrets exist: `kubectl get secrets -n mirai`

### Database Connection Issues
- Ensure PostgreSQL is running
- Check the `mirai-db-secret` contains the correct DSN
- Verify the backend pod can reach the database service

### Environment Variable Issues
- Use `kubectl describe pod <pod-name> -n mirai` to see actual env vars
- Check that secrets are mounted correctly
- Verify secret keys match what's referenced in the patches

## Development Workflow

1. **Initial Setup**:
   ```bash
   # Build and import all images
   cd /Users/john/homelab-cluster/apps/mirai
   docker build -t mirai-backend:local backend/
   docker build -t mirai-frontend:local frontend/
   docker build -t mirai-marketing:local frontend-marketing/

   k3d image import mirai-backend:local mirai-frontend:local mirai-marketing:local -c mirai-local

   # Apply manifests
   kubectl apply -k k8s-local/apps/
   ```

2. **Code Changes**:
   ```bash
   # After modifying backend code
   docker build -t mirai-backend:local backend/
   k3d image import mirai-backend:local -c mirai-local
   kubectl rollout restart deployment/mirai-backend -n mirai
   kubectl rollout status deployment/mirai-backend -n mirai
   ```

3. **Monitoring**:
   ```bash
   # Watch pod status
   kubectl get pods -n mirai -w

   # Stream logs
   kubectl logs -n mirai -l app=mirai-backend -f
   ```

## Notes

- These overlays are designed for **local development only**
- Production manifests remain in `../../k8s/` and are managed by ArgoCD
- Never modify production manifests to accommodate local development
- All patches use strategic merge, preserving fields not explicitly overridden
- Images use the `:local` tag convention to avoid confusion with production tags

## Related Documentation

- Production manifests: `/Users/john/homelab-cluster/apps/mirai/k8s/`
- Infrastructure overlays: `/Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/`
- Ingress overlays: `/Users/john/homelab-cluster/apps/mirai/k8s-local/ingress/`
- Kratos overlays: `/Users/john/homelab-cluster/apps/mirai/k8s-local/kratos/`
