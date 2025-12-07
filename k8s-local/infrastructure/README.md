# Mirai Local Infrastructure

This directory contains Kubernetes manifests for the infrastructure components needed to run Mirai in a local k3d development environment.

## Components

### PostgreSQL
- **Image**: postgres:16.4-alpine
- **Service Name**: `mirai-db.mirai.svc.cluster.local:5432`
- **Databases**: `mirai` (main app), `kratos` (auth)
- **Storage**: 5Gi PVC
- **Init Script**: Automatically creates both databases and extensions

### Redis
- **Image**: redis:7-alpine
- **Service Name**: `redis.mirai.svc.cluster.local:6379`
- **Configuration**: LRU eviction, persistence enabled
- **Resources**: 128Mi memory limit

### MinIO
- **Image**: minio/minio:latest
- **Service Name**: `minio.mirai.svc.cluster.local:9000` (API), `:9001` (Console)
- **Bucket**: `mirai` (auto-created on startup)
- **Storage**: 10Gi PVC
- **Region**: us-east-1

## Service Names

Service names are designed to match production patterns where possible:

| Component | Local Service Name | Port | Production Service Name |
|-----------|-------------------|------|------------------------|
| PostgreSQL | `mirai-db.mirai.svc.cluster.local` | 5432 | `mirai-db.mirai.svc.cluster.local` (CloudNativePG) |
| Redis | `redis.mirai.svc.cluster.local` | 6379 | `redis.redis.svc.cluster.local` (separate namespace) |
| MinIO | `minio.mirai.svc.cluster.local` | 9000 | External: `192.168.1.226:9768` |

**Note**: In production, Redis runs in a separate `redis` namespace. In local dev, all services run in the `mirai` namespace. Applications using Redis must configure the URL via environment variables:
- **Production**: `redis://redis.redis.svc.cluster.local:6379`
- **Local Dev**: `redis://redis.mirai.svc.cluster.local:6379`

## Secrets

All secrets are defined in `secrets.yaml` with **LOCAL DEVELOPMENT ONLY** credentials:

- `postgres-local-secret`: PostgreSQL admin password
- `mirai-db-secret`: Database DSN for backend (matches production format)
- `minio-local-secret`: MinIO root credentials
- `minio-secret`: MinIO credentials in production format for app consumption
- `mirai-encryption-secret`: Encryption key for sensitive data

**WARNING**: These secrets contain placeholder passwords. Never use these in production.

## Deployment

```bash
# Apply all infrastructure components
kubectl apply -k .

# Verify deployment
kubectl get pods -n mirai
kubectl get svc -n mirai
kubectl get pvc -n mirai

# Check logs
kubectl logs -n mirai deployment/postgres
kubectl logs -n mirai deployment/redis
kubectl logs -n mirai deployment/minio
```

## Differences from Production

| Feature | Production | Local Dev |
|---------|-----------|-----------|
| PostgreSQL | CloudNativePG 3-node HA cluster | Single replica Deployment |
| Storage | local-path (NVMe) | Default StorageClass |
| Resources | 12-16Gi RAM per DB | 256-512Mi RAM |
| Backups | S3 backups to NAS | None |
| Replication | Synchronous (RPO=0) | None |
| Monitoring | PodMonitor enabled | None |

## Connection Strings

### PostgreSQL DSN (Mirai Database)
```
postgres://postgres:local-dev-password-postgres-change-me@mirai-db.mirai.svc.cluster.local:5432/mirai?sslmode=disable
```

### PostgreSQL DSN (Kratos Database)
```
postgres://postgres:local-dev-password-postgres-change-me@mirai-db.mirai.svc.cluster.local:5432/kratos?sslmode=disable
```

### Redis URL (Local Dev)
```
redis://redis.mirai.svc.cluster.local:6379
```

### MinIO Endpoint
```
http://minio.mirai.svc.cluster.local:9000
```

**Important**: These connection strings use the local service names. Make sure your application deployments use the correct environment variables for local vs production.

## Accessing Services Locally

If you need to access these services from outside the cluster:

```bash
# PostgreSQL
kubectl port-forward -n mirai svc/mirai-db 5432:5432

# Redis
kubectl port-forward -n mirai svc/redis 6379:6379

# MinIO API
kubectl port-forward -n mirai svc/minio 9000:9000

# MinIO Console
kubectl port-forward -n mirai svc/minio 9001:9001
```

## MinIO Console

Access the MinIO console at http://localhost:9001 after port-forwarding:
- Username: `minioadmin`
- Password: `minioadmin-local-dev`

## Troubleshooting

### PostgreSQL not starting
```bash
kubectl logs -n mirai deployment/postgres
kubectl describe pod -n mirai -l app.kubernetes.io/name=postgres
```

### MinIO bucket not created
The init container creates the bucket. Check its logs:
```bash
kubectl logs -n mirai deployment/minio -c create-bucket
```

### Redis connection issues
```bash
kubectl exec -n mirai deployment/redis -- redis-cli ping
```
