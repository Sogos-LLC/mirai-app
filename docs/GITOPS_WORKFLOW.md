# GitOps Workflow

Automated deployment pipeline for Mirai using GitHub Actions and ArgoCD.

## Workflow Overview

```
Developer Push to main
        ↓
GitHub Actions (build-*.yml)
        ↓
┌───────────────────────────────┐
│ 1. Build Docker image         │
│ 2. Tag with short SHA         │
│ 3. Push to GHCR               │
│ 4. Update kustomization.yaml  │
│ 5. Commit with [skip ci]      │
└───────────────────────────────┘
        ↓
Git Repository Updated
        ↓
ArgoCD Detects Change
        ↓
┌───────────────────────────────┐
│ 1. PreSync: Run migrations    │
│ 2. Apply manifests            │
│ 3. RollingUpdate deployment   │
│ 4. Health checks              │
└───────────────────────────────┘
        ↓
New Version Live
```

## GitHub Actions Workflows

### File Locations

| Workflow | File | Trigger |
|----------|------|---------|
| Backend | `.github/workflows/build-backend.yml` | `backend/**` changes |
| Frontend | `.github/workflows/build-frontend.yml` | `frontend/**` changes |
| Marketing | `.github/workflows/build-marketing.yml` | `frontend/**` changes |

### Build Process

Each workflow performs:

```yaml
# 1. Checkout with full history
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

# 2. Setup Docker Buildx
- uses: docker/setup-buildx-action@v3

# 3. Login to GHCR
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}

# 4. Build and push
- uses: docker/build-push-action@v5
  with:
    push: true
    tags: |
      ghcr.io/sogos-llc/mirai-app/mirai-backend:${{ env.VERSION }}
      ghcr.io/sogos-llc/mirai-app/mirai-backend:latest
      ghcr.io/sogos-llc/mirai-app/mirai-backend:sha-${{ github.sha }}
    cache-from: type=gha
    cache-to: type=gha,mode=max

# 5. Update kustomization.yaml
- run: |
    cd k8s/backend
    kustomize edit set image ghcr.io/.../mirai-backend=ghcr.io/.../mirai-backend:$VERSION

# 6. Commit and push
- run: |
    git add k8s/backend/kustomization.yaml
    git commit -m "chore: update backend image to $VERSION [skip ci]"
    git push
```

### Conflict Resolution

Concurrent builds may conflict when updating manifests. The workflow includes retry logic:

```yaml
# Retry up to 3 times
for i in 1 2 3; do
  git pull --rebase origin main
  git push && break
  sleep 5
done
```

## Image Tagging Strategy

| Tag | Example | Lifecycle |
|-----|---------|-----------|
| Short SHA | `e5c2216` | Immutable, used for deployment |
| `latest` | Always current | Mutable, updated each build |
| Full SHA | `sha-e5c2216abc...` | Immutable reference |

**Current Production Tags** (from kustomization.yaml):
- Backend: Check `k8s/backend/kustomization.yaml`
- Frontend: Check `k8s/frontend/kustomization.yaml`
- Marketing: Check `k8s/frontend-marketing/kustomization.yaml`

## ArgoCD Configuration

### Application Definitions

Location: External ArgoCD repository (homelab-platform)

```yaml
# Example: mirai-backend application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mirai-backend
  namespace: argocd
spec:
  project: applications
  source:
    repoURL: https://github.com/Sogos-LLC/mirai-app.git
    targetRevision: main
    path: k8s/backend
  destination:
    server: https://kubernetes.default.svc
    namespace: mirai
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

### Sync Policy

| Setting | Value | Purpose |
|---------|-------|---------|
| `prune` | true | Delete resources removed from Git |
| `selfHeal` | true | Revert manual cluster changes |
| `retry.limit` | 5 | Retry failed syncs |

## Kustomization Files

Each service has a kustomization file that gets updated by CI:

```yaml
# k8s/backend/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - deployment.yaml
  - service.yaml
  - migration-job.yaml
  - pdb.yaml
  - networkpolicy-allow-kratos.yaml
  - networkpolicy-allow-redis.yaml
  - networkpolicy-allow-smtp.yaml
images:
  - name: ghcr.io/sogos-llc/mirai-app/mirai-backend
    newName: ghcr.io/sogos-llc/mirai-app/mirai-backend
    newTag: e5c2216  # Updated by GitHub Actions
