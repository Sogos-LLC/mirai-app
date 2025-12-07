# Mirai Local Development Environment

This directory contains everything needed to run Mirai locally with full production parity.

## Prerequisites

- Docker and Docker Compose
- Node.js (v18+)
- Go (v1.21+)

## Quick Start

```bash
# First time setup
cp .env.example .env

# Start everything
./start.sh

# Stop everything
./stop.sh

# Reset databases (removes all data)
./stop.sh -v
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | Main app (mirai.sogos.io equivalent) |
| Marketing | http://localhost:3001 | Marketing site (get-mirai.sogos.io equivalent) |
| Backend API | http://localhost:8080 | Go/Gin REST API |
| Kratos (Auth) | http://localhost:4433 | Ory Kratos public API |
| Kratos Admin | http://localhost:4434 | Ory Kratos admin API |
| Mailpit | http://localhost:8025 | Email testing UI |
| MinIO Console | http://localhost:9001 | S3 storage UI |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Cache |

## Architecture

```
Docker Compose (services):
├── PostgreSQL (shared by Kratos + Mirai)
├── Ory Kratos (authentication)
├── Redis (caching)
├── MinIO (S3 storage)
├── Mailpit (email testing)
└── Marketing site (Docker build of frontend)

Native (hot-reload):
├── Frontend (npm run dev on port 3000)
└── Backend (go run on port 8080)
```

**User Flow (mirrors production):**
1. Visit `localhost:3000` → redirected to marketing (`localhost:3001`)
2. Click "Login" on marketing → redirected to `localhost:3000/auth/login`
3. Login via Kratos → redirected to `localhost:3000/dashboard`

## Environment Variables

The `.env` file contains Docker Compose variables. The frontend and backend use their own `.env.local` files:

- `frontend/.env.local` - Frontend environment (API URLs, storage, cache)
- `backend/.env.local` - Backend environment (database, CORS)

## Testing Email

When you register or recover a password, emails are captured by Mailpit.
Open http://localhost:8025 to view them.

## Testing Storage

MinIO provides S3-compatible storage. Access the console at http://localhost:9001 with:
- Username: minioadmin
- Password: minioadmin

## Database Access

Connect to PostgreSQL:
```bash
docker exec -it mirai-postgres psql -U mirai -d mirai
```

Or for Kratos database:
```bash
docker exec -it mirai-postgres psql -U kratos -d kratos
```

## Troubleshooting

**Port already in use:**
```bash
# Find what's using a port
lsof -i :3000

# Stop all containers
./stop.sh
```

**Database issues:**
```bash
# Reset everything
./stop.sh -v
./start.sh
```

**Marketing site looks wrong after switching branches:**
```bash
# Rebuild the marketing Docker image
docker compose build --no-cache marketing
docker compose up -d marketing
```

**Kratos not starting:**
Check if migrations completed:
```bash
docker logs mirai-kratos-migrate
```

## Isolation from Production

This local setup is completely isolated from production:
- Different cookie domain (`localhost` vs `sogos.io`)
- Separate databases (local PostgreSQL vs K8s PostgreSQL)
- Different credentials (hardcoded dev values vs K8s secrets)
- Local MinIO bucket vs production MinIO
