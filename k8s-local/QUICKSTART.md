# Mirai k3d Local Development - Quick Start

## One-Time Setup

```bash
# 1. Install prerequisites
brew install k3d kubectl helm mkcert

# 2. Ensure Docker Desktop is running
docker info

# 3. Run setup script (takes ~10-15 minutes)
./setup.sh

# 4. Add to /etc/hosts
sudo nano /etc/hosts
# Add: 127.0.0.1 mirai.local auth.mirai.local api.mirai.local minio.mirai.local mailpit.mirai.local

# 5. Open in browser
open https://mirai.local
```

## Daily Usage

```bash
# Start cluster (morning)
./start.sh

# Check status
./status.sh

# Make code changes...
# Then rebuild and deploy
./build-local.sh backend

# View logs
./logs.sh backend

# Stop cluster (evening)
./stop.sh
```

## Scripts Summary

| Command | Purpose |
|---------|---------|
| `./setup.sh` | One-time setup (first time only) |
| `./start.sh` | Start stopped cluster |
| `./stop.sh` | Stop cluster (preserves data) |
| `./status.sh` | Show cluster status |
| `./logs.sh [service]` | View service logs |
| `./build-local.sh [service]` | Build and import images |
| `./reset.sh` | Delete cluster and all data |

## Access URLs

- **Frontend**: https://mirai.local
- **Auth**: https://auth.mirai.local
- **API**: https://api.mirai.local
- **MinIO**: https://minio.mirai.local
- **Mailpit**: https://mailpit.mirai.local

## Services

Available services for logs/build commands:

- `backend` - Backend application
- `frontend` - Frontend application
- `marketing` - Marketing site
- `postgres` - Database
- `redis` - Cache
- `minio` - Object storage
- `kratos` - Authentication
- `mailpit` - Email testing
- `all` - All services

## Common Commands

```bash
# View backend logs
./logs.sh backend

# Rebuild frontend after changes
./build-local.sh frontend

# Rebuild all with clean build
./build-local.sh all --no-cache

# View all logs
./logs.sh all

# Full reset
./reset.sh && ./setup.sh
```

## Troubleshooting

```bash
# Check status
./status.sh

# View logs
./logs.sh <service>

# View previous crash logs
./logs.sh <service> --previous

# Restart deployment
kubectl rollout restart deployment/<service> -n mirai

# Nuclear option (last resort)
./reset.sh && ./setup.sh
```

## Help

All scripts support `--help`:

```bash
./setup.sh --help
./start.sh --help
./logs.sh --help
# etc.
```

## Full Documentation

See `SCRIPTS.md` for comprehensive documentation.
