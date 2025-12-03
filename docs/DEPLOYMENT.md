# Mirai Deployment Guide

Complete deployment documentation for the Mirai platform on Kubernetes.

## Architecture Overview

```
Code Push → GitHub Actions → Build & Push to GHCR → Update kustomization.yaml
                                                              ↓
                                              ArgoCD detects Git change
                                                              ↓
                                              PreSync: Run DB migrations
                                                              ↓
                                              Deploy via RollingUpdate
                                                              ↓
                                              Health checks pass → Live
```

## Infrastructure Requirements

| Component | Specification |
|-----------|--------------|
| Compute | 3x Mac Mini nodes (Talos Linux) |
| Network | 10Gbps Thunderbolt mesh (MTU 9000) |
| Storage | Local NVMe (databases), 6TB NAS (objects/backups) |
| Container Registry | GitHub Container Registry (GHCR) |

## Deployed Services

| Service | Image | Replicas | Port | Namespace |
|---------|-------|----------|------|-----------|
| Backend | `ghcr.io/sogos-llc/mirai-app/mirai-backend` | 3 | 8080 | mirai |
| Frontend | `ghcr.io/sogos-llc/mirai-app/mirai-frontend` | 3 | 3000 | mirai |
| Marketing | `ghcr.io/sogos-llc/mirai-app/mirai-marketing` | 3 | 3000 | mirai |
| PostgreSQL | CloudNativePG (PostgreSQL 16.4) | 3 | 5432 | mirai |
| Redis | redis:7-alpine | 1 | 6379 | redis |
| Kratos | Ory Kratos v1.3.0 | Via Helm | 4433/4434 | kratos |

## Kubernetes Manifests

```
k8s/
├── kustomization.yaml              # Root kustomization
├── mirai-data-pvc.yaml             # Application data (10Gi NFS)
├── minio-secret.yaml.template      # MinIO credentials
├── backend/
│   ├── deployment.yaml             # 3 replicas, RollingUpdate
│   ├── service.yaml                # ClusterIP
│   ├── kustomization.yaml          # Image tag (GitOps updated)
│   ├── migration-job.yaml          # ArgoCD PreSync hook
│   ├── pdb.yaml                    # PodDisruptionBudget
│   └── networkpolicy-*.yaml        # Egress rules
├── frontend/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── kustomization.yaml
│   └── pdb.yaml
├── frontend-marketing/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── kustomization.yaml
│   └── pdb.yaml
├── cnpg/
│   ├── mirai-cluster.yaml          # 3-node PostgreSQL HA
│   ├── kratos-cluster.yaml         # Auth database
│   └── *-credentials.yaml.template # DB secrets
├── redis/
│   └── redis-deployment.yaml       # Single instance + PVC
└── kratos/
    ├── values.yaml                 # Helm values
    └── kratos-secret.yaml.template
```

## Deployment Configuration

### Backend Deployment

```yaml
# k8s/backend/deployment.yaml highlights
replicas: 3
strategy:
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
resources:
  requests: 100m CPU, 128Mi memory
  limits: 500m CPU, 256Mi memory
probes:
  startup: /health (5s delay, 12 failures allowed)
  liveness: /health (10s interval)
  readiness: /health (5s interval)
security:
  runAsUser: 10000
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
```

**Environment Variables** (from secrets):
- `DATABASE_URL` - PostgreSQL connection string
- `KRATOS_URL`, `KRATOS_ADMIN_URL` - Identity service
- `STRIPE_*` - Payment processing (5 vars)
- `S3_*` - MinIO storage (6 vars)
- `ENCRYPTION_KEY` - AES-256 for API keys
- `FRONTEND_URL`, `BACKEND_URL`, `MARKETING_URL`

### Frontend Deployment

```yaml
replicas: 3
resources:
  requests: 100m CPU, 256Mi memory
  limits: 500m CPU, 512Mi memory
probes:
  startup/liveness/readiness: /api/health
security:
  runAsUser: 1001
```

**Environment Variables**:
- `USE_S3_STORAGE=true`
- `ENABLE_REDIS_CACHE=true`
- `REDIS_URL`, `S3_*`, `KRATOS_*` URLs

### Database Migrations

Migrations run automatically via ArgoCD PreSync hook:

```yaml
# k8s/backend/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  annotations:
    argocd.argoproj.io/hook: PreSync
    argocd.argoproj.io/hook-delete-policy: BeforeHookCreation
spec:
  template:
    spec:
      containers:
      - name: migrate
        command: ["./migrate", "-direction", "up"]
```

## Database (CloudNativePG)

### Mirai Database Cluster

