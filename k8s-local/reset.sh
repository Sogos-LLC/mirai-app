#!/usr/bin/env bash
set -e

# Mirai k3d Cluster Reset Script
# Completely removes the cluster and all data

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Show help
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Mirai k3d Cluster Reset Script"
    echo ""
    echo "Usage: ./reset.sh"
    echo ""
    echo "WARNING: This script completely deletes the k3d cluster and all data."
    echo "This action cannot be undone!"
    echo ""
    echo "You will be prompted for confirmation before deletion."
    exit 0
fi

CLUSTER_NAME="mirai-local"

log_warning "======================================"
log_warning "CLUSTER RESET WARNING"
log_warning "======================================"
echo ""
log_warning "This will completely delete the '${CLUSTER_NAME}' cluster and ALL data:"
echo "  - All Kubernetes resources"
echo "  - All database data (PostgreSQL)"
echo "  - All file storage (MinIO)"
echo "  - All user sessions and authentication data (Kratos)"
echo "  - All cached data (Redis)"
echo ""
log_error "THIS ACTION CANNOT BE UNDONE!"
echo ""

# Prompt for confirmation
read -p "Are you sure you want to delete the cluster? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    log_info "Cluster deletion cancelled."
    exit 0
fi

# Second confirmation for extra safety
read -p "Type 'DELETE' to confirm: " -r
echo

if [[ $REPLY != "DELETE" ]]; then
    log_info "Cluster deletion cancelled."
    exit 0
fi

# Check if cluster exists
if ! k3d cluster list | grep -q "${CLUSTER_NAME}"; then
    log_warning "Cluster '${CLUSTER_NAME}' does not exist. Nothing to delete."
    exit 0
fi

# Kill any running port-forwards
log_info "Stopping any running port-forwards..."
pkill -f "port-forward.*traefik.*9000" 2>/dev/null || true
pkill -f "port-forward.*mirai" 2>/dev/null || true

# Delete the cluster
log_info "Deleting cluster '${CLUSTER_NAME}'..."
k3d cluster delete "${CLUSTER_NAME}"

# Clean up any lingering Docker resources
log_info "Cleaning up Docker resources..."
docker volume rm $(docker volume ls -q --filter "label=app=k3d" 2>/dev/null) 2>/dev/null || true
docker network rm k3d-${CLUSTER_NAME} 2>/dev/null || true

log_success "Cluster deleted successfully"
echo ""
log_info "To create a fresh cluster, run:"
echo "  ./setup.sh"
echo ""
