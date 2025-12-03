# MinIO Object Storage

S3-compatible object storage for application data and database backups.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Unraid NAS (192.168.1.226)                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ MinIO Server                                           │ │
│  │ API: :9768    Console: :9769                           │ │
│  │ Storage: /mnt/user/work_data                           │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ S3 API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Kubernetes Cluster                           │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Backend    │  │   Frontend   │  │ CloudNativePG    │  │
│  │ - S3 uploads │  │ - S3 reads   │  │ - WAL archives   │  │
│  │ - Presigned  │  │              │  │ - Full backups   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Buckets

| Bucket | Purpose | Used By |
|--------|---------|---------|
| `mirai` | Application data | Backend, Frontend |
| `cnpg-backups` | Database backups | CloudNativePG |

### Bucket Structure

```
mirai/
├── data/                           # Application data root
│   ├── library.json               # Folder hierarchy
│   └── courses/
│       └── course-*.json          # Course content
└── tenants/                        # Multi-tenant data
    └── {tenant_id}/
        ├── courses/{course_id}/content.json
        ├── sme/{sme_id}/submissions/{task_id}/{filename}
        └── exports/{export_id}/{filename}

cnpg-backups/
├── mirai/                          # Mirai database
│   ├── base/                      # Full backups
│   └── wals/                      # WAL archives
└── kratos/                         # Kratos database
    ├── base/
    └── wals/
```

## Connection Details

| Setting | Value |
|---------|-------|
| Endpoint | http://192.168.1.226:9768 |
| Console | http://192.168.1.226:9769 |
| Region | us-east-1 |
| Bucket | mirai |
| Base Path | data |

## Kubernetes Secrets

### Application Secret

**File**: `k8s/minio-secret.yaml.template`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: default
type: Opaque
stringData:
  accesskey: "$ACCESS_KEY"
  secretkey: "$SECRET_KEY"
  endpoint: "http://192.168.1.226:9768"
  region: "us-east-1"
```

### Backup Credentials

**File**: `k8s/cnpg/backup-credentials.yaml.template`

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cnpg-backup-credentials
  namespace: mirai
stringData:
  ACCESS_KEY_ID: "$MINIO_ACCESS_KEY"
  ACCESS_SECRET_KEY: "$MINIO_SECRET_KEY"
```

## Backend Integration (Go)

**File**: `backend/internal/infrastructure/storage/s3.go`

### Configuration

```go
type S3Config struct {
    Endpoint        string  // http://192.168.1.226:9768
    Region          string  // us-east-1
    Bucket          string  // mirai
    BasePath        string  // data
    AccessKeyID     string
    SecretAccessKey string
}
```

### Key Methods

```go
ReadJSON(ctx, path)                         // Fetch JSON documents
WriteJSON(ctx, path, data)                  // Store JSON documents
GenerateUploadURL(ctx, path, expiry)        // Presigned upload (15 min)
GenerateDownloadURL(ctx, path, expiry)      // Presigned download
ListFiles(ctx, directory)                   // List by prefix
Delete(ctx, path)                           // Remove object
Exists(ctx, path)                           // Check existence
GetContent(ctx, path)                       // Read raw bytes
PutContent(ctx, path, content, contentType) // Write raw bytes
```

### Tenant-Aware Storage

**File**: `backend/internal/infrastructure/storage/tenant_storage.go`

Automatically prefixes paths with tenant ID:

```go
CoursePath(tenantID, courseID)
  → "tenants/{tenant_id}/courses/{course_id}/content.json"

ExportPath(tenantID, exportID, filename)
  → "tenants/{tenant_id}/exports/{export_id}/{filename}"
```

## Frontend Integration (TypeScript)

**File**: `frontend/src/lib/storage/s3Storage.ts`

### Configuration

```typescript
const config = {
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
  bucket: process.env.S3_BUCKET,
};
```

### Features

- AWS SDK v3 (`@aws-sdk/client-s3`)
- Connection pooling (50 max sockets)
- Retry logic (3 attempts)
- Timeout configuration (5 seconds)
- Singleton pattern with lazy initialization

## Presigned URLs

Direct client uploads bypass the backend for large files:

### SME Content Upload Flow

```go
// backend/internal/application/service/sme_service.go
func (s *SMEService) GetUploadURL(ctx, kratosID, taskID, filename, contentType) {
    path := fmt.Sprintf("sme/%s/submissions/%s/%s", smeID, taskID, filename)
    url, _ := s.storage.GenerateUploadURL(ctx, path, 15*time.Minute)
    return url, path
}
```