```yaml
# k8s/cnpg/mirai-cluster.yaml
instances: 3
postgresql:
  parameters:
    synchronous_commit: "on"
    shared_buffers: "8GB"
    max_connections: "200"
storage:
  size: 20Gi
  storageClass: local-path  # NVMe
walStorage:
  size: 5Gi
backup:
  barmanObjectStore:
    destinationPath: s3://cnpg-backups/mirai
    endpointURL: http://192.168.1.226:9768
  retentionPolicy: "7d"
  schedule: "0 2 * * *"  # Daily 2 AM
```

**Services Created**:
- `mirai-db-rw` - Read-write (primary)
- `mirai-db-ro` - Read-only replicas
- `mirai-db-r` - Any replica

### Creating Database Secrets

```bash
# From template
cp k8s/cnpg/mirai-db-credentials.yaml.template k8s/cnpg/mirai-db-credentials.yaml
# Edit with actual credentials
kubectl apply -f k8s/cnpg/mirai-db-credentials.yaml
```

## Secrets Management

Secrets are NOT committed to Git. Create from templates:

| Template | Purpose |
|----------|---------|
| `k8s/cnpg/mirai-db-credentials.yaml.template` | Database credentials |
| `k8s/cnpg/backup-credentials.yaml.template` | MinIO backup access |
| `k8s/minio-secret.yaml.template` | Application MinIO access |
| `k8s/kratos/kratos-secret.yaml.template` | Kratos secrets |
| `k8s/backend/stripe-secret.yaml` | Stripe API keys (gitignored) |

```bash
# Example: Create MinIO secret
kubectl create secret generic minio-secret \
  --from-literal=accesskey=$MINIO_ACCESS_KEY \
  --from-literal=secretkey=$MINIO_SECRET_KEY \
  --from-literal=endpoint=http://192.168.1.226:9768 \
  --from-literal=region=us-east-1
```

## Local Development

### Prerequisites

- Docker & Docker Compose
- Go 1.24+
- Node.js 18+
- buf CLI

### Quick Start

```bash
cd local-dev
./start.sh
```

### Local Services (docker-compose.yml)

| Service | Port | Purpose |
|---------|------|---------|
| postgres | 5432 | Shared database |
| kratos | 4433 (public), 4434 (admin) | Authentication |
| redis | 6379 | Cache & job queue |
| minio | 9000 (API), 9001 (console) | Object storage |
| mailpit | 1025 (SMTP), 8025 (web) | Email testing |
| adminer | 8081 | Database browser |
| dozzle | 9999 | Docker log viewer |

### Environment Variables

```bash
# .env.local example
POSTGRES_PASSWORD=localdev
KRATOS_DB_PASSWORD=kratoslocal
MIRAI_DB_PASSWORD=mirailocal
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
```

## Verification Commands

```bash
# Check all pods
kubectl get pods -n mirai

# Check database cluster
kubectl get cluster -n mirai

# View backend logs
kubectl logs -n mirai -l app=mirai-backend -f

# Check ArgoCD sync status
argocd app get mirai-backend
argocd app get mirai-frontend
argocd app get mirai-marketing

# Test backend health
kubectl run curl-test --rm -it --image=curlimages/curl -- \
  curl http://mirai-backend.mirai:8080/health

# Port forward to services
kubectl port-forward -n mirai svc/mirai-frontend 3000:3000
kubectl port-forward -n redis svc/redis 6379:6379
```

## Rollback

```bash
# Via ArgoCD
argocd app rollback mirai-backend

# Via kubectl
kubectl rollout undo deployment/mirai-backend -n mirai
kubectl rollout undo deployment/mirai-frontend -n mirai

# To specific revision
kubectl rollout history deployment/mirai-backend -n mirai
kubectl rollout undo deployment/mirai-backend -n mirai --to-revision=5
```

## Resource Summary

| Service | CPU Request | Memory Request | CPU Limit | Memory Limit |
|---------|-------------|----------------|-----------|--------------|
| Backend (x3) | 100m | 128Mi | 500m | 256Mi |
| Frontend (x3) | 100m | 256Mi | 500m | 512Mi |
| Marketing (x3) | 50m | 128Mi | 200m | 256Mi |
| Redis | 100m | 256Mi | 500m | 512Mi |
| PostgreSQL (x3) | 1000m | 12Gi | 4000m | 16Gi |

## Key File Paths

| File | Purpose |
|------|---------|
| `backend/Dockerfile` | Go backend image |
| `frontend/Dockerfile` | Next.js app image |
| `frontend/Dockerfile.marketing` | Marketing site image |
| `.github/workflows/build-*.yml` | CI/CD pipelines |
| `k8s/*/kustomization.yaml` | Image tags (GitOps) |
