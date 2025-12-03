# CloudNativePG Database Clusters

High-Availability PostgreSQL clusters with **Zero Data Loss (RPO=0)** using synchronous replication.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        10Gbps / MTU 9000 Fabric                             │
├─────────────────────────┬─────────────────────────┬─────────────────────────┤
│      mac-mini-1         │      mac-mini-2         │      mac-mini-3         │
│     192.168.1.223       │     192.168.1.162       │     192.168.1.215       │
├─────────────────────────┼─────────────────────────┼─────────────────────────┤
│  ┌─────────────────┐    │  ┌─────────────────┐    │  ┌─────────────────┐    │
│  │  mirai-db-1     │◄──►│  │  mirai-db-2     │◄──►│  │  mirai-db-3     │    │
│  │  (PRIMARY)      │sync│  │  (STANDBY)      │sync│  │  (STANDBY)      │    │
│  │  NVMe Storage   │    │  │  NVMe Storage   │    │  │  NVMe Storage   │    │
│  └─────────────────┘    │  └─────────────────┘    │  └─────────────────┘    │
│  ┌─────────────────┐    │  ┌─────────────────┐    │  ┌─────────────────┐    │
│  │  kratos-db-1    │◄──►│  │  kratos-db-2    │◄──►│  │  kratos-db-3    │    │
│  │  NVMe Storage   │sync│  │  NVMe Storage   │sync│  │  NVMe Storage   │    │
│  └─────────────────┘    │  └─────────────────┘    │  └─────────────────┘    │
└─────────────────────────┴─────────────────────────┴─────────────────────────┘
                                      │
                                      ▼ WAL Archive + Backups
                          ┌───────────────────────┐
                          │   NAS (MinIO S3)      │
                          │   192.168.1.226:9768  │
                          │   s3://cnpg-backups/  │
                          └───────────────────────┘
```

## Key Features

- **Synchronous Replication**: `synchronous_commit: "on"` with `ANY 1 (*)` standby
- **Local NVMe Storage**: Maximum IOPS via `local-path` storage class
- **Automatic Failover**: CloudNativePG handles primary election
- **Continuous Backups**: WAL archiving to NAS with daily full backups
- **Zero Data Loss**: RPO=0 guaranteed by synchronous replication

## Prerequisites

1. **Local Path Provisioner** installed in the cluster
2. **CloudNativePG Operator** (v1.24+) installed
3. **MinIO bucket** `cnpg-backups` created on NAS

## Installation Order

### Step 1: Install Local Path Provisioner (homelab-platform)

```bash
cd /path/to/homelab-platform
kubectl apply -k storage/
```

Verify:
```bash
kubectl get storageclass local-path
kubectl get pods -n local-path-storage
```

### Step 2: Install CloudNativePG Operator (homelab-platform)

```bash
cd /path/to/homelab-platform
kubectl apply -k operators/cloudnative-pg/
```

Verify:
```bash
kubectl get pods -n cnpg-system
kubectl get crds | grep cnpg
```

### Step 3: Create Secrets

Copy templates and set passwords:

```bash
cd k8s/cnpg/

# Mirai DB credentials
cp mirai-db-credentials.yaml.template mirai-db-credentials.yaml
# Edit and replace $PASSWORD

# Kratos DB credentials
cp kratos-db-credentials.yaml.template kratos-db-credentials.yaml
# Edit and replace $PASSWORD

# Backup credentials (mirai namespace)
cp backup-credentials.yaml.template backup-credentials.yaml
# Edit and replace $MINIO_ACCESS_KEY and $MINIO_SECRET_KEY

# Backup credentials (kratos namespace)
cp kratos-backup-credentials.yaml.template kratos-backup-credentials.yaml
# Edit and replace $MINIO_ACCESS_KEY and $MINIO_SECRET_KEY
```

Apply secrets:
```bash
kubectl apply -f mirai-db-credentials.yaml
kubectl apply -f backup-credentials.yaml
kubectl apply -f kratos-db-credentials.yaml
kubectl apply -f kratos-backup-credentials.yaml
```

### Step 4: Create MinIO Bucket for Backups

```bash
mc alias set nas http://192.168.1.226:9768 $ACCESS_KEY $SECRET_KEY
mc mb nas/cnpg-backups
```

### Step 5: Deploy CNPG Clusters

```bash
kubectl apply -k k8s/cnpg/
```

Verify:
```bash
# Check cluster status
kubectl get clusters -A