**Flow**:
1. Frontend requests upload URL from backend
2. Backend generates presigned URL (15 min expiry)
3. Frontend uploads directly to MinIO
4. Frontend notifies backend of completion

## Environment Variables

### Backend Deployment

```yaml
# k8s/backend/deployment.yaml
- name: S3_ENDPOINT
  value: "http://192.168.1.226:9768"
- name: S3_REGION
  value: "us-east-1"
- name: S3_BUCKET
  value: "mirai"
- name: S3_BASE_PATH
  value: "data"
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

### Frontend Deployment

```yaml
# k8s/frontend/deployment.yaml
- name: USE_S3_STORAGE
  value: "true"
- name: S3_ENDPOINT
  value: "http://192.168.1.226:9768"
# ... same credentials pattern
```

## Database Backups (CNPG)

CloudNativePG uses MinIO for PostgreSQL backups:

### Mirai Database

**File**: `k8s/cnpg/mirai-cluster.yaml`

```yaml
backup:
  barmanObjectStore:
    destinationPath: "s3://cnpg-backups/mirai"
    endpointURL: "http://192.168.1.226:9768"
    s3Credentials:
      accessKeyId:
        name: cnpg-backup-credentials
        key: ACCESS_KEY_ID
      secretAccessKey:
        name: cnpg-backup-credentials
        key: ACCESS_SECRET_KEY
    wal:
      compression: gzip
      maxParallel: 4
    data:
      compression: gzip
  retentionPolicy: "7d"
```

### Scheduled Backups

| Database | Schedule | Retention |
|----------|----------|-----------|
| mirai-db | Daily 2:00 AM | 7 days |
| kratos-db | Daily 3:00 AM | 7 days |

### Point-in-Time Recovery

With WAL archiving enabled, CNPG supports PITR:

```yaml
# Restore to specific time
bootstrap:
  recovery:
    source: mirai-db
    recoveryTarget:
      targetTime: "2024-01-15T10:30:00Z"
```

## Local Development

### Docker Compose

```yaml
# local-dev/docker-compose.yml
minio:
  image: minio/minio:latest
  container_name: mirai-minio
  ports:
    - "9000:9000"   # API
    - "9001:9001"   # Console
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY:-minioadmin}
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY:-minioadmin}
  command: server /data --console-address ":9001"
  volumes:
    - minio_data:/data

minio-setup:
  image: minio/mc
  depends_on:
    - minio
  entrypoint: >
    /bin/sh -c "
    mc alias set local http://minio:9000 minioadmin minioadmin;
    mc mb local/mirai --ignore-existing;
    mc anonymous set download local/mirai;
    "
```

### Local URLs

- API: http://localhost:9000
- Console: http://localhost:9001
- Credentials: minioadmin/minioadmin

## Operations

### Test Connection

```bash
# Install MinIO client
brew install minio/stable/mc

# Configure alias
mc alias set mirai http://192.168.1.226:9768 $ACCESS_KEY $SECRET_KEY

# List bucket contents
mc ls mirai/mirai/data/

# View tree structure
mc tree mirai/mirai --files
```

### Backup/Restore

```bash
# Backup bucket
mc mirror mirai/mirai ./backup/

# Restore bucket
mc mirror ./backup/ mirai/mirai
```

### Check Backup Status

```bash
# List CNPG backups
kubectl get backups -n mirai

# Check MinIO backup contents
mc ls mirai/cnpg-backups/mirai/
```

## Graceful Degradation

Backend falls back to local storage without S3 credentials:

```go
// backend/cmd/server/main.go
if cfg.S3AccessKey != "" && cfg.S3SecretKey != "" {
    baseStorage = storage.NewS3Storage(ctx, s3Config)
    logger.Info("using S3/MinIO storage")
} else {
    baseStorage = storage.NewLocalStorage("./data")
    logger.Warn("S3 credentials not configured, using local storage")
}
```

## Key Files

| File | Purpose |
|------|---------|
| `k8s/minio-secret.yaml.template` | Application credentials |
| `k8s/cnpg/backup-credentials.yaml.template` | Backup credentials |
| `k8s/cnpg/mirai-cluster.yaml` | Database backup config |
| `backend/internal/infrastructure/storage/s3.go` | Go S3 adapter |
| `backend/internal/infrastructure/storage/tenant_storage.go` | Tenant isolation |
| `frontend/src/lib/storage/s3Storage.ts` | TypeScript S3 adapter |
| `local-dev/docker-compose.yml` | Local MinIO setup |
