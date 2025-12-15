# Mirai Dev Workflow: Local → UAT → Prod

## Overview

This document describes the development workflow for deploying changes through all environments.

```
Local (.dev) → UAT (sogos.io) → Prod (sogos.io)
     ↓              ↓                ↓
  k3d cluster    ArgoCD          ArgoCD
```

## Prerequisites

- k3d cluster running: `cd k8s-local && ./start.sh`
- kubectl contexts configured:
  - `k3d-mirai-local` - local development
  - `admin@macmini-cluster` - prod/UAT cluster

## Environment URLs

| Environment | Marketing | App | API | Auth |
|-------------|-----------|-----|-----|------|
| **Local** | `get-mirai.dev` | `mirai.dev` | `api.mirai.dev` | `auth.mirai.dev` |
| **UAT** | `get-mirai-uat.sogos.io` | `mirai-uat.sogos.io` | `mirai-api-uat.sogos.io` | `mirai-auth-uat.sogos.io` |
| **Prod** | `get-mirai.sogos.io` | `mirai.sogos.io` | `mirai-api.sogos.io` | `mirai-auth.sogos.io` |

## Workflow Steps

### Step 1: Make Changes Locally

Edit your code in the appropriate directory:
- Frontend app: `frontend/src/`
- Marketing site: `frontend/src/components/landing/`
- Backend: `backend/`

### Step 2: Build and Test Locally

```bash
# Switch to local context
kubectl config use-context k3d-mirai-local

# Build and deploy (picks up source changes)
cd k8s-local
./build-local.sh marketing   # Landing page
./build-local.sh frontend    # Main app
./build-local.sh backend     # API
./build-local.sh all         # Everything
```

Verify at the local `.dev` URLs.

### Step 3: Commit and Push to UAT

```bash
# Sync with any CI commits first
git pull --rebase origin uat

# Commit your changes
git add .
git commit -m "feat: your change description"

# Push to UAT
git push origin uat
```

**What happens automatically:**
1. GitHub Actions builds Docker image
2. CI updates image tag in `k8s-uat/*/kustomization.yaml`
3. CI commits and pushes the tag update
4. ArgoCD detects change and deploys to UAT cluster

### Step 4: Verify on UAT

Wait for CI (~2 min), then verify at `*-uat.sogos.io` URLs.

Check CI status:
```bash
gh run list --repo Sogos-LLC/mirai-app --branch uat --limit 3
```

### Step 5: Create PR to Main

```bash
gh pr create --base main --head uat --title "feat: your change"
```

### Step 6: Merge and Verify Prod

Merge the PR:
```bash
gh pr merge <PR_NUMBER> --merge
```

**What happens automatically:**
1. GitHub Actions builds Docker image for prod
2. CI updates image tag in `k8s/*/kustomization.yaml`
3. ArgoCD deploys to production cluster

Verify at `*.sogos.io` URLs.

## Quick Commands

```bash
# Check which kubectl context you're on
kubectl config current-context

# Switch contexts
kubectl config use-context k3d-mirai-local      # Local
kubectl config use-context admin@macmini-cluster # Prod/UAT

# Check deployment status
kubectl rollout status deployment/mirai-marketing -n mirai-local  # Local
kubectl rollout status deployment/mirai-marketing -n mirai-uat    # UAT
kubectl rollout status deployment/mirai-marketing -n mirai        # Prod

# Check CI status
gh run list --repo Sogos-LLC/mirai-app --branch uat --limit 3
gh run list --repo Sogos-LLC/mirai-app --branch main --limit 3

# Sync local branch with CI commits
git pull --rebase origin uat
git pull --rebase origin main
```

## Important Notes

1. **Always pull before pushing** - CI commits image tag updates back to the repo
2. **UAT branch deploys to UAT**, main branch deploys to prod
3. **Local uses k3d**, UAT/Prod use the homelab cluster via ArgoCD
4. **Build scripts** are in `k8s-local/` directory
