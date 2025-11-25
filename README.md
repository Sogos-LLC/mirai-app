# Mirai

A SaaS learning platform for creating and managing team training courses. Built with Next.js, Go, and Ory Kratos authentication, deployed on Kubernetes via GitOps.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Cloudflare Tunnel                               │
├──────────────────┬──────────────────┬─────────────────┬─────────────────┤
│ get-mirai.sogos.io│ mirai.sogos.io   │ mirai-api.sogos.io│ mirai-auth.sogos.io│
│ Marketing Site   │ App (Auth'd)     │ Backend API     │ Kratos API      │
└──────────────────┴──────────────────┴─────────────────┴─────────────────┘
         │                  │                  │                 │
         ▼                  ▼                  ▼                 ▼
   mirai-marketing    mirai-frontend    mirai-backend        kratos
    (Next.js)          (Next.js)          (Go/Gin)        (Ory Kratos)
         │                  │                  │                 │
         └──────────────────┴─────────┬────────┴─────────────────┘
                                      ▼
                               PostgreSQL (x2)
                            (App DB + Kratos DB)
```

## Domains

| Domain | Purpose | Deployment |
|--------|---------|------------|
| `get-mirai.sogos.io` | Marketing site, pricing, landing page | `mirai-marketing` |
| `mirai.sogos.io` | Authenticated app + auth flows | `mirai-frontend` |
| `mirai-api.sogos.io` | REST API | `mirai-backend` |
| `mirai-auth.sogos.io` | Ory Kratos authentication API | `kratos` |

## Project Structure

```
mirai-app/
├── frontend/                    # Next.js application
│   ├── Dockerfile              # Full app build
│   ├── Dockerfile.marketing    # Marketing-only build
│   └── src/
│       ├── app/(main)/         # Authenticated routes
│       ├── app/(public)/       # Public routes (landing, auth)
│       ├── components/
│       ├── lib/kratos/         # Kratos client
│       ├── middleware.ts       # App routing logic
│       └── middleware.marketing.ts
├── backend/                    # Go API
│   ├── Dockerfile
│   ├── cmd/server/            # Entry point
│   └── internal/
│       ├── handlers/          # HTTP handlers
│       ├── middleware/        # Auth middleware
│       ├── models/            # Data models
│       └── repository/        # Database layer
├── k8s/                       # Kubernetes manifests
│   ├── frontend/              # Main app deployment
│   ├── frontend-marketing/    # Marketing site deployment
│   ├── backend/               # API deployment
│   ├── kratos/                # Ory Kratos Helm values
│   ├── mirai-db/              # App PostgreSQL
│   └── redis/                 # Redis caching
├── docs/                      # Documentation
│   ├── AUTHENTICATION_ARCHITECTURE.md
│   ├── DEPLOYMENT.md
│   ├── GITOPS_WORKFLOW.md
│   └── ...
└── .github/workflows/         # CI/CD
    ├── build-frontend.yml
    ├── build-marketing.yml
    └── build-backend.yml
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 14 (App Router), Redux Toolkit, Tailwind CSS |
| Backend | Go, Gin framework |
| Authentication | Ory Kratos (headless auth) |
| Database | PostgreSQL 15 |
| Caching | Redis |
| Storage | MinIO (S3-compatible) |
| Infrastructure | Kubernetes (Talos), ArgoCD, Cloudflare Tunnel |

## Development

### Frontend
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
```

### Backend
```bash
cd backend
go mod download
go run cmd/server/main.go
# Runs on http://localhost:8080
```

### Environment Variables

Frontend (`frontend/.env.local`):
```
KRATOS_PUBLIC_URL=http://localhost:4433
NEXT_PUBLIC_KRATOS_BROWSER_URL=http://localhost:4433
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_LANDING_URL=http://localhost:3001
```

Backend (`backend/.env`):
```
DATABASE_URL=postgres://user:pass@localhost:5432/mirai
KRATOS_PUBLIC_URL=http://localhost:4433
```

## Deployment

Deployed via GitOps with ArgoCD. Three separate CI/CD pipelines:

### CI/CD Flow

```
Push to main
     │
     ├─► build-frontend.yml ─► ghcr.io/.../mirai-frontend ─► k8s/frontend/
     │
     ├─► build-marketing.yml ─► ghcr.io/.../mirai-marketing ─► k8s/frontend-marketing/
     │
     └─► build-backend.yml ─► ghcr.io/.../mirai-backend ─► k8s/backend/
                                                                │
                                                                ▼
                                                    ArgoCD auto-sync
```

### ArgoCD Applications

- `mirai-frontend` - Main authenticated app
- `mirai-marketing` - Marketing site
- `mirai-backend` - Go API

### Manual Deploy

```bash
# Apply all resources
kubectl apply -k k8s/

# Or individual components
kubectl apply -k k8s/frontend/
kubectl apply -k k8s/frontend-marketing/
kubectl apply -k k8s/backend/
```

## Authentication Flow

1. User visits `get-mirai.sogos.io` (marketing site)
2. Clicks "Sign In" → redirected to `mirai.sogos.io/auth/login`
3. Login form submits to Kratos at `mirai-auth.sogos.io`
4. On success, session cookie set on `.sogos.io` domain
5. User redirected to `mirai.sogos.io/dashboard`

Session cookie is shared across all subdomains for SSO.

## Documentation

- [Authentication Architecture](docs/AUTHENTICATION_ARCHITECTURE.md) - Domain setup, auth flows, Kratos config
- [Deployment Guide](docs/DEPLOYMENT.md) - Kubernetes deployment steps
- [GitOps Workflow](docs/GITOPS_WORKFLOW.md) - CI/CD pipeline details
- [Redis Caching](docs/REDIS_CACHING.md) - Caching strategy
- [MinIO Storage](docs/MINIO_STORAGE.md) - Object storage setup

## Related Repositories

- [homelab-platform](https://github.com/sojohnnysaid/homelab-platform) - Platform infrastructure, ArgoCD apps, Cloudflare tunnel config
- [homelab-talos](https://github.com/sojohnnysaid/homelab-talos) - Talos Linux cluster configuration