# Check pods
kubectl get pods -n mirai -l cnpg.io/cluster=mirai-db
kubectl get pods -n kratos -l cnpg.io/cluster=kratos-db

# Check replication status
kubectl cnpg status mirai-db -n mirai
kubectl cnpg status kratos-db -n kratos
```

## Migration from NFS PostgreSQL

### Option A: Fresh Start (Recommended for Dev/Staging)

1. Stop applications consuming the databases
2. Deploy CNPG clusters
3. Run migrations against new databases
4. Update connection strings
5. Restart applications

### Option B: Data Migration (Production)

1. **Backup existing data:**
```bash
kubectl exec -n mirai mirai-db-0 -- pg_dumpall -U mirai > mirai-backup.sql
kubectl exec -n postgres postgres-0 -- pg_dumpall -U kratos > kratos-backup.sql
```

2. **Deploy CNPG clusters** (they'll be empty)

3. **Restore data:**
```bash
# Get the primary pod name
PRIMARY=$(kubectl get pods -n mirai -l cnpg.io/cluster=mirai-db,cnpg.io/instanceRole=primary -o name)
kubectl exec -i $PRIMARY -n mirai -- psql -U mirai < mirai-backup.sql

PRIMARY=$(kubectl get pods -n kratos -l cnpg.io/cluster=kratos-db,cnpg.io/instanceRole=primary -o name)
kubectl exec -i $PRIMARY -n kratos -- psql -U kratos < kratos-backup.sql
```

4. **Update connection strings** in application configs

5. **Decommission old NFS-based PostgreSQL**

## Connection Strings

CNPG creates services automatically:

| Service | DNS Name | Port |
|---------|----------|------|
| Mirai DB (RW) | `mirai-db-rw.mirai.svc.cluster.local` | 5432 |
| Mirai DB (RO) | `mirai-db-ro.mirai.svc.cluster.local` | 5432 |
| Mirai DB (R) | `mirai-db-r.mirai.svc.cluster.local` | 5432 |
| Kratos DB (RW) | `kratos-db-rw.kratos.svc.cluster.local` | 5432 |

**Connection string format:**
```
postgresql://mirai:$PASSWORD@mirai-db-rw.mirai.svc.cluster.local:5432/mirai?sslmode=require
```

## Monitoring

CNPG exposes Prometheus metrics. PodMonitors are enabled by default.

```bash
# View metrics
kubectl port-forward -n mirai svc/mirai-db-rw 9187:9187
curl localhost:9187/metrics
```

## Backup & Recovery

### Manual Backup
```bash
kubectl cnpg backup mirai-db -n mirai
```

### List Backups
```bash
kubectl get backups -n mirai
kubectl get backups -n kratos
```

### Point-in-Time Recovery
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: mirai-db-recovery
spec:
  instances: 1
  bootstrap:
    recovery:
      source: mirai-db
      recoveryTarget:
        targetTime: "2024-01-15 10:00:00.000000+00"
  externalClusters:
    - name: mirai-db
      barmanObjectStore:
        destinationPath: s3://cnpg-backups/mirai
        endpointURL: http://192.168.1.226:9768
        s3Credentials:
          accessKeyId:
            name: cnpg-backup-credentials
            key: ACCESS_KEY_ID
          secretAccessKey:
            name: cnpg-backup-credentials
            key: ACCESS_SECRET_KEY
```

## Troubleshooting

### Check Cluster Status
```bash
kubectl cnpg status mirai-db -n mirai
```

### View Logs
```bash
kubectl logs -n mirai -l cnpg.io/cluster=mirai-db --tail=100
```

### Check Replication Lag
```bash
kubectl exec -it mirai-db-1 -n mirai -- psql -c "SELECT * FROM pg_stat_replication;"
```

### Force Switchover
```bash
kubectl cnpg promote mirai-db mirai-db-2 -n mirai
```
