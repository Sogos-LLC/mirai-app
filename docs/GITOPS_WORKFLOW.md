# GitOps Workflow for Mirai Frontend

## Problem Statement
ArgoCD only watches Git repositories for changes, not container registries. When using mutable tags like `:latest`, ArgoCD doesn't detect when new images are pushed, resulting in pods not being updated despite showing "Synced" status.

## Solution: Immutable Tags with Automated Manifest Updates

### Workflow Options

We've implemented three workflow options for you to choose from:

#### Option 1: Direct Manifest Update (`build-frontend-gitops.yml`)
- **Pros:** Simple, direct approach
- **Cons:** Modifies deployment.yaml directly
- **Best for:** Small teams, simple setups

#### Option 2: Kustomize-based Update (`build-frontend-kustomize.yml`) ⭐ RECOMMENDED
- **Pros:**
  - Clean separation of concerns
  - Easier to manage multiple environments
  - Standard GitOps practice
- **Cons:** Requires Kustomize knowledge
- **Best for:** Production environments, teams following GitOps best practices

#### Option 3: Keep Original (`build-frontend.yml`)
- **Pros:** No manifest changes needed
- **Cons:** Requires manual pod restarts or ArgoCD hard refresh
- **Best for:** Development environments only

## How It Works

### The Kustomize Workflow (Recommended)

1. **Developer pushes code** to `main` branch
2. **GitHub Actions triggers** the workflow
3. **Build & Push**:
   - Builds Docker image
   - Tags with commit SHA (e.g., `ghcr.io/.../mirai-frontend:abc1234`)
   - Pushes to GitHub Container Registry
4. **Update Manifest**:
   - Uses Kustomize to update `kustomization.yaml`
   - Changes only the `newTag` field
   - Commits change back to Git
5. **ArgoCD detects** the Git change
6. **Automatic deployment** occurs

### Image Tagging Strategy

```
ghcr.io/sojohnnysaid/mirai-prototype/mirai-frontend:<tag>

Tags:
- abc1234          # Short commit SHA (main branch)
- latest           # Always points to newest main build
- sha-abc1234      # Full SHA reference
- pr-123-def5678   # PR builds (not deployed)
```

## Setup Instructions

### 1. Choose Your Workflow

Delete the workflows you don't want to use:
```bash
# Keep only one:
- .github/workflows/build-frontend.yml          # Original (not recommended)
- .github/workflows/build-frontend-gitops.yml   # Direct update
- .github/workflows/build-frontend-kustomize.yml # Kustomize (recommended)
```

### 2. Configure ArgoCD Application

Ensure your ArgoCD application is configured to:
```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mirai-frontend
spec:
  source:
    repoURL: https://github.com/sojohnnysaid/mirai-prototype
    targetRevision: main
    path: k8s/frontend  # Points to kustomization.yaml
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
```

### 3. Handle Circular Commits

The workflow commits back to the repo. To avoid infinite loops:
- Commits include `[skip ci]` in the message
- Only manifest files are updated
- GitHub Actions bot is used for commits

## Testing the Workflow

1. Make a change to frontend code:
```bash
echo "// test" >> frontend/src/app/page.tsx
git add .
git commit -m "test: trigger deployment"
git push
```

2. Watch GitHub Actions:
- Go to Actions tab in GitHub
- Watch the workflow run

3. Check the automated commit:
```bash
git pull
git log --oneline -2
# You'll see:
# abc1234 chore: update frontend image to def5678 [skip ci]
# def5678 test: trigger deployment
```

4. Monitor ArgoCD:
- ArgoCD will show "OutOfSync" briefly
- Auto-sync will trigger
- New pods will be created with the new image

## Troubleshooting

### ArgoCD Not Syncing
- Check if the manifest commit was pushed
- Verify ArgoCD has repo access
- Check sync policies in ArgoCD

### Workflow Failing
- Check GitHub Actions permissions
- Ensure GITHUB_TOKEN has write access
- Verify Docker registry credentials

### Image Not Found
- Check image tag in kustomization.yaml
- Verify image exists in GHCR
- Check imagePullPolicy in deployment

## Benefits of This Approach

1. **Full Traceability**: Every deployment tied to a specific commit
2. **Rollback Capability**: Easy to revert by reverting the manifest commit
3. **GitOps Compliance**: Git as single source of truth
4. **Automated**: No manual intervention needed
5. **Auditable**: Complete history in Git

## Alternative: ArgoCD Image Updater

For a more advanced setup, consider [ArgoCD Image Updater](https://argocd-image-updater.readthedocs.io/):
- Watches container registry directly
- Updates manifests automatically
- Requires additional component installation

## Migration Path

1. **Current State**: Using `:latest` tag with no updates
2. **Phase 1**: Implement Kustomize workflow (this guide)
3. **Phase 2**: Add environment-specific overlays
4. **Phase 3**: Implement progressive delivery (Flagger/Argo Rollouts)

## Security Considerations

- Use fine-grained PAT tokens if needed
- Implement branch protection rules
- Consider signing commits
- Use image scanning in CI/CD
- Implement RBAC in ArgoCD

## Next Steps

1. Choose and enable your preferred workflow
2. Update ArgoCD application if needed
3. Test with a small change
4. Monitor the full cycle
5. Document any customizations for your team