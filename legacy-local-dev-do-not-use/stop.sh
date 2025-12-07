#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.dev-pids"

echo -e "${BLUE}Stopping Mirai local development environment...${NC}"

# Kill frontend and backend processes from PID file
if [ -f "$PID_FILE" ]; then
    echo -e "${YELLOW}Stopping application processes...${NC}"
    while read -r pid; do
        if kill -0 "$pid" 2>/dev/null; then
            echo "  Stopping process $pid"
            kill "$pid" 2>/dev/null || true
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

# Also kill any leftover processes by name (in case PID file is stale)
pkill -f "go run.*mirai-backend" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true

# Stop docker-compose
cd "$SCRIPT_DIR"

if [ "$1" = "-v" ] || [ "$1" = "--volumes" ]; then
    echo -e "${YELLOW}Stopping Docker services and removing volumes...${NC}"
    docker compose down -v
    echo -e "${GREEN}All services stopped and volumes removed.${NC}"
    echo -e "${YELLOW}Note: Database will be recreated on next start.${NC}"
else
    echo -e "${YELLOW}Stopping Docker services...${NC}"
    docker compose down
    echo -e "${GREEN}All services stopped.${NC}"
    echo -e "Use ${YELLOW}./stop.sh -v${NC} to also remove volumes (reset databases)."
fi
