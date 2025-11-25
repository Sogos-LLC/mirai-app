# Mirai Frontend Deployment Guide

This guide covers deploying the Mirai frontend to your Kubernetes cluster using GitHub Actions and ArgoCD.

## Prerequisites

- [x] GitHub repository set up
- [x] Kubernetes cluster running (Talos)
- [x] ArgoCD installed and configured
- [x] Cloudflare Tunnel configured
- [x] `kubectl` access to your cluster

## Architecture
```
GitHub Push → GitHub Actions → Build Docker Image → Push to GHCR
                                                           ↓
                                    ArgoCD detects new image
                                                           ↓
                              Pulls from GHCR and deploys to K8s
                                                           ↓
                              Cloudflare Tunnel routes traffic
```

## Setup Steps

### 1. Configure GitHub Container Registry

Run the setup script:
```bash
./scripts/setup-cicd.sh
```

This will prompt for your GitHub username and update all necessary files.

### 2. Enable GitHub Container Registry

Your GitHub repository needs the Container registry enabled:

1. Go to your repo on GitHub
2. Settings → Actions → General
3. Ensure "Read and write permissions" is selected under "Workflow permissions"

### 3. Push to GitHub
```bash
git add .
git commit -m "Add frontend CI/CD pipeline"
git push origin main
```

GitHub Actions will automatically:
- Build the Docker image
- Push to `ghcr.io/YOUR_USERNAME/mirai-prototype/mirai-frontend:latest`
- Tag with branch name and commit SHA

### 4. Verify Docker Image

Check that the image was pushed successfully:
```bash
# View the package on GitHub
# https://github.com/YOUR_USERNAME/mirai-prototype/pkgs/container/mirai-prototype%2Fmirai-frontend
```

### 5. Deploy with ArgoCD
```bash
# Apply the ArgoCD Application
kubectl apply -f k8s/argocd-frontend-app.yaml

# Check ArgoCD status
argocd app get mirai-frontend

# Sync manually (first time)
argocd app sync mirai-frontend
```

### 6. Configure Cloudflare Tunnel

Update your Cloudflare Tunnel to route to the new service:

**Option A: Using kubectl (if using ConfigMap)**
```bash
kubectl edit configmap cloudflared-config
```

Add:
```yaml
- hostname: mirai.sogos.io
  service: http://mirai-frontend:80
```

**Option B: Using Cloudflare Dashboard**
1. Go to Zero Trust → Networks → Tunnels
2. Edit your tunnel
3. Add public hostname: `mirai.sogos.io` → `http://mirai-frontend:80`

**Option C: Using Cloudflare CLI**
```bash
cloudflared tunnel route dns YOUR_TUNNEL_NAME mirai.sogos.io
```

### 7. Verify Deployment
```bash
# Check pods
kubectl get pods -l app=mirai-frontend

# Check service
kubectl get svc mirai-frontend

# Check logs
kubectl logs -l app=mirai-frontend -f

# Test internal connectivity
kubectl run curl-test --image=curlimages/curl --rm -it -- \
  curl http://mirai-frontend:80
```

### 8. Access the Application

Visit: https://mirai.sogos.io

## Continuous Deployment Workflow

Once set up, the workflow is:

1. **Make changes** to frontend code
2. **Commit and push** to `main` branch
3. **GitHub Actions** automatically builds and pushes new image
4. **ArgoCD** detects new image (within ~3 minutes)
5. **ArgoCD** deploys to cluster with rolling update
6. **Changes are live** at https://mirai.sogos.io

## Troubleshooting

### GitHub Actions fails to push image

**Issue**: `denied: permission_denied`

**Solution**: 
```bash
# Make package public
# Go to: github.com/YOUR_USERNAME/mirai-prototype/pkgs/container/mirai-prototype%2Fmirai-frontend/settings
# Change visibility to Public
```

### ArgoCD not detecting new images

**Issue**: ArgoCD shows "Synced" but old image

**Solution**:
```bash
# Force refresh
argocd app get mirai-frontend --refresh

# Or enable image updater
kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mirai-frontend
  namespace: argocd
  annotations:
    argocd-image-updater.argoproj.io/image-list: frontend=ghcr.io/YOUR_USERNAME/mirai-prototype/mirai-frontend
    argocd-image-updater.argoproj.io/frontend.update-strategy: latest
spec:
  # ... rest of spec
EOF
```

### Pods not starting

**Issue**: `ImagePullBackOff`

**Solution**:
```bash
# Check if image exists
docker pull ghcr.io/YOUR_USERNAME/mirai-prototype/mirai-frontend:latest

# If private, create pull secret
kubectl create secret docker-registry ghcr-secret \
  --docker-server=ghcr.io \
  --docker-username=YOUR_USERNAME \
  --docker-password=YOUR_GITHUB_PAT \
  --docker-email=YOUR_EMAIL

# Add to deployment
kubectl patch deployment mirai-frontend -p '{"spec":{"template":{"spec":{"imagePullSecrets":[{"name":"ghcr-secret"}]}}}}'
```

### Can't access via Cloudflare Tunnel

**Issue**: 502 Bad Gateway

**Solution**:
```bash
# Check cloudflared logs
kubectl logs -l app=cloudflared --tail=50

# Verify service endpoint
kubectl get endpoints mirai-frontend

# Test service internally
kubectl run -it --rm debug --image=curlimages/curl -- \
  curl -v http://mirai-frontend:80
```

## Rolling Back
```bash
# Via ArgoCD
argocd app rollback mirai-frontend

# Via kubectl
kubectl rollout undo deployment/mirai-frontend

# To specific revision
kubectl rollout undo deployment/mirai-frontend --to-revision=2
```

## Monitoring
```bash
# Watch deployment
kubectl get pods -l app=mirai-frontend -w

# View logs
kubectl logs -l app=mirai-frontend -f --tail=100

# ArgoCD UI
kubectl port-forward svc/argocd-server -n argocd 8080:80
# Visit: http://localhost:8080
```

## Advanced: Image Tagging Strategy

By default, images are tagged with:
- `latest` (on main branch)
- `main-<sha>` (commit SHA)
- Branch name (on feature branches)

To use specific versions:
```yaml
# In k8s/frontend/deployment.yaml
image: ghcr.io/YOUR_USERNAME/mirai-prototype/mirai-frontend:main-abc1234
```

## Cleanup
```bash
# Remove ArgoCD application
kubectl delete application mirai-frontend -n argocd

# Remove Kubernetes resources
kubectl delete -k k8s/frontend/

# Remove from Cloudflare Tunnel
# (Remove hostname from tunnel config)
```
