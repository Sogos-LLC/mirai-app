# NFS Storage

NFS provides shared file storage for Kubernetes PersistentVolumeClaims backed by Unraid NAS.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   Unraid NAS (192.168.1.226)                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ NFS Share: k8s-nfs                                     │ │
│  │ Path: /mnt/user/k8s-nfs                                │ │
│  │ Export: 192.168.1.0/24 or Public                       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────┘
                           │ NFS v4 (port 2049)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                 Kubernetes Cluster                           │
│                                                              │
│  ┌────────────────────┐    ┌─────────────────────────────┐ │
│  │ NFS Provisioner    │───▶│ StorageClass: nfs-client    │ │
│  │ nfs-provisioner ns │    │ Dynamic PV creation         │ │
│  └────────────────────┘    └─────────────────────────────┘ │
│                                        │                     │
│                                        ▼                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ PersistentVolumeClaims                               │   │
│  │ - mirai-data-pvc (10Gi, default ns)                  │   │
│  │ - redis-data-pvc (5Gi, redis ns)                     │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## NFS Provisioner

**Namespace**: `nfs-provisioner`
**Provisioner**: `k8s-sigs.io/nfs-subdir-external-provisioner`

### Configuration

| Setting | Value |
|---------|-------|
| NFS Server | 192.168.1.226 |
| NFS Path | /mnt/user/k8s-nfs |
| StorageClass | nfs-client |

### Deployment

**File**: `k8s/nfs-provisioner-deployment.yaml`

```yaml
spec:
  containers:
  - name: nfs-client-provisioner
    image: k8s.gcr.io/sig-storage/nfs-subdir-external-provisioner:v4.0.2
    env:
    - name: NFS_SERVER
      value: "192.168.1.226"
    - name: NFS_PATH
      value: "/mnt/user/k8s-nfs"
    - name: PROVISIONER_NAME
      value: "k8s-sigs.io/nfs-subdir-external-provisioner"
```

## StorageClass

**Name**: `nfs-client`

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: nfs-client
provisioner: k8s-sigs.io/nfs-subdir-external-provisioner
parameters:
  archiveOnDelete: "true"   # Rename instead of delete
  onDelete: "retain"
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: Immediate
```

## PersistentVolumeClaims

### Application Data PVC

**File**: `k8s/mirai-data-pvc.yaml`

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

### Redis Data PVC

**File**: `k8s/redis/redis-deployment.yaml` (inline)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: redis-data-pvc
  namespace: redis
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: nfs-client
  resources:
    requests:
      storage: 5Gi
```

## Usage in Deployments

### Mounting NFS PVC

```yaml
spec:
  template:
    spec:
      containers:
      - name: app
        volumeMounts:
        - name: data
          mountPath: /data
          subPath: app-name  # Optional: isolate per-app
      volumes:
      - name: data
        persistentVolumeClaim:
          claimName: mirai-data-pvc
```

### Access Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| ReadWriteMany (RWX) | Multiple pods read/write | Shared data |
| ReadWriteOnce (RWO) | Single pod read/write | Database storage |
| ReadOnlyMany (ROX) | Multiple pods read-only | Shared configs |

## Unraid NAS Setup

### NFS Service

1. Enable NFS in Settings > NFS Settings
2. Create share `k8s-nfs` under /mnt/user/
3. Configure export settings:
   - Export: Yes
   - Security: Public or 192.168.1.0/24

### Required Ports

| Port | Protocol | Service |
|------|----------|---------|
| 111 | TCP/UDP | RPC Portmapper |
| 2049 | TCP/UDP | NFS |

## Verification Commands

```bash
# Check provisioner
kubectl get pods -n nfs-provisioner

# List storage classes
kubectl get sc

# List all PVCs
kubectl get pvc -A

# Check PVC status
kubectl describe pvc mirai-data-pvc

# Test NFS connectivity
showmount -e 192.168.1.226

# Test mount
kubectl run nfs-test --rm -it --image=busybox -- sh -c "mount -t nfs 192.168.1.226:/mnt/user/k8s-nfs /mnt && ls /mnt"
```

## Storage Class vs MinIO

| Aspect | NFS (StorageClass) | MinIO (S3) |
|--------|-------------------|------------|
| Use Case | File storage, databases | Object storage |
| Access | POSIX filesystem | S3 API |
| Multi-pod | Yes (RWX) | Yes (via API) |
| Cloud Portable | No | Yes (S3 compatible) |
| Used By | Redis, local caches | Course data, exports |

## Relationship to Database Storage

Databases use **local-path** StorageClass (NVMe), not NFS:

| Database | StorageClass | Why |
|----------|--------------|-----|
| mirai-db (CNPG) | local-path | Low latency I/O |
| kratos-db (CNPG) | local-path | Low latency I/O |

NFS is too slow for database workloads.

## Creating New PVCs

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: my-app-storage
  namespace: my-namespace
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs-client
  resources:
    requests:
      storage: 5Gi
```

## Troubleshooting

### PVC Stuck in Pending

```bash
# Check provisioner logs
kubectl logs -n nfs-provisioner -l app=nfs-client-provisioner

# Check events
kubectl describe pvc <pvc-name>
```

### Mount Failures

```bash
# Test NFS connectivity
nc -zv 192.168.1.226 2049

# Check exports
showmount -e 192.168.1.226
```

### Permission Issues

- Verify Unraid share permissions
- Check Security setting includes cluster subnet
- Confirm no_root_squash if needed for specific workloads

## Key Files

| File | Purpose |
|------|---------|
| `k8s/mirai-data-pvc.yaml` | Application data PVC |
| `k8s/redis/redis-deployment.yaml` | Redis PVC (inline) |
| `k8s/nfs-provisioner-deployment.yaml` | NFS provisioner (external repo) |
