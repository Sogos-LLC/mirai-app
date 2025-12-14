# Mirai Local Development Environment

Local Kubernetes development environment using k3d (k3s in Docker).

## Prerequisites

Install required tools:

```bash
brew install k3d kubectl helm mkcert jq
```

Ensure Docker Desktop is running.

## Quick Start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your Stripe keys (see below)

# 2. One-time setup (creates cluster, deploys everything)
./setup.sh

# 3. Access the app
open https://mirai.dev
```

## URLs

| Service | URL |
|---------|-----|
| App | https://mirai.dev |
| Marketing | https://get-mirai.dev |
| API | https://api.mirai.dev |
| Auth | https://auth.mirai.dev |
| Traefik Dashboard | https://traefik.mirai.dev/dashboard/ |
| Mailpit (email testing) | http://localhost:8025 |

## Scripts

| Script | Purpose |
|--------|---------|
| `./setup.sh` | One-time cluster creation and full deployment |
| `./start.sh` | Start a stopped cluster |
| `./stop.sh` | Stop the cluster (preserves data) |
| `./reset.sh` | Delete cluster completely |
| `./build-local.sh` | Build and deploy code changes |
| `./status.sh` | Show cluster and pod status |
| `./logs.sh` | View pod logs |
| `./stripe-webhook.sh` | Update Stripe webhook secret |

## Daily Workflow

### Starting Development

```bash
# Start the cluster (if stopped)
./start.sh

# Or start with k9s monitoring
./start.sh --k9s
```

### Making Code Changes

After modifying code, rebuild and deploy:

```bash
# Build all services
./build-local.sh

# Build specific service
./build-local.sh frontend
./build-local.sh backend
./build-local.sh marketing

# Build without Docker cache
./build-local.sh frontend --no-cache
```

### Viewing Logs

```bash
# Interactive log viewer
./logs.sh

# Or use kubectl directly
kubectl logs -f deployment/frontend -n mirai-local
kubectl logs -f deployment/gateway -n mirai-local
```

### Checking Status

```bash
./status.sh
```

### Stopping Development

```bash
# Stop cluster (preserves data)
./stop.sh

# Or delete everything
./reset.sh
```

## Stripe Configuration

### Getting Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) (Test mode)
2. Navigate to **Developers > API Keys**
3. Copy the **Secret key** (starts with `sk_test_`)
4. Navigate to **Products** and get your price IDs

### Setting Up Webhooks

For payment flows to work locally:

```bash
# Terminal 1: Start Stripe CLI listener
stripe listen --forward-to https://api.mirai.dev/api/v1/billing/webhook

# Terminal 2: Update the webhook secret (copy from stripe listen output)
./stripe-webhook.sh whsec_xxxxx
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        k3d Cluster                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    Traefik Ingress                     │ │
│  │   *.mirai.dev  →  TLS termination  →  routing          │ │
│  └────────────────────────────────────────────────────────┘ │
│           │              │              │                   │
│           ▼              ▼              ▼                   │
│    ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│    │ frontend │   │ gateway  │   │marketing │              │
│    │ (Next.js)│   │  (Go)    │   │(Next.js) │              │
│    └────┬─────┘   └────┬─────┘   └──────────┘              │
│         │              │                                    │
│         ▼              ▼                                    │
│    ┌──────────────────────────────────────┐                │
│    │              Kratos                   │                │
│    │         (Authentication)              │                │
│    └──────────────────────────────────────┘                │
│         │              │                                    │
│         ▼              ▼                                    │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐              │
│  │ PostgreSQL│  │   Redis   │  │   MinIO   │              │
│  │  (CNPG)   │  │  (cache)  │  │   (S3)    │              │
│  └───────────┘  └───────────┘  └───────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
k8s-local/
├── apps/                    # Application deployments
│   ├── kustomization.yaml   # Kustomize config
│   ├── backend-patch.yaml   # Backend overrides
│   ├── frontend-patch.yaml  # Frontend overrides
│   └── marketing-patch.yaml # Marketing overrides
├── infrastructure/          # Supporting services
│   ├── minio/              # S3-compatible storage
│   └── redis/              # Cache and queues
├── ingress/                 # Traefik routing
│   ├── ingressroutes.yaml  # Route definitions
│   └── middleware.yaml     # Auth, CORS, etc.
├── kratos/                  # Ory Kratos config
│   └── values-local.yaml   # Helm values
├── certs/                   # TLS certificates (generated)
├── .env                     # Your local secrets (not in git)
└── *.sh                     # Utility scripts
```

## Troubleshooting

### Cluster won't start

```bash
# Check Docker is running
docker ps

# Check cluster status
k3d cluster list

# Recreate if needed
./reset.sh
./setup.sh
```

### Pods not running

```bash
# Check pod status
kubectl get pods -n mirai-local

# Check events for errors
kubectl describe pod <pod-name> -n mirai-local

# Check logs
kubectl logs <pod-name> -n mirai-local
```

### TLS certificate errors in browser

```bash
# Regenerate certificates
mkcert -install
kubectl delete secret mirai-tls -n mirai-local
./start.sh  # Will recreate the secret

# Clear browser cache and restart browser
```

### Pages loading slowly (10+ seconds)

Check frontend can reach Kratos:

```bash
kubectl exec deployment/frontend -n mirai-local -- \
  wget -qO- --timeout=2 http://kratos-public.mirai-local.svc.cluster.local:4433/health/alive
```

If timeout, check `KRATOS_PUBLIC_URL` in frontend-patch.yaml uses port 4433.

### Database connection issues

```bash
# Check PostgreSQL is running
kubectl get pods -n mirai-local -l cnpg.io/cluster=mirai-db

# Check connection from gateway
kubectl exec deployment/gateway -n mirai-local -- \
  env | grep DATABASE_URL
```

### Reset everything

```bash
./reset.sh
./setup.sh
```

## Services

| Pod | Purpose | Port |
|-----|---------|------|
| frontend | Next.js web app | 3000 |
| gateway | Go backend API | 8080 |
| marketing | Marketing site | 3000 |
| kratos | Authentication | 4433 (public), 4434 (admin) |
| mirai-db | PostgreSQL | 5432 |
| redis | Cache/queues | 6379 |
| minio | S3 storage | 9000 (API), 9001 (console) |
