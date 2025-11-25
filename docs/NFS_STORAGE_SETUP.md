# NFS Storage Setup with Kubernetes and Unraid

This guide documents the complete setup of NFS-based persistent storage using Unraid NAS with Kubernetes (Talos).

## Overview

We have successfully configured:
- ✅ **MinIO Object Storage** - Working at `http://192.168.1.226:9768` for S3-compatible storage
- ✅ **NFS Storage** - Dynamic provisioning via NFS Subdir External Provisioner
- ✅ **Persistent Volume Claims** - Automatic creation and binding for applications

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Unraid NAS                        │
│                 192.168.1.226                       │
│                                                     │
│  ┌──────────────┐        ┌──────────────────────┐ │
│  │ MinIO Server │        │  NFS Share: k8s-nfs  │ │
│  │  Port: 9768  │        │  /mnt/user/k8s-nfs   │ │
│  │ Bucket:mirai │        │  Export: *           │ │
│  └──────────────┘        └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
           ▲                          ▲
           │ S3 API                   │ NFS v4
           │                          │
┌──────────┴──────────────────────────┴───────────────┐
│              Kubernetes Cluster (Talos)             │
│                                                     │
│  ┌─────────────────┐    ┌──────────────────────┐  │
│  │ MinIO Secret    │    │ NFS Provisioner Pod  │  │
│  │ (credentials)   │    │ (Dynamic PV creation)│  │
│  └─────────────────┘    └──────────────────────┘  │
│           │                         │              │
│  ┌────────▼────────────────────────▼────────────┐ │
│  │          Application Pods (mirai-frontend)    │ │
│  │  - Uses MinIO for object storage (JSON data)  │ │
│  │  - Uses NFS PVC for file storage (10Gi)       │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## Prerequisites Completed

### 1. Unraid NAS Configuration
- **NFS Service**: Enabled in Settings → NFS Settings
- **NFS Share**: Created `k8s-nfs` share
- **Export Settings**:
  - Export: Yes
  - Security: Public (or subnet 192.168.1.0/24)
  - Path: `/mnt/user/k8s-nfs`

### 2. Network Connectivity
- NAS accessible at `192.168.1.226`
- NFS ports open: 111 (RPC), 2049 (NFS)
- MinIO ports open: 9768 (API), 9769 (Console)

## Kubernetes Components Deployed

### 1. MinIO Configuration

**Secret Created**: `k8s/minio-secret.yaml`
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: minio-secret
  namespace: default
type: Opaque
stringData:
  accesskey: "root"
  secretkey: "$SECRET"  # Actual password stored securely
  endpoint: "http://192.168.1.226:9768"
  region: "us-east-1"
```

### 2. NFS Subdir External Provisioner

**Deployment**: `k8s/nfs-provisioner-deployment.yaml`
- Namespace: `nfs-provisioner`
- Provisioner: `k8s-sigs.io/nfs-subdir-external-provisioner`
- NFS Server: `192.168.1.226`
- NFS Path: `/mnt/user/k8s-nfs`
- StorageClass: `nfs-client`

**Status**:
```bash
# Provisioner pod is running
kubectl get pods -n nfs-provisioner
NAME                                    READY   STATUS    RESTARTS   AGE
nfs-client-provisioner-654fc5f7-8qvhg   1/1     Running   0          2h
```

### 3. Storage Class

**Name**: `nfs-client`
```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-client
provisioner: k8s-sigs.io/nfs-subdir-external-provisioner
parameters:
  archiveOnDelete: "true"
  onDelete: "retain"
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: Immediate
```

### 4. Persistent Volume Claims

**Application PVC**: `k8s/mirai-data-pvc.yaml`
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: mirai-data-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs-client
  resources:
    requests:
      storage: 10Gi
```

**Status**: ✅ Bound successfully
```bash
kubectl get pvc mirai-data-pvc
NAME             STATUS   VOLUME                                     CAPACITY   ACCESS MODES
mirai-data-pvc   Bound    pvc-d0b13f71-c0e3-4a1c-9980-49072f5e1aa1   10Gi       RWX
```

## Application Integration

### Frontend Deployment with Dual Storage

