# Mirai k3d Local Development Scripts

Complete set of development workflow scripts for running Mirai in a local k3d Kubernetes cluster.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Scripts Overview](#scripts-overview)
- [Detailed Usage](#detailed-usage)
- [Architecture](#architecture)
- [Troubleshooting](#troubleshooting)
- [FAQ](#faq)

## Prerequisites

### Required Software

Install the following tools before running the setup:

```bash
# Install via Homebrew (macOS)
brew install k3d kubectl helm mkcert

# Ensure Docker Desktop is installed and running
# Download from: https://www.docker.com/products/docker-desktop
```

### System Requirements

- **Docker Desktop**: Running with at least 4GB RAM allocated
- **macOS**: 10.15+ (Catalina or later)
- **Disk Space**: ~10GB for images and cluster data
- **Network**: Internet access for pulling base images and Helm charts

### Optional Tools

For enhanced log viewing experience:

```bash
brew install stern
```

## Quick Start

### 1. First-Time Setup

```bash
# Navigate to k3d local directory
cd /Users/john/homelab-cluster/apps/mirai/k8s-local

# Make all scripts executable (if not already)
chmod +x *.sh

# Run the complete setup (takes ~10-15 minutes)
./setup.sh
```

### 2. Add Hosts Entries

Add these entries to `/etc/hosts`:

```bash
sudo nano /etc/hosts

# Add these lines:
127.0.0.1 mirai.local
127.0.0.1 auth.mirai.local
127.0.0.1 api.mirai.local
127.0.0.1 minio.mirai.local
127.0.0.1 mailpit.mirai.local
```

### 3. Access the Application

Open your browser and visit:

- **Frontend**: https://mirai.local
- **Auth**: https://auth.mirai.local
- **API**: https://api.mirai.local
- **MinIO**: https://minio.mirai.local
- **Mailpit**: https://mailpit.mirai.local

## Scripts Overview

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `setup.sh` | Complete cluster setup | First-time setup only |
| `start.sh` | Start stopped cluster | After `stop.sh` or reboot |
| `stop.sh` | Stop cluster (preserves data) | End of work session |
| `reset.sh` | Delete cluster and all data | Start fresh / troubleshooting |
| `status.sh` | Show cluster status | Check health / debug |
| `logs.sh` | View service logs | Debug / monitor |
| `build-local.sh` | Build and import images | After code changes |

## Detailed Usage

### setup.sh - Initial Cluster Setup

Complete one-time setup of the local k3d cluster.

```bash
./setup.sh
```

**What it does:**

1. ✅ Validates all prerequisites are installed
2. ✅ Creates k3d cluster with Traefik disabled
3. ✅ Installs Traefik ingress controller via Helm
4. ✅ Generates TLS certificates with mkcert
5. ✅ Deploys infrastructure (PostgreSQL, Redis, MinIO)
6. ✅ Creates Kratos database
7. ✅ Deploys Mailpit for email testing
8. ✅ Installs Kratos authentication via Helm
9. ✅ Deploys ingress routes and middleware
10. ✅ Builds local Docker images
11. ✅ Imports images into k3d
12. ✅ Deploys Mirai applications

**Duration:** 10-15 minutes

**Output:** Running cluster with all services ready

---

### start.sh - Start Cluster

Starts a stopped cluster and verifies all services.

```bash
./start.sh
```

**What it does:**

- Starts the k3d cluster
- Waits for nodes to be ready
- Checks all pod statuses
- Displays access URLs

**Duration:** 1-2 minutes

**Use when:**
- After running `stop.sh`
- After system reboot
- Resuming development work

---

### stop.sh - Stop Cluster

Stops the cluster while preserving all data.

```bash
./stop.sh
```

**What it does:**

- Gracefully stops the k3d cluster
- Preserves all volumes and data
- Frees system resources

**Duration:** 10-30 seconds

**Use when:**
- End of work session
- Need to free system resources
- Not actively developing

**Note:** All data (databases, files, etc.) is preserved and will be available when you run `start.sh`.

---

### reset.sh - Complete Reset

Completely deletes the cluster and all data.

```bash
./reset.sh
```

**What it does:**

- Prompts for confirmation (twice!)
- Deletes the entire k3d cluster
- Removes all data and volumes
- Cleans up Docker resources

**⚠️ WARNING:** This action cannot be undone!

**Use when:**
- Need a completely fresh start
- Troubleshooting persistent issues
- Testing the setup process
- Cleaning up before final shutdown

---

### status.sh - Cluster Status

Shows comprehensive cluster status and health.

```bash
./status.sh
```

**What it displays:**

- Cluster and node information
- System pod status (kube-system)
- Infrastructure pod status
- Kratos authentication status
- Application pod status
- Service endpoints
- Ingress routes
- Access URLs
- Health summary with color coding

**Use when:**
- Checking if cluster is healthy
- Debugging deployment issues
- Verifying all services are running
- Getting access URLs

---

### logs.sh - View Service Logs

View logs from any service in the cluster.

```bash
./logs.sh [service] [options]
```

**Services:**

- `backend` - Backend application
- `frontend` - Frontend application
- `marketing` - Marketing site
- `kratos` - Authentication service
- `postgres` - Database
- `redis` - Cache
- `minio` - Object storage
- `mailpit` - Email testing
- `traefik` - Ingress controller
- `all` - All pods in mirai namespace

**Options:**

- `-f, --follow` - Follow log output (default)
- `--tail N` - Show last N lines (default: 100)
- `--previous` - Show logs from previous container (if crashed)

**Examples:**

```bash
# View backend logs
./logs.sh backend

# View last 50 lines of postgres logs
./logs.sh postgres --tail 50

# View previous logs if Kratos crashed
./logs.sh kratos --previous

# Tail all application logs
./logs.sh all
```

**Tip:** Install `stern` for better multi-pod log viewing:
```bash
brew install stern
```

---

### build-local.sh - Build and Import Images

Builds Docker images from source and imports them into the k3d cluster.

```bash
./build-local.sh [service] [options]
```

**Services:**

- `backend` - Backend application only
- `frontend` - Frontend application only
- `marketing` - Marketing site only
- `all` - All images (default)

**Options:**

- `--restart` - Restart deployments after import (default)
- `--no-restart` - Skip restarting deployments
- `--no-cache` - Build without using Docker cache

**Examples:**

```bash
# Build and deploy all images
./build-local.sh

# Build only backend (fast iteration)
./build-local.sh backend

# Build frontend without cache (clean build)
./build-local.sh frontend --no-cache

# Build all without auto-restart
./build-local.sh all --no-restart
```

**Duration:**
- Single service: 2-5 minutes
- All services: 10-15 minutes

**Use when:**
- After making code changes
- Need to test new features
- Debugging application issues

---

## Architecture

### Cluster Components

```
┌─────────────────────────────────────────────────────────────┐
│                     k3d Cluster (mirai-local)                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Ingress Layer (kube-system namespace)                │  │
│  │                                                        │  │
│  │  • Traefik (LoadBalancer on 80/443)                  │  │
│  │  • TLS Termination (mkcert certificates)             │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Application Layer (mirai namespace)                  │  │
│  │                                                        │  │
│  │  • Mirai Frontend (Next.js)                          │  │
│  │  • Mirai Marketing (Static site)                     │  │
│  │  • Mirai Backend (Go + Connect-RPC)                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Authentication Layer (mirai namespace)               │  │
│  │                                                        │  │
│  │  • Ory Kratos (Identity & auth)                      │  │
│  │  • Mailpit (Email testing)                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                            ↓                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Infrastructure Layer (mirai namespace)               │  │
│  │                                                        │  │
│  │  • PostgreSQL 16 (Primary database)                  │  │
│  │  • Redis 7 (Cache & queues)                          │  │
│  │  • MinIO (S3-compatible storage)                     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### Network Flow

```
Browser (https://mirai.local)
    ↓
k3d LoadBalancer (localhost:443)
    ↓
Traefik Ingress Controller
    ↓
IngressRoute (TLS termination)
    ↓
Service (ClusterIP)
    ↓
Pod (Application container)
```

### Data Persistence

All data is stored in Docker volumes:

- **PostgreSQL**: Database data persisted in volume
- **MinIO**: Object storage persisted in volume
- **Redis**: Optional persistence (AOF/RDB)

**Note:** Data persists across `stop.sh` and `start.sh` but is deleted by `reset.sh`.

---

## Troubleshooting

### Common Issues

#### 1. Cluster Won't Start

**Symptoms:**
- `./start.sh` fails
- Nodes show NotReady

**Solutions:**

```bash
# Check Docker is running
docker info

# Restart Docker Desktop if needed
# Then try again
./start.sh
```

#### 2. Pods Stuck in Pending/CrashLoopBackOff

**Symptoms:**
- `./status.sh` shows pods not running
- Services unavailable

**Solutions:**

```bash
# Check pod details
kubectl describe pod <pod-name> -n mirai

# View logs
./logs.sh <service>

# Check for previous crash logs
./logs.sh <service> --previous

# Try restarting the pod
kubectl delete pod <pod-name> -n mirai
```

#### 3. Can't Access https://mirai.local

**Symptoms:**
- Browser shows "Site can't be reached"
- Connection refused

**Solutions:**

```bash
# 1. Verify /etc/hosts entries
cat /etc/hosts | grep mirai.local

# 2. Check cluster is running
./status.sh

# 3. Check Traefik is running
kubectl get pods -n kube-system -l app.kubernetes.io/name=traefik

# 4. Check ingress routes
kubectl get ingressroute -n mirai

# 5. Test Traefik directly
kubectl port-forward -n kube-system svc/traefik 8080:80
# Visit http://localhost:8080
```

#### 4. TLS Certificate Errors

**Symptoms:**
- Browser shows SSL/TLS warnings
- Certificate not trusted

**Solutions:**

```bash
# Reinstall mkcert CA
mkcert -install

# Recreate certificates by running setup again
./reset.sh
./setup.sh
```

#### 5. Images Not Updating After Build

**Symptoms:**
- Code changes not reflected
- Old version still running

**Solutions:**

```bash
# Build with no cache
./build-local.sh <service> --no-cache

# Force restart deployment
kubectl rollout restart deployment/<service> -n mirai

# Verify image was imported
k3d image list | grep mirai
```

#### 6. Database Connection Errors

**Symptoms:**
- Backend can't connect to PostgreSQL
- Kratos migration failures

**Solutions:**

```bash
# Check PostgreSQL is running
kubectl get pods -n mirai -l app=postgres

# Check PostgreSQL logs
./logs.sh postgres

# Test database connection
kubectl exec -it deployment/postgres -n mirai -- psql -U postgres -c "SELECT version();"

# Recreate Kratos database
kubectl exec -it deployment/postgres -n mirai -- psql -U postgres
# Then: DROP DATABASE kratos; CREATE DATABASE kratos;
```

#### 7. Out of Disk Space

**Symptoms:**
- Image builds fail
- Pods evicted

**Solutions:**

```bash
# Clean up Docker resources
docker system prune -a --volumes

# Remove old k3d clusters
k3d cluster delete <old-cluster-name>

# Remove unused images
docker image prune -a
```

---

### Getting Help

If you encounter issues not covered here:

1. **Check logs**: `./logs.sh <service>`
2. **Check status**: `./status.sh`
3. **Check pod details**: `kubectl describe pod <pod-name> -n mirai`
4. **Check events**: `kubectl get events -n mirai --sort-by='.lastTimestamp'`
5. **Full reset**: `./reset.sh && ./setup.sh` (nuclear option)

---

## FAQ

### How do I update application code?

```bash
# Make your code changes
# Then rebuild and deploy
./build-local.sh <service>
```

### How do I access the database directly?

```bash
# PostgreSQL
kubectl exec -it deployment/postgres -n mirai -- psql -U postgres

# Inside psql:
# \l              - List databases
# \c <database>   - Connect to database
# \dt             - List tables
```

### How do I access MinIO console?

```bash
# Option 1: Via ingress (if configured)
https://minio.mirai.local

# Option 2: Port-forward
kubectl port-forward -n mirai svc/minio 9001:9001
# Then open http://localhost:9001
```

### How do I view Traefik dashboard?

```bash
kubectl port-forward -n kube-system svc/traefik 9000:9000
# Then open http://localhost:9000/dashboard/
```

### How do I access Mailpit (email testing)?

```bash
https://mailpit.mirai.local

# All emails sent by the application will appear here
```

### Can I run multiple clusters?

Yes, but change the cluster name in `cluster-config.yaml` to avoid conflicts.

### How much disk space does the cluster use?

Approximately:
- Base images: ~3GB
- Application images: ~2GB
- Data volumes: ~1-5GB (varies with usage)
- **Total**: ~6-10GB

### What happens to data when I stop the cluster?

All data is preserved in Docker volumes:
- Database content
- Uploaded files (MinIO)
- User sessions

It will all be there when you run `./start.sh`.

### What happens to data when I reset the cluster?

**Everything is deleted permanently.** You'll get a completely fresh installation.

### How do I update Kubernetes manifests?

```bash
# Edit the manifests in k8s-local/
# Then apply the changes
kubectl apply -k k8s-local/<directory>

# Example:
kubectl apply -k k8s-local/apps
```

### How do I add a new service?

1. Create Kubernetes manifests in appropriate directory
2. Add to kustomization.yaml
3. Apply: `kubectl apply -k <directory>`

### Can I use this for production?

**No.** This is for local development only. Key differences from production:

- Self-signed certificates (mkcert)
- No resource limits
- Debug logging enabled
- Insecure default passwords
- Single node (no HA)
- Local storage (no redundancy)

---

## Development Workflow Example

### Typical Day

```bash
# Morning: Start cluster
./start.sh

# Check everything is running
./status.sh

# Make code changes to backend
# ... edit files ...

# Rebuild and test
./build-local.sh backend

# View logs to debug
./logs.sh backend

# Make more changes
# ... edit files ...

# Rebuild again
./build-local.sh backend

# End of day: Stop cluster
./stop.sh
```

### Feature Development

```bash
# Start fresh
./start.sh

# Create a new feature branch
# ... git checkout -b feature/new-feature ...

# Make changes to frontend
# ... edit files ...

# Build and test
./build-local.sh frontend

# View logs
./logs.sh frontend

# Check emails in Mailpit
open https://mailpit.mirai.local

# Test authentication flow
open https://mirai.local

# If something breaks, check status
./status.sh

# View all logs
./logs.sh all

# Done for now
./stop.sh
```

### Debugging Issues

```bash
# Something is broken, start investigating
./status.sh

# Check specific service
./logs.sh backend

# Check previous crash
./logs.sh backend --previous

# Inspect pod
kubectl describe pod <pod-name> -n mirai

# Check database
kubectl exec -it deployment/postgres -n mirai -- psql -U postgres

# Nuclear option: full reset
./reset.sh
./setup.sh
```

---

## Best Practices

### Resource Management

1. **Stop cluster when not in use** to free system resources
2. **Don't run other heavy Docker containers** while cluster is running
3. **Allocate sufficient RAM to Docker Desktop** (4GB minimum, 8GB recommended)

### Development Iteration

1. **Build single services** for faster iteration: `./build-local.sh backend`
2. **Use logs actively**: `./logs.sh <service>` to debug issues
3. **Check status regularly**: `./status.sh` to catch problems early

### Data Management

1. **Stop (don't reset)** when you want to preserve data
2. **Reset only when needed** (troubleshooting, fresh start)
3. **Backup important data** before resetting (if any)

### Troubleshooting

1. **Always check logs first**: `./logs.sh <service>`
2. **Check status second**: `./status.sh`
3. **Describe pods third**: `kubectl describe pod <pod>`
4. **Reset as last resort**: `./reset.sh`

---

## Script Dependencies

```
setup.sh
  ↓
  Requires: k3d, kubectl, helm, mkcert, docker
  Creates: Complete cluster

start.sh
  ↓
  Requires: Existing cluster (from setup.sh)
  Starts: Stopped cluster

stop.sh
  ↓
  Requires: Running cluster
  Stops: Cluster (preserves data)

reset.sh
  ↓
  Requires: Existing cluster
  Deletes: Everything

status.sh
  ↓
  Requires: Running cluster
  Shows: Status information

logs.sh
  ↓
  Requires: Running cluster
  Shows: Service logs

build-local.sh
  ↓
  Requires: Running cluster, source code
  Builds: Docker images, imports to k3d
```

---

## Additional Resources

- **k3d Documentation**: https://k3d.io/
- **kubectl Cheat Sheet**: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
- **Traefik Documentation**: https://doc.traefik.io/traefik/
- **Ory Kratos Documentation**: https://www.ory.sh/docs/kratos/
- **Mirai Project Documentation**: See `/Users/john/homelab-cluster/apps/mirai/README.md`

---

## License

Part of the Mirai project. See main project README for license information.
