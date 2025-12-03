# Mirai

Enterprise SaaS platform for AI-powered course creation, deployed on bare-metal Kubernetes with zero data loss guarantees.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                           Cloudflare Tunnel                                           │
├─────────────────────────┬─────────────────────────┬─────────────────────────┬─────────────────────────┤
│   get-mirai.sogos.io    │     mirai.sogos.io      │   mirai-api.sogos.io    │   mirai-auth.sogos.io   │
│     Marketing Site      │      App (Auth'd)       │    Connect-RPC API      │       Kratos API        │
└────────────┬────────────┴────────────┬────────────┴────────────┬────────────┴────────────┬────────────┘
             │                         │                         │                         │
             ▼                         ▼                         ▼                         ▼
      mirai-marketing           mirai-frontend             mirai-backend                 kratos
         (Next.js)                 (Next.js)                   (Go)                   (Ory Kratos)
             │                         │                         │                         │
             │                         │                    ┌────┴────┐                    │
             │                         │                    │  Asynq  │                    │
             │                         │                    │ Workers │                    │
             │                         │                    └────┬────┘                    │
             └─────────────────────────┴──────────────┬─────────┴─────────────────────────┘
                                                      ▼
                                               PostgreSQL (CNPG)
                                            3-node sync replication
                                                 RPO=0 (Zero Data Loss)
```

## Infrastructure

| Component | Specification |
|-----------|--------------|
| Compute | 3x Mac Mini (Talos Linux) |
| Network | 10Gbps Thunderbolt mesh (MTU 9000) |
| Storage Tier 1 | Local NVMe (database I/O) |
| Storage Tier 2 | 6TB NAS (MinIO + backups) |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router), Connect-Query, XState v5, Zustand, Tailwind |
| Backend | Go 1.24, Connect-RPC, Asynq workers |
| Database | PostgreSQL 16 (CloudNativePG, sync commit) |
| Auth | Ory Kratos (headless identity) |
| Cache | Redis 7 (caching + job queue) |
| Storage | MinIO (S3-compatible) |
| AI | Google Gemini (per-tenant API keys) |

## Project Structure

```
mirai/
├── proto/                      # Protobuf definitions (source of truth)
│   └── mirai/v1/*.proto
├── frontend/
│   ├── src/
│   │   ├── app/(main)/        # Protected routes
│   │   ├── app/(public)/      # Auth flows, landing
│   │   ├── gen/               # Generated Connect-Query hooks
│   │   ├── machines/          # XState flow machines
│   │   ├── hooks/             # Connect-RPC hooks
│   │   └── store/zustand/     # UI state only
│   ├── Dockerfile
│   └── Dockerfile.marketing
├── backend/
│   ├── cmd/server/            # HTTP + worker entry
│   ├── internal/
│   │   ├── application/service/  # Business logic
│   │   ├── domain/            # Entities, repos, interfaces
│   │   ├── infrastructure/    # Postgres, Redis, S3, external APIs
│   │   └── presentation/connect/ # Connect-RPC handlers
│   ├── migrations/            # SQL migrations
│   └── gen/                   # Generated protobuf
├── k8s/
│   ├── backend/               # Backend deployment
│   ├── frontend/              # Frontend deployment
│   ├── frontend-marketing/    # Marketing deployment
│   ├── cnpg/                  # Database clusters
│   ├── redis/                 # Redis deployment
│   └── kratos/                # Auth helm values
├── .github/workflows/         # CI/CD pipelines
└── docs/                      # Documentation
```

## State Management

| State Type | Tool | Location |
|------------|------|----------|
| Server Data | Connect-Query | Direct hooks in components |
| Complex Flows | XState | `frontend/src/machines/` |
| UI State | Zustand | `frontend/src/store/zustand/` |
| Auth Session | Connect-Query | `whoAmI` endpoint |

**Redux is forbidden.** See CLAUDE.md for architecture rules.

## Local Development

```bash
# Start all services
cd local-dev
./start.sh

# Services available:
# - Frontend: http://localhost:3000
# - Backend: http://localhost:8080
# - Kratos: http://localhost:4433
# - MinIO Console: http://localhost:9001
# - Mailpit: http://localhost:8025
# - Adminer: http://localhost:8081
```

### Proto Generation

```bash
cd proto
buf generate
```

## Deployment

GitOps with ArgoCD. Push to `main` triggers:

1. GitHub Actions builds image
2. Tags with commit SHA
3. Updates `k8s/*/kustomization.yaml`
4. ArgoCD syncs automatically
5. PreSync runs migrations
6. RollingUpdate deploys (zero-downtime)

### Services

| Service | Replicas | Port |
|---------|----------|------|
| mirai-frontend | 3 | 3000 |
| mirai-backend | 3 | 8080 |
| mirai-marketing | 3 | 3000 |
| PostgreSQL (CNPG) | 3 | 5432 |
| Redis | 1 | 6379 |

## Reliability

- **Synchronous DB Replication**: Writes confirmed by quorum
- **RPO=0**: Zero data loss via 10G fabric
- **Presigned Uploads**: Large files bypass app pods
- **Payment Reconciliation**: Auto-heals Stripe in 15 minutes
- **Type Safety**: End-to-end from proto definitions

## Documentation

| Document | Content |
|----------|---------|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Kubernetes setup, secrets, local dev |
| [GITOPS_WORKFLOW.md](docs/GITOPS_WORKFLOW.md) | CI/CD pipeline, image tagging |
| [REDIS_CACHING.md](docs/REDIS_CACHING.md) | Cache + Asynq job queue |
| [MINIO_STORAGE.md](docs/MINIO_STORAGE.md) | Object storage, backups |
| [NFS_STORAGE_SETUP.md](docs/NFS_STORAGE_SETUP.md) | PVC provisioning |
| [MOBILE_RESPONSIVE.md](docs/MOBILE_RESPONSIVE.md) | Device detection, layouts |

## Key Commands

```bash
# Proto generation
buf generate

# Backend build check
cd backend && go build ./...

# Frontend type check
cd frontend && npm run build

# Kubernetes status
kubectl get pods -n mirai
kubectl get cluster -n mirai

# ArgoCD sync
argocd app sync mirai-backend
argocd app sync mirai-frontend
```