The application uses both MinIO (object storage) and NFS (file storage):

**File**: `k8s/frontend/deployment-with-pvc.yaml`

Key features:
- **MinIO**: Primary storage for JSON data via S3 API
- **NFS PVC**: Mounted at `/nfs-data` for file storage/backups
- **Cache**: EmptyDir volume for temporary caching

Environment variables:
```yaml
env:
- name: USE_S3_STORAGE
  value: "true"
- name: S3_ENDPOINT
  value: "http://192.168.1.226:9768"
- name: NFS_DATA_PATH
  value: "/nfs-data"
- name: ENABLE_NFS_BACKUP
  value: "true"
```

Volume mounts:
```yaml
volumeMounts:
- name: nfs-data
  mountPath: /nfs-data
  subPath: mirai-frontend
- name: cache
  mountPath: /app/.cache
```

## Usage Examples

### Creating a New PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-storage
  namespace: default
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs-client
  resources:
    requests:
      storage: 5Gi
```

### Mounting in a Deployment

```yaml
spec:
  template:
    spec:
      containers:
      - name: my-app
        volumeMounts:
        - name: data
          mountPath: /data
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: my-app-storage
```

## Testing Storage

### Test MinIO Access
```bash
kubectl run minio-test --image=minio/mc:latest --rm -i --restart=Never -- \
  sh -c 'mc alias set test http://192.168.1.226:9768 root "$PASSWORD" && \
         mc ls test/mirai/'
```

### Test NFS PVC Creation
```bash
# Create test PVC
kubectl apply -f - <<EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes: [ReadWriteMany]
  storageClassName: nfs-client
  resources:
    requests:
      storage: 1Gi
EOF

# Check status
kubectl get pvc test-pvc
```

## Monitoring and Maintenance

### Check Storage Usage

**MinIO**:
```bash
# From MinIO console
http://192.168.1.226:9769
# Login with root credentials
```

**NFS**:
```bash
# Check provisioner logs
kubectl logs -n nfs-provisioner -l app=nfs-client-provisioner

# List all PVCs
kubectl get pvc -A

# Check NFS share on Unraid
# Navigate to Shares → k8s-nfs in Unraid web UI
```

### Backup Considerations

1. **MinIO Data**: Located at Unraid work_data share
2. **NFS Data**: Located at `/mnt/user/k8s-nfs/`
3. Both can be backed up using Unraid's built-in backup tools

## Troubleshooting

### Issue: PVC Stuck in Pending
```bash
# Check provisioner pod
kubectl get pods -n nfs-provisioner

# Check logs
kubectl logs -n nfs-provisioner <provisioner-pod>

# Verify NFS is accessible
showmount -e 192.168.1.226
```

### Issue: Mount Failures
```bash
# Check NFS service on Unraid
nc -zv 192.168.1.226 2049

# Verify exports
showmount -e 192.168.1.226
```

### Issue: Permission Denied
- Ensure Unraid NFS share has proper permissions
- Check Security setting is "Public" or includes cluster subnet
- Verify no root squashing if needed

## Best Practices

1. **Use MinIO for**:
   - Application data (JSON, configurations)
   - S3-compatible operations
   - Cloud-portable storage

2. **Use NFS PVCs for**:
   - Large file storage
   - Shared data between pods
   - Backup/archive storage
   - Database storage

3. **Storage Classes**:
   - Keep `nfs-client` for general use
   - Consider creating specialized classes for different retention policies

4. **Resource Limits**:
   - Set appropriate storage requests
   - Monitor usage regularly
   - Enable volume expansion when needed

## Summary

The storage infrastructure now provides:
- ✅ **Object Storage**: MinIO for S3-compatible storage
- ✅ **Block Storage**: NFS-backed PVCs for traditional file storage
- ✅ **Dynamic Provisioning**: Automatic PV creation via StorageClass
- ✅ **High Availability**: Data persisted on Unraid NAS
- ✅ **Scalability**: Easy to expand storage as needed

Both storage solutions are operational and can be used based on application requirements. The MinIO setup is ideal for cloud-native applications, while NFS provides traditional persistent volumes for stateful workloads.