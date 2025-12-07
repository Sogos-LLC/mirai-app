# Mirai k3d Local Development

Kubernetes manifests for running the complete Mirai stack in a local k3d cluster.

## Directory Structure

```
k8s-local/
├── cluster-config.yaml          # k3d cluster configuration
├── namespaces.yaml              # Namespace definitions
├── infrastructure/              # Database, cache, storage
│   ├── postgres/               # PostgreSQL 16.4 (mirai + kratos DBs)
│   ├── redis/                  # Redis 7 (cache + queue)
│   ├── minio/                  # MinIO S3-compatible storage
│   ├── secrets.yaml            # LOCAL DEV ONLY secrets
│   ├── kustomization.yaml      # Kustomize config
│   └── README.md              # Infrastructure documentation
└── README.md                   # This file
```

## Quick Start

### 1. Create k3d Cluster

```bash
cd /Users/john/homelab-cluster/apps/mirai/k8s-local
k3d cluster create mirai-local --config cluster-config.yaml
```

### 2. Create Namespaces

```bash
kubectl apply -f namespaces.yaml
```

### 3. Deploy Infrastructure

```bash
kubectl apply -k infrastructure/
```

### 4. Verify Infrastructure

```bash
# Check all pods are running
kubectl get pods -n mirai

# Expected output:
# NAME                        READY   STATUS    RESTARTS   AGE
# postgres-xxx                1/1     Running   0          1m
# redis-xxx                   1/1     Running   0          1m
# minio-xxx                   2/2     Running   0          1m
```

### 5. Deploy Applications

```bash
# TODO: Application manifests in separate directories
# - Ory Kratos (authentication)
# - Mirai Backend (Connect-RPC API)
# - Mirai Frontend (Next.js)
```

## Architecture

### Local vs Production

| Component | Production | Local Dev |
|-----------|-----------|-----------|
| **Cluster** | Talos Linux (3x Mac Mini M4) | k3d (Docker) |
| **Database** | CloudNativePG 3-node HA | Single PostgreSQL pod |
| **Redis** | Dedicated namespace | Same namespace |
| **MinIO** | External NAS | In-cluster pod |
| **Storage** | local-path (NVMe) | k3d default |
| **Ingress** | Traefik (production) | k3d LoadBalancer |

### Namespaces

All local services run in the `mirai` namespace for simplicity, unlike production which uses separate namespaces (`mirai`, `redis`, `kratos`).

### Service Discovery

Services use fully qualified domain names (FQDN):
- PostgreSQL: `mirai-db.mirai.svc.cluster.local:5432`
- Redis: `redis.mirai.svc.cluster.local:6379`
- MinIO: `minio.mirai.svc.cluster.local:9000`

Applications should use environment variables for these URLs to support both local and production deployments.

## Development Workflow

### Accessing Services

```bash
# PostgreSQL (both mirai and kratos databases)
kubectl port-forward -n mirai svc/mirai-db 5432:5432
psql postgres://postgres:local-dev-password-postgres-change-me@localhost:5432/mirai

# Redis
kubectl port-forward -n mirai svc/redis 6379:6379
redis-cli -h localhost

# MinIO Console
kubectl port-forward -n mirai svc/minio 9001:9001
# Open http://localhost:9001 (minioadmin / minioadmin-local-dev)
```

### Running Migrations

```bash
# Mirai database migrations
kubectl exec -n mirai deployment/postgres -- \
  psql -U postgres -d mirai -c "SELECT version()"

# Kratos will run its own migrations on startup
```

### Logs

```bash
# Infrastructure logs
kubectl logs -n mirai deployment/postgres
kubectl logs -n mirai deployment/redis
kubectl logs -n mirai deployment/minio

# Follow logs
kubectl logs -n mirai deployment/postgres -f
```

### Resource Usage

Local dev infrastructure is configured with minimal resources:
- PostgreSQL: 256Mi-512Mi RAM, 100m-500m CPU
- Redis: 128Mi-256Mi RAM, 50m-200m CPU
- MinIO: 256Mi-512Mi RAM, 100m-500m CPU

Total: ~1-1.5GB RAM for infrastructure (suitable for development laptops)

## Secrets Management

**WARNING**: The `infrastructure/secrets.yaml` file contains hardcoded passwords for LOCAL DEVELOPMENT ONLY.

These secrets should NEVER be used in production:
- PostgreSQL password: `local-dev-password-postgres-change-me`
- MinIO credentials: `minioadmin` / `minioadmin-local-dev`
- Encryption key: 32-byte placeholder

For production, secrets are managed via separate encrypted secret files and external secret stores.

## Cleanup

```bash
# Delete infrastructure (keeps PVCs)
kubectl delete -k infrastructure/

# Delete entire cluster
k3d cluster delete mirai-local

# This will destroy all data including PVCs
```

## Next Steps

1. Deploy Ory Kratos for authentication
2. Deploy Mirai backend (Connect-RPC API)
3. Deploy Mirai frontend (Next.js)
4. Configure ingress/routing for local access
5. Set up local development tools (hot reload, debugging)

## Troubleshooting

### Pods not starting

```bash
kubectl describe pod -n mirai <pod-name>
kubectl get events -n mirai --sort-by='.lastTimestamp'
```

### PVC not binding

```bash
kubectl get pvc -n mirai
kubectl describe pvc -n mirai <pvc-name>

# k3d should have a default StorageClass
kubectl get storageclass
```

### Service DNS not resolving

```bash
# Test from a debug pod
kubectl run -n mirai debug --image=busybox -it --rm -- sh
nslookup mirai-db.mirai.svc.cluster.local
```

## Documentation

- Infrastructure details: [`infrastructure/README.md`](/Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/README.md)
- Production k8s: [`k8s/`](/Users/john/homelab-cluster/apps/mirai/k8s/)
- Project overview: [`CLAUDE.md`](/Users/john/homelab-cluster/apps/mirai/CLAUDE.md)