```

## Deployment Strategy

### RollingUpdate Configuration

```yaml
# All deployments use:
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1         # One extra pod during update
    maxUnavailable: 0   # Never reduce capacity
```

### Health Checks

Kubernetes waits for health checks before routing traffic:

| Check | Backend | Frontend | Marketing |
|-------|---------|----------|-----------|
| Startup | `/health` | `/api/health` | `/` |
| Liveness | `/health` | `/api/health` | `/` |
| Readiness | `/health` | `/api/health` | `/` |

### Pod Disruption Budgets

All services have PDBs to ensure availability during updates:

```yaml
# All services
maxUnavailable: 1
# With 3 replicas: at least 2 always running
```

## Deployment Lifecycle

### Timeline

1. **T+0s**: Push to main
2. **T+30s**: GitHub Actions starts
3. **T+2-5m**: Image built and pushed
4. **T+5-6m**: Kustomization updated, committed
5. **T+6-9m**: ArgoCD detects change (3m poll interval)
6. **T+9-10m**: PreSync migrations run
7. **T+10-12m**: New pods created
8. **T+12-14m**: Health checks pass
9. **T+14-15m**: Old pods terminated
10. **T+15m**: Deployment complete

### Automated Commits

CI generates commits following this pattern:

```
chore: update backend image to e5c2216

[skip ci]
```

The `[skip ci]` marker prevents infinite build loops.

## Monitoring Deployments

### ArgoCD CLI

```bash
# Check sync status
argocd app get mirai-backend
argocd app get mirai-frontend
argocd app get mirai-marketing

# Force sync
argocd app sync mirai-backend

# View history
argocd app history mirai-backend
```

### kubectl

```bash
# Watch rollout
kubectl rollout status deployment/mirai-backend -n mirai

# View rollout history
kubectl rollout history deployment/mirai-backend -n mirai

# Check current image
kubectl get deployment mirai-backend -n mirai -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### Git History

```bash
# View deployment history
git log --oneline --grep="update.*image"

# Recent commits
git log --oneline -5
# Example output:
# e5c2216 chore: update backend image to e5c2216 [skip ci]
# abc1234 feat: add new API endpoint
```

## Rollback Procedures

### Via ArgoCD

```bash
# Rollback to previous sync
argocd app rollback mirai-backend

# Rollback to specific revision
argocd app history mirai-backend
argocd app rollback mirai-backend <revision>
```

### Via Git

```bash
# Revert the kustomization change
git revert HEAD  # If last commit was image update
git push

# Or manually set specific tag
cd k8s/backend
kustomize edit set image ghcr.io/.../mirai-backend=ghcr.io/.../mirai-backend:<old-tag>
git add kustomization.yaml
git commit -m "chore: rollback backend to <old-tag>"
git push
```

### Via kubectl

```bash
# Immediate rollback
kubectl rollout undo deployment/mirai-backend -n mirai

# To specific revision
kubectl rollout undo deployment/mirai-backend -n mirai --to-revision=5
```

## Security

### Workflow Permissions

```yaml
# Required in workflow
permissions:
  contents: write      # Push kustomization changes
  packages: write      # Push to GHCR
```

### Container Registry

- Images are public in GHCR
- No imagePullSecrets required
- OCI labels applied for traceability

### Hardened Deployments

All deployments include:
- Non-root user execution
- Read-only root filesystem
- No privilege escalation
- seccomp profile: RuntimeDefault
- Dropped capabilities

## Key Files

| File | Purpose |
|------|---------|
| `.github/workflows/build-backend.yml` | Backend CI/CD |
| `.github/workflows/build-frontend.yml` | Frontend CI/CD |
| `.github/workflows/build-marketing.yml` | Marketing CI/CD |
| `k8s/backend/kustomization.yaml` | Backend image tag |
| `k8s/frontend/kustomization.yaml` | Frontend image tag |
| `k8s/frontend-marketing/kustomization.yaml` | Marketing image tag |
| `k8s/backend/deployment.yaml` | Backend K8s deployment |
| `k8s/frontend/deployment.yaml` | Frontend K8s deployment |
| `k8s/backend/migration-job.yaml` | PreSync DB migrations |
