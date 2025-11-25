# Mirai App

A Next.js learning platform application deployed via GitOps.

## Structure

```
mirai-app/
├── frontend/     # Next.js application
├── k8s/          # Kubernetes manifests
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── redis/    # Redis caching layer
│   └── overlays/ # Environment-specific configs
├── docs/         # Application documentation
└── backups/      # Configuration backups
```

## Development

```bash
cd frontend
npm install
npm run dev
```

## Deployment

This app is deployed via ArgoCD from the [homelab-platform](https://github.com/sojohnnysaid/homelab-platform) repo.

### CI/CD Flow

1. Push changes to `frontend/`
2. GitHub Actions builds and pushes Docker image to GHCR
3. Kustomization is updated with new image tag
4. ArgoCD detects change and deploys to cluster

### Manual Deploy

```bash
kubectl apply -k k8s/
```

## Related Repos

- [homelab-platform](https://github.com/sojohnnysaid/homelab-platform) - Platform infrastructure & ArgoCD apps
- [homelab-talos](https://github.com/sojohnnysaid/homelab-talos) - Talos Linux cluster config
