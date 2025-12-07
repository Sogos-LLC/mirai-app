# Quick Reference - Mirai Local Infrastructure

## Deploy

```bash
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/
```

## Check Status

```bash
kubectl get all -n mirai
kubectl get pvc -n mirai
```

## Port Forward Commands

```bash
# PostgreSQL (Mirai DB on port 5432, Kratos DB on same server)
kubectl port-forward -n mirai svc/mirai-db 5432:5432

# Redis
kubectl port-forward -n mirai svc/redis 6379:6379

# MinIO API
kubectl port-forward -n mirai svc/minio 9000:9000

# MinIO Console
kubectl port-forward -n mirai svc/minio 9001:9001
```

## Connection Details

### PostgreSQL
- **Host**: `mirai-db.mirai.svc.cluster.local` (or `localhost` via port-forward)
- **Port**: `5432`
- **User**: `postgres`
- **Password**: `local-dev-password-postgres-change-me`
- **Databases**: `mirai`, `kratos`

```bash
# Connect via port-forward
psql postgres://postgres:local-dev-password-postgres-change-me@localhost:5432/mirai

# List databases
psql postgres://postgres:local-dev-password-postgres-change-me@localhost:5432/postgres -c '\l'
```

### Redis
- **Host**: `redis.mirai.svc.cluster.local` (or `localhost` via port-forward)
- **Port**: `6379`
- **Password**: None (local dev)

```bash
# Connect via port-forward
redis-cli -h localhost

# Test connection
redis-cli -h localhost ping
```

### MinIO
- **API Endpoint**: `http://minio.mirai.svc.cluster.local:9000` (or `http://localhost:9000`)
- **Console**: `http://localhost:9001` (port-forward required)
- **Access Key**: `minioadmin`
- **Secret Key**: `minioadmin-local-dev`
- **Region**: `us-east-1`
- **Bucket**: `mirai` (auto-created)

```bash
# Access console
kubectl port-forward -n mirai svc/minio 9001:9001
# Open http://localhost:9001
```

## Environment Variables for Apps

Copy these for your local deployments:

```yaml
# Backend / Migration Jobs
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: mirai-db-secret
      key: dsn

# Frontend (if using Redis)
- name: REDIS_URL
  value: "redis://redis.mirai.svc.cluster.local:6379"

# Backend (MinIO/S3)
- name: S3_ENDPOINT
  valueFrom:
    secretKeyRef:
      name: minio-secret
      key: endpoint
- name: S3_REGION
  valueFrom:
    secretKeyRef:
      name: minio-secret
      key: region
- name: S3_BUCKET
  value: "mirai"
- name: S3_ACCESS_KEY
  valueFrom:
    secretKeyRef:
      name: minio-secret
      key: accesskey
- name: S3_SECRET_KEY
  valueFrom:
    secretKeyRef:
      name: minio-secret
      key: secretkey
```

## Logs

```bash
# PostgreSQL
kubectl logs -n mirai deployment/postgres -f

# Redis
kubectl logs -n mirai deployment/redis -f

# MinIO (main container)
kubectl logs -n mirai deployment/minio -c minio -f

# MinIO (bucket creation sidecar)
kubectl logs -n mirai deployment/minio -c create-bucket
```

## Troubleshooting

```bash
# Describe pods
kubectl describe pod -n mirai -l app.kubernetes.io/name=postgres
kubectl describe pod -n mirai -l app.kubernetes.io/name=redis
kubectl describe pod -n mirai -l app.kubernetes.io/name=minio

# Events
kubectl get events -n mirai --sort-by='.lastTimestamp'

# Shell into containers
kubectl exec -n mirai deployment/postgres -it -- bash
kubectl exec -n mirai deployment/redis -it -- sh
kubectl exec -n mirai deployment/minio -c minio -it -- sh

# Test connectivity from a debug pod
kubectl run -n mirai debug --image=busybox:1.36 -it --rm -- sh
# Then inside the pod:
nslookup mirai-db.mirai.svc.cluster.local
nslookup redis.mirai.svc.cluster.local
nslookup minio.mirai.svc.cluster.local
```

## Reset / Cleanup

```bash
# Delete all infrastructure (keeps PVCs)
kubectl delete -k /Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/

# Delete PVCs (DATA LOSS!)
kubectl delete pvc -n mirai postgres-data
kubectl delete pvc -n mirai minio-data

# Redeploy fresh
kubectl apply -k /Users/john/homelab-cluster/apps/mirai/k8s-local/infrastructure/
```

## Secrets Reference

All secrets are in `secrets.yaml` (LOCAL DEV ONLY):

| Secret Name | Keys | Purpose |
|-------------|------|---------|
| `postgres-local-secret` | `postgres-password` | PostgreSQL admin password |
| `mirai-db-secret` | `password`, `dsn` | Database connection for backend |
| `minio-local-secret` | `root-user`, `root-password` | MinIO admin credentials |
| `minio-secret` | `accesskey`, `secretkey`, `endpoint`, `region` | MinIO access for apps |
| `mirai-encryption-secret` | `encryption-key` | Encryption key for sensitive data |

## Resource Requests/Limits

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| PostgreSQL | 100m | 500m | 256Mi | 512Mi |
| Redis | 50m | 200m | 128Mi | 256Mi |
| MinIO | 100m | 500m | 256Mi | 512Mi |
| MinIO Sidecar | 10m | 50m | 32Mi | 64Mi |

**Total**: ~260m CPU request, ~1.15 GiB memory request
