# MinIO Storage Integration

## Overview

This document describes how MinIO provides S3-compatible persistent storage for the Mirai application running on the Kubernetes cluster.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Mac Mini Cluster  │     │    Unraid NAS        │     │   Future: AWS   │
│                     │     │                      │     │                 │
│  ┌──────────────┐  │     │  ┌────────────────┐  │     │  ┌───────────┐  │
│  │ Mirai App    │──┼─────┼─▶│ MinIO Server   │  │     │  │   AWS S3  │  │
│  │ (Kubernetes) │  │     │  │ Port: 9768     │  │────▶│  │           │  │
│  └──────────────┘  │     │  │ Bucket: mirai  │  │     │  └───────────┘  │
│                     │     │  └────────────────┘  │     │                 │
│  3x Mac Minis       │     │  2TB Work Drive      │     │  S3-Compatible  │
│  Running Talos OS   │     │  IP: 192.168.1.226  │     │                 │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Components

### 1. MinIO Server (Unraid NAS)
- **Location**: Unraid NAS at `192.168.1.226`
- **API Port**: `9768`
- **Console Port**: `9769`
- **Storage**: 2TB Work Drive
- **Bucket**: `mirai`
- **Access**: Root credentials stored in Kubernetes secrets

### 2. Storage Structure
```
mirai/                          # Main bucket
└── data/                       # Application data root
    ├── library.json           # Folder hierarchy and metadata
    ├── courses/               # Course content files
    │   ├── course-*.json
    │   └── ...
    └── exports/               # Export directory
```

### 3. Application Integration

#### Storage Adapter Pattern
The application uses a storage adapter pattern to switch between local filesystem (development) and S3/MinIO (production):

```typescript
// storageAdapter.ts
export function getStorageAdapter(): IStorageAdapter {
  const useS3 = process.env.USE_S3_STORAGE === 'true';

  if (useS3) {
    return new S3StorageAdapter();  // MinIO/S3
  } else {
    return new LocalStorageAdapter(); // Local filesystem
  }
}
```

#### Environment Variables
```yaml
USE_S3_STORAGE: "true"
S3_ENDPOINT: "http://192.168.1.226:9768"
S3_BUCKET: "mirai"
S3_REGION: "us-east-1"
S3_ACCESS_KEY: <from-secret>
S3_SECRET_KEY: <from-secret>
```

## Kubernetes Configuration

### 1. Secret Management
```yaml
# k8s/minio-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: default
type: Opaque
stringData:
  accesskey: "root"
  secretkey: "<password>"
  endpoint: "http://192.168.1.226:9768"
```

### 2. Deployment Configuration
The Mirai deployment includes MinIO environment variables:
```yaml
env:
- name: S3_ENDPOINT
  value: "http://192.168.1.226:9768"
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

## Data Flow

### 1. Reading Data
1. Application requests data (e.g., `library.json`)
2. Storage adapter checks `USE_S3_STORAGE` environment variable
3. S3StorageAdapter connects to MinIO using credentials
4. Fetches data from `s3://mirai/data/library.json`
5. Returns parsed JSON to application

### 2. Writing Data
1. Application saves course or library data
2. S3StorageAdapter serializes data to JSON
3. Uploads to MinIO bucket with appropriate path
4. MinIO stores on Unraid NAS work drive

### 3. Folder Hierarchy
The folder structure visible in the UI is defined in `library.json`:
- Team folders (Human Resources, Sales, Product, Engineering)
- Personal folders (My Drafts, Completed Courses, Shared with Me)
- Each course references its folder location

## Operations

### Testing MinIO Connection
```bash
# From local machine
mc alias set unraid-minio http://192.168.1.226:9768 root '<password>'
mc ls unraid-minio/mirai

# From Kubernetes pod
kubectl run -it --rm minio-test --image=minio/mc:latest -- sh
mc alias set minio http://192.168.1.226:9768 root '<password>'
mc ls minio/mirai
```

### Viewing Application Logs
```bash
# Check if app is connecting to MinIO
kubectl logs -f deployment/mirai-frontend -n default
```

### Backup and Restore
```bash
# Backup MinIO data
mc mirror unraid-minio/mirai ./backup/

# Restore MinIO data
mc mirror ./backup/ unraid-minio/mirai
```

## Migration Path

### Current: MinIO on Unraid
- Local S3-compatible storage
- No external dependencies
- Full control over data

### Future: AWS S3
1. Create S3 bucket in AWS
2. Use `mc mirror` to migrate data
3. Update environment variables:
   ```yaml
   S3_ENDPOINT: "https://s3.amazonaws.com"
   S3_BUCKET: "mirai-prod"
   S3_ACCESS_KEY: <aws-access-key>
   S3_SECRET_KEY: <aws-secret-key>
   ```
4. Redeploy application

## Troubleshooting

### Connection Issues
1. Verify MinIO is accessible:
   ```bash
   curl -I http://192.168.1.226:9768
   ```

2. Check Kubernetes secret:
   ```bash
   kubectl get secret minio-secret -o yaml
   ```

3. Test from pod:
   ```bash
   kubectl exec -it <pod-name> -- curl http://192.168.1.226:9768
   ```

### Data Not Appearing
1. Check MinIO bucket contents:
   ```bash
   mc tree unraid-minio/mirai --files
   ```

2. Verify environment variables in pod:
   ```bash
   kubectl exec <pod-name> -- env | grep S3
   ```

3. Check application logs for S3 errors:
   ```bash
   kubectl logs <pod-name> | grep -i s3
   ```

## Security Considerations

1. **Credentials**: Stored in Kubernetes secrets, never in code
2. **Network**: MinIO traffic stays within local network
3. **Access Control**: MinIO supports IAM policies (not yet implemented)
4. **Encryption**: Consider enabling TLS for MinIO (future enhancement)

## Benefits

1. **Persistent Storage**: Data survives pod restarts and redeployments
2. **S3 Compatibility**: Easy migration to AWS S3 or other S3-compatible services
3. **Centralized Storage**: All nodes access same data source
4. **Scalability**: Can handle large amounts of data
5. **Backup-friendly**: Standard S3 tools work for backup/restore

## Future Enhancements

- [ ] Enable TLS/SSL for MinIO
- [ ] Implement versioning for course files
- [ ] Add IAM policies for fine-grained access control
- [ ] Set up automated backups to external S3
- [ ] Implement caching layer for frequently accessed data
- [ ] Add monitoring and alerts for storage usage

## Related Documentation

- [GitOps Workflow](./GITOPS_WORKFLOW.md) - CI/CD pipeline
- [Kubernetes Configurations](../k8s/) - Deployment manifests
- [Frontend Storage Adapters](../frontend/src/lib/storage/) - Storage implementation