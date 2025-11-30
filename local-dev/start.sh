#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# PID file for cleanup
PID_FILE="$SCRIPT_DIR/.dev-pids"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down...${NC}"

    # Kill frontend and backend processes
    if [ -f "$PID_FILE" ]; then
        while read -r pid; do
            if kill -0 "$pid" 2>/dev/null; then
                echo "Stopping process $pid"
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi

    # Stop docker-compose
    echo -e "${BLUE}Stopping Docker services...${NC}"
    cd "$SCRIPT_DIR"
    docker compose down

    echo -e "${GREEN}Cleanup complete${NC}"
    exit 0
}

# Set trap for cleanup
trap cleanup SIGINT SIGTERM

# Wait for service to be healthy
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=${3:-30}
    local attempt=1

    echo -e "${BLUE}Waiting for $name to be ready...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null | grep -q "200\|401\|404"; then
            echo -e "${GREEN}$name is ready!${NC}"
            return 0
        fi
        echo "  Attempt $attempt/$max_attempts..."
        sleep 2
        ((attempt++))
    done
    echo -e "${RED}$name failed to start after $max_attempts attempts${NC}"
    return 1
}

# Wait for PostgreSQL
wait_for_postgres() {
    local max_attempts=${1:-30}
    local attempt=1

    echo -e "${BLUE}Waiting for PostgreSQL to be ready...${NC}"
    while [ $attempt -le $max_attempts ]; do
        if docker exec mirai-postgres pg_isready -U postgres >/dev/null 2>&1; then
            echo -e "${GREEN}PostgreSQL is ready!${NC}"
            return 0
        fi
        echo "  Attempt $attempt/$max_attempts..."
        sleep 2
        ((attempt++))
    done
    echo -e "${RED}PostgreSQL failed to start${NC}"
    return 1
}

# Main script
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Mirai Local Development Environment ${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command -v go &> /dev/null; then
    echo -e "${RED}Error: Go is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}All prerequisites found${NC}"
echo ""

# Check for .env file
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${YELLOW}No .env file found. Creating from .env.example...${NC}"
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo -e "${GREEN}Created .env file. Edit it if you need to customize values.${NC}"
fi

# Load environment variables
echo -e "${BLUE}Loading environment from .env...${NC}"
export $(grep -v '^#' "$SCRIPT_DIR/.env" | xargs)

# Build marketing image if it doesn't exist
if ! docker image inspect local-dev-marketing:latest >/dev/null 2>&1; then
    echo -e "${YELLOW}Building marketing site image (first run only)...${NC}"
    docker compose build marketing
fi

# Start Docker services
echo -e "${BLUE}Starting Docker services...${NC}"
cd "$SCRIPT_DIR"
docker compose up -d

# Wait for services
echo ""
wait_for_postgres 30
sleep 2  # Extra time for init scripts

wait_for_service "Kratos" "http://localhost:4433/health/ready" 60

# Check Redis
if docker exec mirai-redis redis-cli ping >/dev/null 2>&1; then
    echo -e "${GREEN}Redis is ready!${NC}"
fi

# Check MinIO
wait_for_service "MinIO" "http://localhost:9000/minio/health/live" 30 || true

echo ""
echo -e "${GREEN}Docker services are ready!${NC}"
echo ""

# Install frontend dependencies if needed
if [ ! -d "$PROJECT_ROOT/frontend/node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    cd "$PROJECT_ROOT/frontend"
    npm install
fi

# Create frontend .env.local if it doesn't exist
if [ ! -f "$PROJECT_ROOT/frontend/.env.local" ]; then
    echo -e "${YELLOW}Creating frontend .env.local from example...${NC}"
    cp "$PROJECT_ROOT/frontend/.env.local.example" "$PROJECT_ROOT/frontend/.env.local"
fi

# Clear PID file
> "$PID_FILE"

# Start backend
echo -e "${BLUE}Starting Go backend...${NC}"
cd "$PROJECT_ROOT/backend"

# Run backend with its own environment (not exported to shell)
PORT=8080 \
DATABASE_URL="postgres://mirai:mirailocal@localhost:5432/mirai?sslmode=disable" \
KRATOS_URL="http://localhost:4433" \
KRATOS_ADMIN_URL="http://localhost:4434" \
ALLOWED_ORIGIN="http://localhost:3000" \
FRONTEND_URL="http://localhost:3000" \
BACKEND_URL="http://localhost:8080" \
COOKIE_SECURE="false" \
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}" \
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}" \
STRIPE_STARTER_PRICE_ID="${STRIPE_STARTER_PRICE_ID:-}" \
STRIPE_PRO_PRICE_ID="${STRIPE_PRO_PRICE_ID:-}" \
go run ./cmd/server/main.go &
BACKEND_PID=$!
echo $BACKEND_PID >> "$PID_FILE"
echo -e "  Backend PID: $BACKEND_PID"

# Give backend a moment to start
sleep 2

# Start frontend on port 3000
echo -e "${BLUE}Starting Next.js frontend...${NC}"
cd "$PROJECT_ROOT/frontend"
PORT=3000 npm run dev &
FRONTEND_PID=$!
echo $FRONTEND_PID >> "$PID_FILE"
echo -e "  Frontend PID: $FRONTEND_PID"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}  Development servers are running!   ${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo -e "  ${BLUE}Frontend:${NC}      http://localhost:3000"
echo -e "  ${BLUE}Marketing:${NC}     http://localhost:3001"
echo -e "  ${BLUE}Backend API:${NC}   http://localhost:8080"
echo -e "  ${BLUE}Kratos Auth:${NC}   http://localhost:4433"
echo -e "  ${BLUE}Mailpit:${NC}       http://localhost:8025"
echo -e "  ${BLUE}MinIO Console:${NC} http://localhost:9001"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services"
echo ""

# Wait for processes
wait
